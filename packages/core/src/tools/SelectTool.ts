import { Tool } from './Tool'
import type { PointerData } from '../types'
import { VectorLayer } from '../layers/VectorLayer'
import type { BezierAnchor } from '../layers/VectorLayer'
import type { Camera } from '../Camera'

type SelectState =
  | { kind: 'idle' }
  | { kind: 'selecting'; sx0: number; sy0: number; sx1: number; sy1: number }
  | { kind: 'selected'; ids: string[] }
  | { kind: 'moving'; ids: string[]; originX: number; originY: number; startWX: number; startWY: number }
  | { kind: 'editing'; id: string }
  | { kind: 'dragging-point'; id: string; anchorIdx: number; part: 'anchor' | 'handleIn' | 'handleOut' }

const HANDLE_RADIUS_SCREEN = 6   // px — how close to click a handle
const HANDLE_RADIUS_HIT = 10     // px — hit test tolerance

export class SelectTool extends Tool {
  state: SelectState = { kind: 'idle' }
  mode: 'rect' | 'lasso' = 'rect'

  private _overlayPending = false
  private _afterRenderUnsub: (() => void) | null = null
  private _lastDownTime = 0
  private _lastDownX = 0
  private _lastDownY = 0

  onActivate(): void {
    if (this.board) this.board.canvas.style.cursor = 'default'
    this._afterRenderUnsub = this.board?.hooks.afterRender.tap('select', () => {
      // Only redraw when there's something to show (not every idle frame)
      if (this.state.kind !== 'idle') this.scheduleOverlayRedraw()
    }) ?? null
  }

  onDeactivate(): void {
    if (this.board) this.board.canvas.style.cursor = ''
    this._afterRenderUnsub?.()
    this._afterRenderUnsub = null
    this.board?.clearStrokeCanvas()
    this.state = { kind: 'idle' }
  }

  onPointerDown(e: PointerData): void {
    if (!this.board) return
    const board = this.board
    const layer = board.getActiveLayer()
    const isVec = layer instanceof VectorLayer
    const now = Date.now()
    const doubleClick = now - this._lastDownTime < 400 &&
      Math.abs(e.x - this._lastDownX) < 8 &&
      Math.abs(e.y - this._lastDownY) < 8
    this._lastDownTime = now
    this._lastDownX = e.x
    this._lastDownY = e.y

    // ── In edit mode: check if clicking a handle ────────────────────────────
    if (this.state.kind === 'editing' && isVec) {
      const hit = this.hitTestHandle(e.x, e.y, this.state.id, layer as VectorLayer)
      if (hit) {
        this.state = { kind: 'dragging-point', ...hit }
        return
      }
      // Click outside edit area → exit edit mode
      this.state = { kind: 'idle' }
    }

    // ── Check if clicking on an existing vector element ─────────────────────
    if (isVec) {
      const vl = layer as VectorLayer
      const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
      const lx = world.x - vl.transform.x
      const ly = world.y - vl.transform.y
      const hitRadius = HANDLE_RADIUS_HIT / board.camera.zoom

      const hitId = vl.hitTest(lx, ly, hitRadius)
      if (hitId) {
        if (doubleClick) {
          // Enter edit mode (only for paths with BezierAnchors)
          const path = vl.paths.find((p) => p.id === hitId)
          if (path) {
            this.state = { kind: 'editing', id: hitId }
            this.scheduleOverlayRedraw()
            return
          }
        }
        // Select + prepare to move
        this.state = { kind: 'moving', ids: [hitId], originX: lx, originY: ly, startWX: lx, startWY: ly }
        this.scheduleOverlayRedraw()
        return
      }
    }

    // ── Start rectangle selection ───────────────────────────────────────────
    this.state = { kind: 'selecting', sx0: e.x, sy0: e.y, sx1: e.x, sy1: e.y }
    this.scheduleOverlayRedraw()
  }

  onPointerMove(e: PointerData): void {
    if (!this.board) return
    const board = this.board

    if (this.state.kind === 'selecting') {
      this.state.sx1 = e.x
      this.state.sy1 = e.y
      this.scheduleOverlayRedraw()
      return
    }

    if (this.state.kind === 'moving') {
      const layer = board.getActiveLayer()
      if (!(layer instanceof VectorLayer)) return
      const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
      const lx = world.x - layer.transform.x
      const ly = world.y - layer.transform.y
      const dx = lx - this.state.originX
      const dy = ly - this.state.originY
      for (const id of this.state.ids) layer.translateElement(id, dx, dy)
      this.state.originX = lx
      this.state.originY = ly
      board.markDirty()
      this.scheduleOverlayRedraw()
      return
    }

    if (this.state.kind === 'dragging-point') {
      const st = this.state  // capture for TS narrowing
      const layer = board.getActiveLayer()
      if (!(layer instanceof VectorLayer)) return
      const path = layer.paths.find((p) => p.id === st.id)
      if (!path) return
      const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
      const lx = world.x - layer.transform.x
      const ly = world.y - layer.transform.y
      const anchor = path.anchors[st.anchorIdx]
      if (!anchor) return

      if (st.part === 'anchor') {
        const dx = lx - anchor.x, dy = ly - anchor.y
        if (anchor.handleIn) { anchor.handleIn.x += dx; anchor.handleIn.y += dy }
        if (anchor.handleOut) { anchor.handleOut.x += dx; anchor.handleOut.y += dy }
        anchor.x = lx; anchor.y = ly
      } else if (st.part === 'handleIn' && anchor.handleIn) {
        anchor.handleIn.x = lx; anchor.handleIn.y = ly
        if (anchor.type === 'smooth' && anchor.handleOut) {
          const dx = anchor.x - lx, dy = anchor.y - ly
          anchor.handleOut.x = anchor.x + dx; anchor.handleOut.y = anchor.y + dy
        }
      } else if (st.part === 'handleOut' && anchor.handleOut) {
        anchor.handleOut.x = lx; anchor.handleOut.y = ly
        if (anchor.type === 'smooth' && anchor.handleIn) {
          const dx = anchor.x - lx, dy = anchor.y - ly
          anchor.handleIn.x = anchor.x + dx; anchor.handleIn.y = anchor.y + dy
        }
      }
      board.markDirty()
      this.scheduleOverlayRedraw()
      return
    }
  }

  onPointerUp(_e: PointerData): void {
    if (!this.board) return
    const board = this.board
    const layer = board.getActiveLayer()

    if (this.state.kind === 'selecting') {
      const { sx0, sy0, sx1, sy1 } = this.state
      const minSx = Math.min(sx0, sx1), minSy = Math.min(sy0, sy1)
      const maxSx = Math.max(sx0, sx1), maxSy = Math.max(sy0, sy1)

      if (layer instanceof VectorLayer && (maxSx - minSx > 4 || maxSy - minSy > 4)) {
        const tl = board.camera.screenToWorld(minSx, minSy, board.logicalWidth, board.logicalHeight)
        const br = board.camera.screenToWorld(maxSx, maxSy, board.logicalWidth, board.logicalHeight)
        const lx = tl.x - layer.transform.x
        const ly = tl.y - layer.transform.y
        const ids = layer.hitTestRect(lx, ly, br.x - tl.x, br.y - tl.y)
        this.state = ids.length > 0 ? { kind: 'selected', ids } : { kind: 'idle' }
      } else {
        this.state = { kind: 'idle' }
      }
    } else if (this.state.kind === 'moving' || this.state.kind === 'dragging-point') {
      const { ids } = this.state.kind === 'moving' ? this.state : { ids: [this.state.id] }
      this.state = { kind: 'selected', ids }
    }

    this.scheduleOverlayRedraw()
  }

  onPointerCancel(_e: PointerData): void {
    this.state = { kind: 'idle' }
    this.scheduleOverlayRedraw()
  }

  /** Delete all selected elements. */
  deleteSelected(): void {
    const layer = this.board?.getActiveLayer()
    if (!(layer instanceof VectorLayer)) return
    const st = this.state
    if (st.kind !== 'selected' && st.kind !== 'editing') return
    const ids = st.kind === 'selected' ? st.ids : [st.id]
    for (const id of ids) { layer.removeStroke(id); layer.removePath(id) }
    this.state = { kind: 'idle' }
    this.board?.markDirty()
    this.scheduleOverlayRedraw()
  }

  // ── Overlay rendering ─────────────────────────────────────────────────────

  private scheduleOverlayRedraw(): void {
    if (this._overlayPending) return
    this._overlayPending = true
    requestAnimationFrame(() => {
      this._overlayPending = false
      this.redrawOverlay()
    })
  }

  redrawOverlay(): void {
    const board = this.board
    if (!board?.strokeCtx) return
    const { strokeCtx } = board
    const dpr = window.devicePixelRatio ?? 1
    strokeCtx.clearRect(0, 0, strokeCtx.canvas.width, strokeCtx.canvas.height)

    if (this.state.kind === 'idle') return

    strokeCtx.save()
    strokeCtx.scale(dpr, dpr)

    const W = board.logicalWidth
    const H = board.logicalHeight

    // ── Selection rectangle ───────────────────────────────────────────────
    if (this.state.kind === 'selecting') {
      const { sx0, sy0, sx1, sy1 } = this.state
      strokeCtx.strokeStyle = 'rgba(99,179,237,0.9)'
      strokeCtx.lineWidth = 1.5
      strokeCtx.setLineDash([5, 4])
      strokeCtx.strokeRect(
        Math.min(sx0, sx1), Math.min(sy0, sy1),
        Math.abs(sx1 - sx0), Math.abs(sy1 - sy0),
      )
      strokeCtx.fillStyle = 'rgba(99,179,237,0.08)'
      strokeCtx.fillRect(
        Math.min(sx0, sx1), Math.min(sy0, sy1),
        Math.abs(sx1 - sx0), Math.abs(sy1 - sy0),
      )
    }

    // ── Selected element outlines ─────────────────────────────────────────
    const layer = board.getActiveLayer()
    if ((this.state.kind === 'selected' || this.state.kind === 'moving') && layer instanceof VectorLayer) {
      const ids = this.state.ids
      for (const id of ids) {
        const bounds = layer.getBounds(id)
        if (!bounds) continue
        const tl = board.camera.worldToScreen(
          bounds.x + layer.transform.x, bounds.y + layer.transform.y, W, H,
        )
        const br = board.camera.worldToScreen(
          bounds.x + bounds.w + layer.transform.x, bounds.y + bounds.h + layer.transform.y, W, H,
        )
        const pad = 6
        strokeCtx.strokeStyle = 'rgba(99,179,237,0.8)'
        strokeCtx.lineWidth = 1.5
        strokeCtx.setLineDash([])
        strokeCtx.strokeRect(tl.x - pad, tl.y - pad, br.x - tl.x + pad * 2, br.y - tl.y + pad * 2)
      }
    }

    // ── Edit mode handles ─────────────────────────────────────────────────
    const editSt = this.state
    if (editSt.kind === 'editing' || editSt.kind === 'dragging-point') {
      const id = editSt.id
      if (layer instanceof VectorLayer) {
        const path = layer.paths.find((p) => p.id === id)
        if (path) {
          this.drawEditHandles(strokeCtx, path.anchors, layer, board.camera, W, H)
        }
      }
    }

    strokeCtx.restore()
  }

  private drawEditHandles(
    ctx: CanvasRenderingContext2D,
    anchors: BezierAnchor[],
    layer: VectorLayer,
    camera: Camera,
    W: number,
    H: number,
  ): void {
    const toScreen = (wx: number, wy: number) =>
      camera.worldToScreen(wx + layer.transform.x, wy + layer.transform.y, W, H)

    // Draw handle lines first (behind circles)
    ctx.strokeStyle = 'rgba(99,179,237,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    for (const a of anchors) {
      const as = toScreen(a.x, a.y)
      if (a.handleIn) {
        const hs = toScreen(a.handleIn.x, a.handleIn.y)
        ctx.beginPath(); ctx.moveTo(as.x, as.y); ctx.lineTo(hs.x, hs.y); ctx.stroke()
      }
      if (a.handleOut) {
        const hs = toScreen(a.handleOut.x, a.handleOut.y)
        ctx.beginPath(); ctx.moveTo(as.x, as.y); ctx.lineTo(hs.x, hs.y); ctx.stroke()
      }
    }

    // Handle squares
    ctx.setLineDash([])
    ctx.lineWidth = 1.5
    for (const a of anchors) {
      const drawHandle = (hx: number, hy: number) => {
        const hs = toScreen(hx, hy)
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = 'rgba(99,179,237,0.9)'
        ctx.beginPath()
        ctx.rect(hs.x - 4, hs.y - 4, 8, 8)
        ctx.fill(); ctx.stroke()
      }
      if (a.handleIn) drawHandle(a.handleIn.x, a.handleIn.y)
      if (a.handleOut) drawHandle(a.handleOut.x, a.handleOut.y)
    }

    // Anchor circles (drawn on top)
    for (const a of anchors) {
      const as = toScreen(a.x, a.y)
      ctx.beginPath()
      ctx.arc(as.x, as.y, HANDLE_RADIUS_SCREEN, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = 'rgba(99,179,237,0.9)'
      ctx.lineWidth = 2
      ctx.fill(); ctx.stroke()
    }
  }

  // ── Handle hit testing ────────────────────────────────────────────────────

  private hitTestHandle(
    sx: number, sy: number, id: string, layer: VectorLayer,
  ): { id: string; anchorIdx: number; part: 'anchor' | 'handleIn' | 'handleOut' } | null {
    const board = this.board!
    const W = board.logicalWidth, H = board.logicalHeight
    const path = layer.paths.find((p) => p.id === id)
    if (!path) return null

    const toScreen = (wx: number, wy: number) =>
      board.camera.worldToScreen(wx + layer.transform.x, wy + layer.transform.y, W, H)

    const r2 = HANDLE_RADIUS_HIT * HANDLE_RADIUS_HIT
    const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      (a.x - b.x) ** 2 + (a.y - b.y) ** 2

    for (let i = 0; i < path.anchors.length; i++) {
      const a = path.anchors[i]!
      const as = toScreen(a.x, a.y)
      if (dist2(as, { x: sx, y: sy }) <= r2) return { id, anchorIdx: i, part: 'anchor' }
      if (a.handleIn) {
        const hs = toScreen(a.handleIn.x, a.handleIn.y)
        if (dist2(hs, { x: sx, y: sy }) <= r2) return { id, anchorIdx: i, part: 'handleIn' }
      }
      if (a.handleOut) {
        const hs = toScreen(a.handleOut.x, a.handleOut.y)
        if (dist2(hs, { x: sx, y: sy }) <= r2) return { id, anchorIdx: i, part: 'handleOut' }
      }
    }
    return null
  }
}
