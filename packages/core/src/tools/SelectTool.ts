import { Tool } from './Tool'
import type { PointerData } from '../types'
import { VectorLayer } from '../layers/VectorLayer'
import type { BezierAnchor, VectorStroke, VectorPath } from '../layers/VectorLayer'
import type { Camera } from '../Camera'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SelectMode = 'rect'   // 'lasso' is future work
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const ROTATE_HANDLE_OFFSET = 22   // screen px above the top edge
const ROTATE_SNAP_DEG = 15        // snap angle when shift is held

interface Bounds { x: number; y: number; w: number; h: number }

interface ElementSnapshot {
  id: string
  strokePoints?: Array<{ x: number; y: number; pressure: number }>
  pathAnchors?: BezierAnchor[]
}

const DRAG_THRESHOLD = 4   // px of movement before rect-select activates

type SelectState =
  | { kind: 'idle' }
  // Pointer is down on empty space — deselect on release, begin rect-select on drag
  | { kind: 'pending-select'; sx: number; sy: number }
  | { kind: 'selecting'; sx0: number; sy0: number; sx1: number; sy1: number; additive: boolean }
  | { kind: 'selected'; ids: string[] }
  | { kind: 'moving'; ids: string[]; startLX: number; startLY: number; snaps: ElementSnapshot[]; hasMoved: boolean; isDupe?: boolean }
  | { kind: 'resizing'; ids: string[]; handle: ResizeHandle; startSX: number; startSY: number; startBounds: Bounds; snaps: ElementSnapshot[]; shiftLock: boolean; altCenter: boolean }
  | { kind: 'rotating'; ids: string[]; centerLX: number; centerLY: number; startAngle: number; snaps: ElementSnapshot[] }
  | { kind: 'editing'; id: string }
  | { kind: 'dragging-point'; id: string; anchorIdx: number; part: 'anchor' | 'handleIn' | 'handleOut'; snap: ElementSnapshot }
  | { kind: 'editing-stroke'; id: string }
  | { kind: 'dragging-stroke-point'; id: string; pointIdx: number; snap: ElementSnapshot }

const HANDLE_SIZE = 8        // screen px, half-size of each resize handle square
const HIT_RADIUS = 10        // screen px, pointer hit tolerance for handles/elements
const DOUBLE_CLICK_MS = 350
const DOUBLE_CLICK_DIST = 10

// ─── SelectTool ───────────────────────────────────────────────────────────────

export class SelectTool extends Tool {
  state: SelectState = { kind: 'idle' }
  mode: SelectMode = 'rect'

  private _clipboard: { strokes: VectorStroke[]; paths: VectorPath[] } | null = null
  private _overlayPending = false
  private _afterRenderUnsub: (() => void) | null = null
  private _lastDownTime = 0
  private _lastDownX = 0
  private _lastDownY = 0
  private _altDown = false
  private _shiftDown = false
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null
  private _onKeyUp: ((e: KeyboardEvent) => void) | null = null

  onActivate(): void {
    if (this.board) this.board.canvas.style.cursor = 'default'
    this._afterRenderUnsub = this.board?.hooks.afterRender.tap('select', () => {
      if (this.state.kind !== 'idle') this.scheduleOverlayRedraw()
    }) ?? null
    // Track Alt key for bezier handle creation; Shift for rotate snap.
    this._onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.key === 'Alt') this._altDown = true
      if (e.shiftKey || e.key === 'Shift') this._shiftDown = true
    }
    this._onKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) this._altDown = false
      if (!e.shiftKey) this._shiftDown = false
    }
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
  }

  onDeactivate(): void {
    if (this.board) this.board.canvas.style.cursor = ''
    this._afterRenderUnsub?.(); this._afterRenderUnsub = null
    this.board?.clearStrokeCanvas()
    this.state = { kind: 'idle' }
    this._altDown = false
    this._shiftDown = false
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown)
    if (this._onKeyUp) window.removeEventListener('keyup', this._onKeyUp)
    this._onKeyDown = null; this._onKeyUp = null
  }

  onPointerDown(e: PointerData): void {
    if (!this.board) return
    const board = this.board
    const layer = board.getActiveLayer()
    const isVec = layer instanceof VectorLayer

    const now = Date.now()
    const doubleClick =
      now - this._lastDownTime < DOUBLE_CLICK_MS &&
      Math.hypot(e.x - this._lastDownX, e.y - this._lastDownY) < DOUBLE_CLICK_DIST
    this._lastDownTime = now; this._lastDownX = e.x; this._lastDownY = e.y

    const additive = e.pressure === 0 ? false : false  // pressure isn't shift — use e.shiftKey when available

    // ── In edit mode: check handles first ──────────────────────────────────
    if (this.state.kind === 'editing' && isVec) {
      const hit = this.hitTestHandle(e.x, e.y, this.state.id, layer as VectorLayer)
      if (hit) {
        const snap = this.snapshotElement(layer as VectorLayer, hit.id)
        this.state = { kind: 'dragging-point', snap, ...hit }
        return
      }
      // Clicking outside handles: check if hitting a different element or empty space
      const vl = layer as VectorLayer
      const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
      const lx = world.x - vl.transform.x, ly = world.y - vl.transform.y
      const hitId = vl.hitTest(lx, ly, HIT_RADIUS / board.camera.zoom)
      if (hitId && hitId !== this.state.id) {
        this.state = { kind: 'selected', ids: [hitId] }
      } else {
        this.state = { kind: 'idle' }
      }
      board.canvas.style.cursor = 'default'
      this.scheduleOverlayRedraw()
      return
    }
    if (this.state.kind === 'dragging-point') return

    // ── In stroke-edit mode: check stroke points ───────────────────────────
    if (this.state.kind === 'editing-stroke' && isVec) {
      const vl = layer as VectorLayer
      const stroke = vl.strokes.find((s) => s.id === (this.state as { kind: 'editing-stroke'; id: string }).id)
      if (stroke) {
        const ptIdx = this.hitTestStrokePoint(e.x, e.y, stroke, vl)
        if (ptIdx !== null) {
          const snap = this.snapshotElement(vl, stroke.id)
          this.state = { kind: 'dragging-stroke-point', id: stroke.id, pointIdx: ptIdx, snap }
          return
        }
      }
      // Click outside stroke points: check if hitting another element or exit
      const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
      const lx = world.x - (layer as VectorLayer).transform.x, ly = world.y - (layer as VectorLayer).transform.y
      const hitId = vl.hitTest(lx, ly, HIT_RADIUS / board.camera.zoom)
      if (hitId && hitId !== (this.state as { kind: 'editing-stroke'; id: string }).id) {
        this.state = { kind: 'selected', ids: [hitId] }
      } else {
        this.state = { kind: 'idle' }
      }
      board.canvas.style.cursor = 'default'
      this.scheduleOverlayRedraw()
      return
    }
    if (this.state.kind === 'dragging-stroke-point') return

    // ── Check rotate handle first (sits above the bounds) ────────────────
    if (this.state.kind === 'selected' && isVec) {
      const ids = this.state.ids
      const bounds = this.getCombinedBounds(layer as VectorLayer, ids)
      if (bounds && this.hitTestRotateHandle(e.x, e.y, bounds, layer as VectorLayer)) {
        const cx = bounds.x + bounds.w / 2
        const cy = bounds.y + bounds.h / 2
        const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
        const lx = world.x - (layer as VectorLayer).transform.x
        const ly = world.y - (layer as VectorLayer).transform.y
        const startAngle = Math.atan2(ly - cy, lx - cx)
        const snaps = ids.map((id) => this.snapshotElement(layer as VectorLayer, id))
        this.state = { kind: 'rotating', ids, centerLX: cx, centerLY: cy, startAngle, snaps }
        board.canvas.style.cursor = 'grabbing'
        return
      }
    }

    // ── Check resize handles (when selected) ──────────────────────────────
    if ((this.state.kind === 'selected' || this.state.kind === 'moving') && isVec) {
      const st = this.state
      const ids = st.kind === 'selected' ? st.ids : st.ids
      const bounds = this.getCombinedBounds(layer as VectorLayer, ids)
      if (bounds) {
        const handle = this.hitTestResizeHandle(e.x, e.y, bounds, layer as VectorLayer)
        if (handle) {
          const snaps = ids.map((id) => this.snapshotElement(layer as VectorLayer, id))
          this.state = {
            kind: 'resizing', ids, handle,
            startSX: e.x, startSY: e.y, startBounds: bounds, snaps,
            shiftLock: false, altCenter: false,
          }
          board.canvas.style.cursor = this.resizeCursor(handle)
          return
        }

        // Check if clicking INSIDE bounding box → start move
        const tl = board.camera.worldToScreen(
          bounds.x + (layer as VectorLayer).transform.x,
          bounds.y + (layer as VectorLayer).transform.y,
          board.logicalWidth, board.logicalHeight,
        )
        const br = board.camera.worldToScreen(
          bounds.x + bounds.w + (layer as VectorLayer).transform.x,
          bounds.y + bounds.h + (layer as VectorLayer).transform.y,
          board.logicalWidth, board.logicalHeight,
        )
        const inside = e.x >= tl.x && e.x <= br.x && e.y >= tl.y && e.y <= br.y
        if (inside) {
          // Double-click inside selected element → enter edit mode
          if (doubleClick && ids.length === 1) {
            const vl = layer as VectorLayer
            const path = vl.paths.find((p) => p.id === ids[0])
            if (path) { this.state = { kind: 'editing', id: ids[0]! }; this.scheduleOverlayRedraw(); return }
            const stroke = vl.strokes.find((s) => s.id === ids[0])
            if (stroke) { this.state = { kind: 'editing-stroke', id: ids[0]! }; this.scheduleOverlayRedraw(); return }
          }
          const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
          const lx = world.x - (layer as VectorLayer).transform.x
          const ly = world.y - (layer as VectorLayer).transform.y
          const snaps = ids.map((id) => this.snapshotElement(layer as VectorLayer, id))
          this.state = { kind: 'moving', ids, startLX: lx, startLY: ly, snaps, hasMoved: false }
          board.canvas.style.cursor = 'move'
          return
        }
      }
    }

    // ── Hit test elements ──────────────────────────────────────────────────
    if (isVec) {
      const vl = layer as VectorLayer
      const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
      const lx = world.x - vl.transform.x
      const ly = world.y - vl.transform.y
      const hitRadius = HIT_RADIUS / board.camera.zoom

      const hitId = vl.hitTest(lx, ly, hitRadius)
      if (hitId) {
        // Double-click on any element → immediately enter edit mode
        if (doubleClick) {
          const path = vl.paths.find((p) => p.id === hitId)
          if (path) { this.state = { kind: 'editing', id: hitId }; this.scheduleOverlayRedraw(); return }
          const stroke = vl.strokes.find((s) => s.id === hitId)
          if (stroke) { this.state = { kind: 'editing-stroke', id: hitId }; this.scheduleOverlayRedraw(); return }
        }
        const ids = [hitId]
        const snaps = ids.map((id) => this.snapshotElement(vl, id))
        this.state = { kind: 'moving', ids, startLX: lx, startLY: ly, snaps, hasMoved: false }
        board.canvas.style.cursor = 'move'
        this.scheduleOverlayRedraw()
        return
      }
    }

    // ── Click on empty space: deselect now, start rect-select only if user drags ─
    this.state = { kind: 'pending-select', sx: e.x, sy: e.y }
    board.canvas.style.cursor = 'default'
    this.scheduleOverlayRedraw()
  }

  onPointerMove(e: PointerData): void {
    if (!this.board) return
    const board = this.board

    if (this.state.kind === 'pending-select') {
      if (Math.hypot(e.x - this.state.sx, e.y - this.state.sy) > DRAG_THRESHOLD) {
        this.state = { kind: 'selecting', sx0: this.state.sx, sy0: this.state.sy, sx1: e.x, sy1: e.y, additive: false }
        board.canvas.style.cursor = 'crosshair'
        this.scheduleOverlayRedraw()
      }
      return
    }

    if (this.state.kind === 'selecting') {
      this.state.sx1 = e.x; this.state.sy1 = e.y
      this.scheduleOverlayRedraw()
      return
    }

    if (this.state.kind === 'moving') {
      const layer = board.getActiveLayer()
      if (!(layer instanceof VectorLayer)) return
      const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
      const lx = world.x - layer.transform.x, ly = world.y - layer.transform.y

      // Alt+drag: clone on first movement
      if (!this.state.hasMoved && !this.state.isDupe && this._altDown) {
        const clonedIds = this.cloneElements(layer, this.state.ids)
        this.state.ids = clonedIds
        this.state.snaps = clonedIds.map((id) => this.snapshotElement(layer, id))
        this.state.isDupe = true
      }

      const dx = lx - this.state.startLX, dy = ly - this.state.startLY
      for (const id of this.state.ids) layer.translateElement(id, dx, dy)
      this.state.startLX = lx; this.state.startLY = ly
      this.state.hasMoved = true
      board.markDirty(); this.scheduleOverlayRedraw()
      return
    }

    if (this.state.kind === 'rotating') {
      const st = this.state
      const layer = board.getActiveLayer()
      if (!(layer instanceof VectorLayer)) return
      const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
      const lx = world.x - layer.transform.x, ly = world.y - layer.transform.y
      let angle = Math.atan2(ly - st.centerLY, lx - st.centerLX) - st.startAngle
      // Shift = snap to ROTATE_SNAP_DEG (mirrors Figma / Procreate behavior)
      // We approximate KeyboardEvent.shiftKey via window-tracked modifier (Pointer Events expose buttons not shift).
      if (this._shiftDown) {
        const snap = (ROTATE_SNAP_DEG * Math.PI) / 180
        angle = Math.round(angle / snap) * snap
      }
      // Restore snapshot, then rotate by the absolute angle delta
      for (const snap of st.snaps) this.restoreElement(layer, snap)
      for (const id of st.ids) layer.rotateElement(id, angle, st.centerLX, st.centerLY)
      board.markDirty(); this.scheduleOverlayRedraw()
      return
    }

    if (this.state.kind === 'resizing') {
      const st = this.state
      const layer = board.getActiveLayer()
      if (!(layer instanceof VectorLayer)) return
      const dsxRaw = e.x - st.startSX
      const dsyRaw = e.y - st.startSY

      // Convert screen delta to world delta
      const dWorldX = dsxRaw / board.camera.zoom
      const dWorldY = dsyRaw / board.camera.zoom

      // Restore elements to their snapshot state first (prevents accumulation drift)
      for (const snap of st.snaps) this.restoreElement(layer, snap)

      const { scaleX, scaleY, originX, originY } =
        this.computeResize(st.handle, st.startBounds, dWorldX, dWorldY, st.shiftLock, st.altCenter)

      if (Math.abs(scaleX) < 0.001 || Math.abs(scaleY) < 0.001) return

      for (const id of st.ids) layer.scaleElement(id, scaleX, scaleY, originX, originY)
      board.markDirty(); this.scheduleOverlayRedraw()
      return
    }

    if (this.state.kind === 'dragging-stroke-point') {
      const st = this.state
      const layer = board.getActiveLayer()
      if (!(layer instanceof VectorLayer)) return
      const stroke = layer.strokes.find((s) => s.id === st.id)
      if (!stroke) return
      const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
      const lx = world.x - layer.transform.x, ly = world.y - layer.transform.y
      const pt = stroke.points[st.pointIdx]
      if (pt) { pt.x = lx; pt.y = ly }
      board.markDirty(); this.scheduleOverlayRedraw()
      return
    }

    if (this.state.kind === 'dragging-point') {
      const st = this.state
      const layer = board.getActiveLayer()
      if (!(layer instanceof VectorLayer)) return
      const path = layer.paths.find((p) => p.id === st.id)
      if (!path) return
      const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
      const lx = world.x - layer.transform.x, ly = world.y - layer.transform.y
      const anchor = path.anchors[st.anchorIdx]
      if (!anchor) return

      if (st.part === 'anchor') {
        if (this._altDown) {
          // Alt+drag anchor: always create/update symmetric smooth handles
          // This creates a curve from what was a corner point
          anchor.handleOut = { x: lx, y: ly }
          anchor.handleIn  = { x: anchor.x * 2 - lx, y: anchor.y * 2 - ly }
          anchor.type = 'smooth'
        } else {
          const dx = lx - anchor.x, dy = ly - anchor.y
          if (anchor.handleIn)  { anchor.handleIn.x += dx;  anchor.handleIn.y += dy  }
          if (anchor.handleOut) { anchor.handleOut.x += dx; anchor.handleOut.y += dy }
          anchor.x = lx; anchor.y = ly
        }
      } else if (st.part === 'handleIn' && anchor.handleIn) {
        anchor.handleIn.x = lx; anchor.handleIn.y = ly
        if (anchor.type === 'smooth' && anchor.handleOut) {
          anchor.handleOut.x = anchor.x + (anchor.x - lx)
          anchor.handleOut.y = anchor.y + (anchor.y - ly)
        }
      } else if (st.part === 'handleOut' && anchor.handleOut) {
        anchor.handleOut.x = lx; anchor.handleOut.y = ly
        if (anchor.type === 'smooth' && anchor.handleIn) {
          anchor.handleIn.x = anchor.x + (anchor.x - lx)
          anchor.handleIn.y = anchor.y + (anchor.y - ly)
        }
      }
      board.markDirty(); this.scheduleOverlayRedraw()
      return
    }
  }

  onPointerUp(_e: PointerData): void {
    if (!this.board) return
    const board = this.board
    const layer = board.getActiveLayer()

    if (this.state.kind === 'pending-select') {
      // Released without dragging → deselect
      this.state = { kind: 'idle' }
      board.canvas.style.cursor = 'default'
      this.scheduleOverlayRedraw()
      return
    }

    if (this.state.kind === 'selecting') {
      const { sx0, sy0, sx1, sy1, additive } = this.state
      const minSx = Math.min(sx0, sx1), minSy = Math.min(sy0, sy1)
      const maxSx = Math.max(sx0, sx1), maxSy = Math.max(sy0, sy1)

      if (layer instanceof VectorLayer && (maxSx - minSx > 4 || maxSy - minSy > 4)) {
        const tl = board.camera.screenToWorld(minSx, minSy, board.logicalWidth, board.logicalHeight)
        const br = board.camera.screenToWorld(maxSx, maxSy, board.logicalWidth, board.logicalHeight)
        const lx = tl.x - layer.transform.x, ly = tl.y - layer.transform.y
        const newIds = layer.hitTestRect(lx, ly, br.x - tl.x, br.y - tl.y)
        // additive is set on pointer-down; merge with previous selection if additive
        const ids = newIds
        this.state = ids.length > 0 ? { kind: 'selected', ids } : { kind: 'idle' }
      } else {
        this.state = { kind: 'idle' }
      }
      board.canvas.style.cursor = 'default'
    } else if (this.state.kind === 'moving') {
      if (this.state.hasMoved) {
        if (this.state.isDupe) {
          this.pushDupeHistory(board, layer as VectorLayer, this.state.ids)
        } else {
          this.pushHistory(board, layer as VectorLayer, this.state.ids, this.state.snaps)
        }
      }
      const ids = this.state.ids
      this.state = { kind: 'selected', ids }
      board.canvas.style.cursor = 'default'
    } else if (this.state.kind === 'resizing') {
      this.pushHistory(board, layer as VectorLayer, this.state.ids, this.state.snaps)
      const ids = this.state.ids
      this.state = { kind: 'selected', ids }
      board.canvas.style.cursor = 'default'
    } else if (this.state.kind === 'rotating') {
      this.pushHistory(board, layer as VectorLayer, this.state.ids, this.state.snaps)
      const ids = this.state.ids
      this.state = { kind: 'selected', ids }
      board.canvas.style.cursor = 'default'
    } else if (this.state.kind === 'dragging-point') {
      const st = this.state
      if (layer instanceof VectorLayer) {
        const after = this.snapshotElement(layer, st.id)
        const before = st.snap
        board.history.push({
          undo: () => { this.restoreElement(layer as VectorLayer, before); board.markDirty(); this.scheduleOverlayRedraw() },
          redo: () => { this.restoreElement(layer as VectorLayer, after); board.markDirty(); this.scheduleOverlayRedraw() },
        })
      }
      this.state = { kind: 'editing', id: st.id }
    } else if (this.state.kind === 'dragging-stroke-point') {
      const st = this.state
      if (layer instanceof VectorLayer) {
        const after = this.snapshotElement(layer, st.id)
        const before = st.snap
        board.history.push({
          undo: () => { this.restoreElement(layer as VectorLayer, before); board.markDirty(); this.scheduleOverlayRedraw() },
          redo: () => { this.restoreElement(layer as VectorLayer, after); board.markDirty(); this.scheduleOverlayRedraw() },
        })
      }
      this.state = { kind: 'editing-stroke', id: st.id }
    }

    this.scheduleOverlayRedraw()
  }

  onPointerCancel(_e: PointerData): void {
    if (this.state.kind === 'pending-select') { this.state = { kind: 'idle' }; this.scheduleOverlayRedraw(); return }
    this.state = { kind: 'idle' }
    this.board?.canvas.style.cursor ? (this.board.canvas.style.cursor = 'default') : null
    this.scheduleOverlayRedraw()
  }

  /**
   * Externally set a selection (e.g. from LassoSelectTool after polygon selection).
   * Puts the tool into 'selected' state with the given ids.
   */
  setSelectedIds(ids: string[]): void {
    if (ids.length === 0) {
      this.state = { kind: 'idle' }
    } else {
      this.state = { kind: 'selected', ids }
    }
    this.scheduleOverlayRedraw()
  }

  /** Escape exits edit mode or clears selection. */
  exitEditMode(): void {
    const k = this.state.kind
    if (k === 'editing' || k === 'dragging-point' || k === 'editing-stroke' || k === 'dragging-stroke-point' || k === 'selected') {
      this.state = { kind: 'idle' }
    }
    this.board?.clearStrokeCanvas()
    this.scheduleOverlayRedraw()
  }

  deleteSelected(): void {
    const layer = this.board?.getActiveLayer()
    if (!(layer instanceof VectorLayer)) return
    const st = this.state
    if (st.kind !== 'selected' && st.kind !== 'editing' && st.kind !== 'editing-stroke') return
    const ids = st.kind === 'selected' ? st.ids : [st.id]
    for (const id of ids) { layer.removeStroke(id); layer.removePath(id) }
    this.state = { kind: 'idle' }
    this.board?.markDirty(); this.scheduleOverlayRedraw()
  }

  /** True if there is content currently on the internal clipboard. */
  hasClipboard(): boolean {
    return !!this._clipboard && (this._clipboard.strokes.length > 0 || this._clipboard.paths.length > 0)
  }

  /**
   * True if there's an active selection that can be acted on (cut/copy/delete).
   * Mirrors what `copySelected/deleteSelected/cutSelected` will use internally,
   * so callers don't need to inspect `state` directly.
   */
  hasSelection(): boolean {
    const k = this.state.kind
    return k === 'selected' || k === 'editing' || k === 'editing-stroke'
  }

  copySelected(): void {
    const layer = this.board?.getActiveLayer()
    if (!(layer instanceof VectorLayer)) return
    const st = this.state
    if (st.kind !== 'selected' && st.kind !== 'editing' && st.kind !== 'editing-stroke') return
    const ids = st.kind === 'selected' ? st.ids : [st.id]
    this._clipboard = {
      strokes: ids.flatMap((id) => {
        const s = layer.strokes.find((ss) => ss.id === id)
        return s ? [{ ...s, points: s.points.map((p) => ({ ...p })) }] : []
      }),
      paths: ids.flatMap((id) => {
        const p = layer.paths.find((pp) => pp.id === id)
        return p ? [{
          ...p,
          anchors: p.anchors.map((a) => ({
            ...a,
            handleIn: a.handleIn ? { ...a.handleIn } : null,
            handleOut: a.handleOut ? { ...a.handleOut } : null,
          })),
        }] : []
      }),
    }
  }

  cutSelected(): void {
    this.copySelected()
    this.deleteSelected()
  }

  pasteClipboard(): void {
    if (!this._clipboard || !this.board) return
    const layer = this.board.getActiveLayer()
    if (!(layer instanceof VectorLayer)) return

    const OFFSET = 12
    const newIds: string[] = []

    for (const s of this._clipboard.strokes) {
      const clone = layer.createStroke(
        s.points.map((p) => ({ ...p, x: p.x + OFFSET, y: p.y + OFFSET })),
        s.color, s.lineWidth, s.opacity, s.compositeOperation,
      )
      layer.addStroke(clone)
      newIds.push(clone.id)
    }

    for (const p of this._clipboard.paths) {
      const clone = layer.createPath(
        p.anchors.map((a) => ({
          ...a,
          x: a.x + OFFSET, y: a.y + OFFSET,
          handleIn:  a.handleIn  ? { x: a.handleIn.x  + OFFSET, y: a.handleIn.y  + OFFSET } : null,
          handleOut: a.handleOut ? { x: a.handleOut.x + OFFSET, y: a.handleOut.y + OFFSET } : null,
        })),
        p.closed, p.strokeColor, p.strokeWidth, p.fillColor, p.opacity, p.compositeOperation,
      )
      layer.addPath(clone)
      newIds.push(clone.id)
    }

    this.board.markDirty()
    if (newIds.length > 0) {
      this.state = { kind: 'selected', ids: newIds }
      this.scheduleOverlayRedraw()
      const board = this.board
      this.pushDupeHistory(board, layer, newIds)
    }
  }

  // ── Overlay rendering ─────────────────────────────────────────────────────

  private scheduleOverlayRedraw(): void {
    if (this._overlayPending) return
    this._overlayPending = true
    requestAnimationFrame(() => { this._overlayPending = false; this.redrawOverlay() })
  }

  redrawOverlay(): void {
    const board = this.board
    if (!board?.strokeCtx) return
    const { strokeCtx } = board
    const dpr = window.devicePixelRatio ?? 1
    strokeCtx.clearRect(0, 0, strokeCtx.canvas.width, strokeCtx.canvas.height)

    strokeCtx.save()
    strokeCtx.scale(dpr, dpr)

    const W = board.logicalWidth, H = board.logicalHeight
    const layer = board.getActiveLayer()

    // Selection rect
    if (this.state.kind === 'selecting') {
      const { sx0, sy0, sx1, sy1 } = this.state
      strokeCtx.strokeStyle = 'rgba(99,179,237,0.9)'
      strokeCtx.lineWidth = 1.5; strokeCtx.setLineDash([5, 4])
      strokeCtx.strokeRect(Math.min(sx0, sx1), Math.min(sy0, sy1), Math.abs(sx1 - sx0), Math.abs(sy1 - sy0))
      strokeCtx.fillStyle = 'rgba(99,179,237,0.07)'
      strokeCtx.fillRect(Math.min(sx0, sx1), Math.min(sy0, sy1), Math.abs(sx1 - sx0), Math.abs(sy1 - sy0))
    }

    // Bounding box + resize handles
    if ((this.state.kind === 'selected' || this.state.kind === 'moving' || this.state.kind === 'resizing') && layer instanceof VectorLayer) {
      const ids = 'ids' in this.state ? this.state.ids : []
      const bounds = this.getCombinedBounds(layer, ids)
      if (bounds) this.drawBoundingBox(strokeCtx, bounds, layer, board.camera, W, H)
    }

    // Edit mode handles (path)
    if (this.state.kind === 'editing' || this.state.kind === 'dragging-point') {
      const id = this.state.id
      if (layer instanceof VectorLayer) {
        const path = layer.paths.find((p) => p.id === id)
        if (path) this.drawEditHandles(strokeCtx, path.anchors, layer, board.camera, W, H)
      }
    }

    // Edit mode handles (vector brush stroke)
    if (this.state.kind === 'editing-stroke' || this.state.kind === 'dragging-stroke-point') {
      const id = this.state.id
      if (layer instanceof VectorLayer) {
        const stroke = layer.strokes.find((s) => s.id === id)
        if (stroke) this.drawStrokePoints(strokeCtx, stroke, layer, board.camera, W, H)
      }
    }

    strokeCtx.restore()
  }

  // ── Bounding box drawing ──────────────────────────────────────────────────

  private drawBoundingBox(ctx: CanvasRenderingContext2D, bounds: Bounds, layer: VectorLayer, camera: Camera, W: number, H: number): void {
    const ts = (lx: number, ly: number) =>
      camera.worldToScreen(lx + layer.transform.x, ly + layer.transform.y, W, H)

    const tl = ts(bounds.x, bounds.y)
    const tr = ts(bounds.x + bounds.w, bounds.y)
    const bl = ts(bounds.x, bounds.y + bounds.h)
    const br = ts(bounds.x + bounds.w, bounds.y + bounds.h)

    // Bounding box
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(99,179,237,0.8)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y)
    ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y)
    ctx.closePath(); ctx.stroke()

    // 8 resize handles
    const handles = this.getHandleScreenPositions(tl, tr, bl, br)
    for (const [, pos] of Object.entries(handles)) {
      const p = pos as { x: number; y: number }
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = 'rgba(99,179,237,0.9)'
      ctx.lineWidth = 1.5
      ctx.fillRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
      ctx.strokeRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
    }

    // Rotate handle — circle floating above the top-center edge with a tether.
    const top = handles.n
    const rotPos = { x: top.x, y: top.y - ROTATE_HANDLE_OFFSET }
    ctx.strokeStyle = 'rgba(99,179,237,0.7)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(top.x, top.y - HANDLE_SIZE / 2)
    ctx.lineTo(rotPos.x, rotPos.y + 5)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = 'rgba(99,179,237,0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(rotPos.x, rotPos.y, 5, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
  }

  private getHandleScreenPositions(tl: {x:number;y:number}, tr: {x:number;y:number}, bl: {x:number;y:number}, br: {x:number;y:number}) {
    const mid = (a: {x:number;y:number}, b: {x:number;y:number}) => ({ x: (a.x+b.x)/2, y: (a.y+b.y)/2 })
    return {
      nw: tl, n: mid(tl, tr), ne: tr,
      w: mid(tl, bl), e: mid(tr, br),
      sw: bl, s: mid(bl, br), se: br,
    }
  }

  // ── Edit handles ──────────────────────────────────────────────────────────

  private drawEditHandles(ctx: CanvasRenderingContext2D, anchors: BezierAnchor[], layer: VectorLayer, camera: Camera, W: number, H: number): void {
    const ts = (lx: number, ly: number) => camera.worldToScreen(lx + layer.transform.x, ly + layer.transform.y, W, H)

    // Handle lines (dashed)
    ctx.strokeStyle = 'rgba(99,179,237,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    for (const a of anchors) {
      const as = ts(a.x, a.y)
      if (a.handleIn) { const hs = ts(a.handleIn.x, a.handleIn.y); ctx.beginPath(); ctx.moveTo(as.x, as.y); ctx.lineTo(hs.x, hs.y); ctx.stroke() }
      if (a.handleOut) { const hs = ts(a.handleOut.x, a.handleOut.y); ctx.beginPath(); ctx.moveTo(as.x, as.y); ctx.lineTo(hs.x, hs.y); ctx.stroke() }
    }

    // Handle squares
    ctx.setLineDash([]); ctx.lineWidth = 1.5
    for (const a of anchors) {
      const drawSq = (hx: number, hy: number) => {
        const hs = ts(hx, hy)
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#63b3ed'
        ctx.fillRect(hs.x - 4, hs.y - 4, 8, 8); ctx.strokeRect(hs.x - 4, hs.y - 4, 8, 8)
      }
      if (a.handleIn) drawSq(a.handleIn.x, a.handleIn.y)
      if (a.handleOut) drawSq(a.handleOut.x, a.handleOut.y)
    }

    // Anchor circles
    ctx.lineWidth = 2
    for (const a of anchors) {
      const as = ts(a.x, a.y)
      ctx.beginPath(); ctx.arc(as.x, as.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#63b3ed'; ctx.fill(); ctx.stroke()
    }
  }

  // ── Stroke point edit drawing ─────────────────────────────────────────────

  private drawStrokePoints(ctx: CanvasRenderingContext2D, stroke: VectorStroke, layer: VectorLayer, camera: Camera, W: number, H: number): void {
    const ts = (lx: number, ly: number) => camera.worldToScreen(lx + layer.transform.x, ly + layer.transform.y, W, H)
    const step = Math.max(1, Math.floor(stroke.points.length / 60))
    ctx.setLineDash([])
    ctx.lineWidth = 1.5
    for (let i = 0; i < stroke.points.length; i += step) {
      const p = stroke.points[i]!
      const ps = ts(p.x, p.y)
      ctx.beginPath()
      ctx.arc(ps.x, ps.y, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#63b3ed'
      ctx.fill(); ctx.stroke()
    }
  }

  private hitTestStrokePoint(sx: number, sy: number, stroke: VectorStroke, layer: VectorLayer): number | null {
    if (!this.board) return null
    const { camera, logicalWidth: W, logicalHeight: H } = this.board
    const step = Math.max(1, Math.floor(stroke.points.length / 60))
    const r2 = HIT_RADIUS * HIT_RADIUS
    for (let i = 0; i < stroke.points.length; i += step) {
      const p = stroke.points[i]!
      const ps = camera.worldToScreen(p.x + layer.transform.x, p.y + layer.transform.y, W, H)
      if ((sx - ps.x) ** 2 + (sy - ps.y) ** 2 <= r2) return i
    }
    return null
  }

  // ── Hit testing ───────────────────────────────────────────────────────────

  private rotateHandleScreenPos(bounds: Bounds, layer: VectorLayer): { x: number; y: number } | null {
    if (!this.board) return null
    const { camera, logicalWidth: W, logicalHeight: H } = this.board
    const tl = camera.worldToScreen(bounds.x + layer.transform.x, bounds.y + layer.transform.y, W, H)
    const tr = camera.worldToScreen(bounds.x + bounds.w + layer.transform.x, bounds.y + layer.transform.y, W, H)
    const mid = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 }
    return { x: mid.x, y: mid.y - ROTATE_HANDLE_OFFSET }
  }

  private hitTestRotateHandle(sx: number, sy: number, bounds: Bounds, layer: VectorLayer): boolean {
    const pos = this.rotateHandleScreenPos(bounds, layer)
    if (!pos) return false
    const dx = sx - pos.x, dy = sy - pos.y
    return dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS
  }

  private hitTestResizeHandle(sx: number, sy: number, bounds: Bounds, layer: VectorLayer): ResizeHandle | null {
    if (!this.board) return null
    const board = this.board
    const W = board.logicalWidth, H = board.logicalHeight
    const ts = (lx: number, ly: number) =>
      board.camera.worldToScreen(lx + layer.transform.x, ly + layer.transform.y, W, H)
    const tl = ts(bounds.x, bounds.y)
    const tr = ts(bounds.x + bounds.w, bounds.y)
    const bl = ts(bounds.x, bounds.y + bounds.h)
    const br = ts(bounds.x + bounds.w, bounds.y + bounds.h)
    const handles = this.getHandleScreenPositions(tl, tr, bl, br)
    const r2 = HIT_RADIUS * HIT_RADIUS
    for (const [k, pos] of Object.entries(handles) as [ResizeHandle, {x:number;y:number}][]) {
      if ((sx - pos.x) ** 2 + (sy - pos.y) ** 2 <= r2) return k
    }
    return null
  }

  private hitTestHandle(sx: number, sy: number, id: string, layer: VectorLayer): { id: string; anchorIdx: number; part: 'anchor' | 'handleIn' | 'handleOut' } | null {
    if (!this.board) return null
    const board = this.board
    const W = board.logicalWidth, H = board.logicalHeight
    const path = layer.paths.find((p) => p.id === id)
    if (!path) return null
    const ts = (lx: number, ly: number) =>
      board.camera.worldToScreen(lx + layer.transform.x, ly + layer.transform.y, W, H)
    const r2 = HIT_RADIUS * HIT_RADIUS
    const dist2 = (a: {x:number;y:number}, b: {x:number;y:number}) => (a.x-b.x)**2 + (a.y-b.y)**2
    for (let i = 0; i < path.anchors.length; i++) {
      const a = path.anchors[i]!
      if (dist2(ts(a.x, a.y), { x: sx, y: sy }) <= r2) return { id, anchorIdx: i, part: 'anchor' }
      if (a.handleIn && dist2(ts(a.handleIn.x, a.handleIn.y), { x: sx, y: sy }) <= r2) return { id, anchorIdx: i, part: 'handleIn' }
      if (a.handleOut && dist2(ts(a.handleOut.x, a.handleOut.y), { x: sx, y: sy }) <= r2) return { id, anchorIdx: i, part: 'handleOut' }
    }
    return null
  }

  // ── Bounds helpers ────────────────────────────────────────────────────────

  getCombinedBounds(layer: VectorLayer, ids: string[]): Bounds | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const id of ids) {
      const b = layer.getBounds(id)
      if (!b) continue
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h)
    }
    if (minX === Infinity) return null
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  // ── Resize math ───────────────────────────────────────────────────────────

  private computeResize(handle: ResizeHandle, startBounds: Bounds, dWorldX: number, dWorldY: number, shiftLock: boolean, altCenter: boolean): { scaleX: number; scaleY: number; originX: number; originY: number } {
    const { x, y, w, h } = startBounds

    let newW = w, newH = h, newX = x, newY = y

    const left = handle === 'nw' || handle === 'w' || handle === 'sw'
    const right = handle === 'ne' || handle === 'e' || handle === 'se'
    const top = handle === 'nw' || handle === 'n' || handle === 'ne'
    const bottom = handle === 'sw' || handle === 's' || handle === 'se'

    if (right) newW = Math.max(1, w + dWorldX)
    if (left) { newX = x + dWorldX; newW = Math.max(1, w - dWorldX) }
    if (bottom) newH = Math.max(1, h + dWorldY)
    if (top) { newY = y + dWorldY; newH = Math.max(1, h - dWorldY) }

    // Shift: maintain aspect ratio
    if (shiftLock && (right || left) && (top || bottom)) {
      const ratio = w / h
      if (Math.abs(newW - w) >= Math.abs(newH - h)) {
        newH = newW / ratio
        if (top) newY = y + h - newH
      } else {
        newW = newH * ratio
        if (left) newX = x + w - newW
      }
    }

    const scaleX = newW / w
    const scaleY = newH / h

    // Origin is the FIXED corner (opposite to the dragged handle)
    let originX = left ? x + w : x
    let originY = top ? y + h : y
    if (!left && !right) originX = x + w / 2
    if (!top && !bottom) originY = y + h / 2

    // Alt: resize from center
    if (altCenter) { originX = x + w / 2; originY = y + h / 2 }

    return { scaleX, scaleY, originX, originY }
  }

  // ── Snapshot helpers ──────────────────────────────────────────────────────

  private snapshotElement(layer: VectorLayer, id: string): ElementSnapshot {
    const stroke = layer.strokes.find((s) => s.id === id)
    if (stroke) return { id, strokePoints: stroke.points.map((p) => ({ ...p })) }
    const path = layer.paths.find((p) => p.id === id)
    if (path) return {
      id, pathAnchors: path.anchors.map((a) => ({
        ...a,
        handleIn: a.handleIn ? { ...a.handleIn } : null,
        handleOut: a.handleOut ? { ...a.handleOut } : null,
      })),
    }
    return { id }
  }

  private restoreElement(layer: VectorLayer, snap: ElementSnapshot): void {
    const stroke = layer.strokes.find((s) => s.id === snap.id)
    if (stroke && snap.strokePoints) { stroke.points = snap.strokePoints.map((p) => ({ ...p })); return }
    const path = layer.paths.find((p) => p.id === snap.id)
    if (path && snap.pathAnchors) {
      path.anchors = snap.pathAnchors.map((a) => ({
        ...a,
        handleIn: a.handleIn ? { ...a.handleIn } : null,
        handleOut: a.handleOut ? { ...a.handleOut } : null,
      }))
    }
  }

  // ── Clone helpers ─────────────────────────────────────────────────────────

  private cloneElements(layer: VectorLayer, ids: string[]): string[] {
    const clonedIds: string[] = []
    for (const id of ids) {
      const stroke = layer.strokes.find((s) => s.id === id)
      if (stroke) {
        const clone = layer.createStroke(
          stroke.points.map((p) => ({ ...p })),
          stroke.color,
          stroke.lineWidth,
          stroke.opacity,
          stroke.compositeOperation,
        )
        layer.addStroke(clone)
        clonedIds.push(clone.id)
      }
      const path = layer.paths.find((p) => p.id === id)
      if (path) {
        const clone = layer.createPath(
          path.anchors.map((a) => ({
            ...a,
            handleIn: a.handleIn ? { ...a.handleIn } : null,
            handleOut: a.handleOut ? { ...a.handleOut } : null,
          })),
          path.closed,
          path.strokeColor,
          path.strokeWidth,
          path.fillColor,
          path.opacity,
          path.compositeOperation,
        )
        layer.addPath(clone)
        clonedIds.push(clone.id)
      }
    }
    return clonedIds
  }

  // ── History ───────────────────────────────────────────────────────────────

  private pushDupeHistory(board: typeof this.board & {}, layer: VectorLayer, dupeIds: string[]): void {
    if (!board) return
    const finalStrokes = dupeIds.flatMap((id) => {
      const s = layer.strokes.find((ss) => ss.id === id)
      return s ? [{ ...s, points: s.points.map((p) => ({ ...p })) }] : []
    })
    const finalPaths = dupeIds.flatMap((id) => {
      const p = layer.paths.find((pp) => pp.id === id)
      return p ? [{
        ...p,
        anchors: p.anchors.map((a) => ({
          ...a,
          handleIn: a.handleIn ? { ...a.handleIn } : null,
          handleOut: a.handleOut ? { ...a.handleOut } : null,
        })),
      }] : []
    })
    board.history.push({
      undo: () => {
        for (const id of dupeIds) { layer.removeStroke(id); layer.removePath(id) }
        board.markDirty()
      },
      redo: () => {
        for (const s of finalStrokes) layer.addStroke({ ...s, points: s.points.map((p) => ({ ...p })) })
        for (const p of finalPaths) layer.addPath({
          ...p,
          anchors: p.anchors.map((a) => ({
            ...a,
            handleIn: a.handleIn ? { ...a.handleIn } : null,
            handleOut: a.handleOut ? { ...a.handleOut } : null,
          })),
        })
        board.markDirty()
      },
    })
  }

  private pushHistory(board: typeof this.board & {}, layer: VectorLayer, ids: string[], snaps: ElementSnapshot[]): void {
    if (!board) return
    const afters = ids.map((id) => this.snapshotElement(layer, id))
    board.history.push({
      undo: () => { for (const s of snaps) this.restoreElement(layer, s); board.markDirty() },
      redo: () => { for (const s of afters) this.restoreElement(layer, s); board.markDirty() },
    })
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  private resizeCursor(handle: ResizeHandle): string {
    const map: Record<ResizeHandle, string> = {
      nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
      w: 'w-resize', e: 'e-resize',
      sw: 'sw-resize', s: 's-resize', se: 'se-resize',
    }
    return map[handle]
  }
}
