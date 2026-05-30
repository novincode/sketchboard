import { Tool } from './Tool'
import type { PointerData } from '../types'
import { VectorLayer } from '../layers/VectorLayer'
import type { BezierAnchor, VectorPath } from '../layers/VectorLayer'
import { Color } from '../math/Color'

export interface VectorPenSettings {
  strokeColor: string
  strokeWidth: number
  fillColor: string | null
  opacity: number
}

const CLOSE_RADIUS_SCREEN = 12   // px — how close to first anchor to auto-close
/** Screen-px proximity for "hovering over an existing path edge" to insert an anchor. */
const EDGE_HOVER_RADIUS_SCREEN = 8

export class VectorPenTool extends Tool {
  readonly requiredLayerType = 'vector' as const
  settings: VectorPenSettings = {
    strokeColor: '#1a1a1a',
    strokeWidth: 2,
    fillColor: null,
    opacity: 1,
  }

  // In-progress path state
  private anchors: BezierAnchor[] = []
  private mouseWorld = { x: 0, y: 0 }   // current mouse in layer-local world coords
  private mouseScreen = { x: 0, y: 0 }  // current mouse in screen coords
  private _isDragging = false            // dragging a handle right now
  private _pendingAnchor: { x: number; y: number } | null = null
  private _overlayPending = false
  private _afterRenderUnsub: (() => void) | null = null

  /**
   * When set, the pen tool is EXTENDING an existing path instead of creating
   * a new one. Set by onActivate when SelectTool's editing state targets an
   * open path on the active layer; cleared on commit/cancel. The path is
   * snapshotted before changes so undo restores the original geometry.
   */
  private _extendingPathId: string | null = null
  private _extendingPathSnapshot: VectorPath | null = null
  private _extendingFromEnd: 'first' | 'last' = 'last'

  onActivate(): void {
    this._afterRenderUnsub = this.board?.hooks.afterRender.tap('vectorpen', () => {
      if (this.anchors.length > 0) this.scheduleOverlayRedraw()
    }) ?? null
    this._maybeBeginExtending()
  }

  onDeactivate(): void {
    this._afterRenderUnsub?.()
    this._afterRenderUnsub = null
    // Switching tool mid-extension: silently restore the original geometry
    // (no history entry — the user never committed). Without this, the path
    // they were continuing visibly vanishes from the canvas.
    this._restoreOriginalIfExtending()
    this.board?.clearStrokeCanvas()
    this.anchors = []
  }

  /**
   * Figma-style continuation: when the user switches to Pen with the Select
   * tool focused on an OPEN path in editing mode, seed `this.anchors` from
   * that path so the next click extends it from the appropriate endpoint.
   *
   * If exactly ONE anchor is selected via SelectTool's multi-anchor model
   * AND it's an endpoint (first or last), extend from THAT endpoint.
   * Otherwise default to the last anchor.
   *
   * The original path stays IN the layer untouched during extension — we
   * just keep a parallel `this.anchors` array and replace the path on
   * commit. Avoids the previous "hide + re-add on cancel" bookkeeping
   * (which made the path visibly vanish if the user picked another tool
   * mid-extension).
   */
  private _maybeBeginExtending(): void {
    const board = this.board
    if (!board) return
    // Probe SelectTool through the registry — Tool base doesn't import it.
    const select = board.getTool('select') as {
      state?: { kind: string; id?: string; selectedAnchorIdxs?: number[] }
    } | undefined
    const st = select?.state
    if (!st || st.kind !== 'editing' || !st.id) return
    const layer = board.getActiveLayer()
    if (!(layer instanceof VectorLayer)) return
    const path = layer.paths.find((p) => p.id === st.id)
    if (!path || path.closed || path.anchors.length === 0) return

    // Decide which endpoint to extend from based on selectedAnchorIdxs.
    // Single anchor selected = use that endpoint if it's first or last.
    // No selection / multi-selection / middle anchor → default to last.
    let fromEnd: 'first' | 'last' = 'last'
    const sel = st.selectedAnchorIdxs
    if (sel && sel.length === 1) {
      const idx = sel[0]!
      if (idx === 0) fromEnd = 'first'
      else if (idx === path.anchors.length - 1) fromEnd = 'last'
      // Middle anchor selected → fall through to default 'last'.
    }

    this._extendingPathId = path.id
    this._extendingPathSnapshot = {
      ...path,
      anchors: path.anchors.map((a) => ({
        ...a,
        handleIn: a.handleIn ? { ...a.handleIn } : null,
        handleOut: a.handleOut ? { ...a.handleOut } : null,
      })),
    }
    this._extendingFromEnd = fromEnd

    // Seed our in-progress anchors from the existing path. When extending
    // from the FIRST endpoint, reverse the array (and swap each anchor's
    // handleIn ↔ handleOut so the curve renders identically) so the rubber
    // band continues from the original first anchor.
    const seeded = this._extendingPathSnapshot.anchors.map((a) => ({
      ...a,
      handleIn: a.handleIn ? { ...a.handleIn } : null,
      handleOut: a.handleOut ? { ...a.handleOut } : null,
    }))
    if (fromEnd === 'first') {
      seeded.reverse()
      for (const a of seeded) {
        const tmp = a.handleIn
        a.handleIn = a.handleOut
        a.handleOut = tmp
      }
    }
    this.anchors = seeded
    this.scheduleOverlayRedraw()
  }

  /** No-op now — kept for naming continuity. The original path is never
   * hidden during extension, so there's nothing to restore on cancel. */
  private _restoreOriginalIfExtending(): void {
    this._extendingPathId = null
    this._extendingPathSnapshot = null
  }

  onPointerDown(e: PointerData): void {
    if (!this.guardActiveLayer()) return
    const board = this.board!
    const layer = board.getActiveLayer() as VectorLayer

    const world = this.toLayerCoords(e.x, e.y, layer)

    // Check close-path: click near first anchor
    if (this.anchors.length >= 2) {
      const first = this.anchors[0]!
      const fs = board.camera.worldToScreen(
        first.x + layer.transform.x, first.y + layer.transform.y,
        board.logicalWidth, board.logicalHeight,
      )
      const dx = e.x - fs.x, dy = e.y - fs.y
      if (dx * dx + dy * dy <= CLOSE_RADIUS_SCREEN * CLOSE_RADIUS_SCREEN) {
        this.commitPath(layer, true)
        return
      }
    }

    // ── Click-on-edge to insert anchor ─────────────────────────────────────
    // When NO in-progress path AND the cursor is over an existing path's
    // curve, insert a new anchor at the click point splitting the segment.
    // Matches Figma's pen-hover-on-path behavior. Switching to Select +
    // editing mode after insertion lets the user immediately tweak the new
    // anchor's handles.
    if (this.anchors.length === 0 && !this._extendingPathId) {
      const radiusLocal = EDGE_HOVER_RADIUS_SCREEN / board.camera.zoom
      const hit = layer.hitTestEdgePoint(world.x, world.y, radiusLocal)
      if (hit) {
        const beforeSnap = layer.snapshotElements()
        const insertedIdx = layer.insertAnchorAt(hit.pathId, hit.segmentIdx, hit.t)
        if (insertedIdx !== -1) {
          const afterSnap = layer.snapshotElements()
          board.history.push({
            undo: () => { layer.restoreElementsSnapshot(beforeSnap); board.markDirty() },
            redo: () => { layer.restoreElementsSnapshot(afterSnap);  board.markDirty() },
          })
          board.markDirty()
          this.scheduleOverlayRedraw()
        }
        return
      }
    }

    this._pendingAnchor = { x: world.x, y: world.y }
    this._isDragging = false
    this.scheduleOverlayRedraw()
  }

  onPointerMove(e: PointerData): void {
    if (!this.board) return
    const layer = this.board.getActiveLayer() as VectorLayer | undefined
    if (!layer || layer.type !== 'vector') return

    const world = this.toLayerCoords(e.x, e.y, layer)
    this.mouseWorld = world
    this.mouseScreen = { x: e.x, y: e.y }

    if (this._pendingAnchor) {
      const dx = world.x - this._pendingAnchor.x
      const dy = world.y - this._pendingAnchor.y
      if (dx * dx + dy * dy > (3 / this.board.camera.zoom) ** 2) {
        this._isDragging = true
      }
    }

    this.scheduleOverlayRedraw()
  }

  onPointerUp(e: PointerData): void {
    if (!this.board || !this._pendingAnchor) return
    const layer = this.board.getActiveLayer() as VectorLayer | undefined
    if (!layer || layer.type !== 'vector') return

    const world = this.toLayerCoords(e.x, e.y, layer)
    const anchor: BezierAnchor = {
      x: this._pendingAnchor.x,
      y: this._pendingAnchor.y,
      handleIn: null,
      handleOut: null,
      type: 'smooth',
    }

    if (this._isDragging) {
      // Set handles based on drag delta from anchor
      const dx = world.x - this._pendingAnchor.x
      const dy = world.y - this._pendingAnchor.y
      anchor.handleOut = { x: this._pendingAnchor.x + dx, y: this._pendingAnchor.y + dy }
      anchor.handleIn = { x: this._pendingAnchor.x - dx, y: this._pendingAnchor.y - dy }
    } else {
      anchor.type = 'corner'
    }

    this.anchors.push(anchor)
    this._pendingAnchor = null
    this._isDragging = false
    this.scheduleOverlayRedraw()
  }

  onPointerCancel(_e: PointerData): void {
    this._pendingAnchor = null
    this._isDragging = false
    this.scheduleOverlayRedraw()
  }

  /** Finish path without closing (e.g., on Enter key). */
  finishPath(): void {
    const layer = this.board?.getActiveLayer() as VectorLayer | undefined
    if (!layer || layer.type !== 'vector' || this.anchors.length < 2) {
      this.anchors = []
      this.board?.clearStrokeCanvas()
      return
    }
    this.commitPath(layer, false)
  }

  /** Cancel and discard current path (e.g., on Escape). */
  cancelPath(): void {
    // Restore the hidden original if we were extending — otherwise the path
    // we were continuing would disappear from the canvas on Escape.
    this._restoreOriginalIfExtending()
    this.anchors = []
    this.board?.clearStrokeCanvas()
  }

  private commitPath(layer: VectorLayer, closed: boolean): void {
    if (this.anchors.length < 2) { this.cancelPath(); return }
    const board = this.board!

    // Extending an existing path: REPLACE its anchors in place. The original
    // stayed in the layer untouched throughout the extension, so we just
    // swap the anchors array (un-reversing if we extended from the FIRST
    // endpoint). One history entry restores the original snapshot on undo.
    if (this._extendingPathId && this._extendingPathSnapshot) {
      const targetId = this._extendingPathId
      const beforeSnap = this._extendingPathSnapshot
      // When extending from the FIRST endpoint we reversed the anchor array
      // for editing convenience — undo that on commit so handleIn/Out stays
      // consistent with the underlying curve direction.
      let committedAnchors = this.anchors.slice()
      if (this._extendingFromEnd === 'first') {
        committedAnchors.reverse()
        committedAnchors = committedAnchors.map((a) => ({ ...a, handleIn: a.handleOut, handleOut: a.handleIn }))
      }
      const after: VectorPath = {
        ...beforeSnap,
        closed,
        anchors: committedAnchors.map((a) => ({
          ...a,
          handleIn: a.handleIn ? { ...a.handleIn } : null,
          handleOut: a.handleOut ? { ...a.handleOut } : null,
        })),
      }
      const i = layer.paths.findIndex((p) => p.id === targetId)
      if (i !== -1) {
        layer.paths[i] = {
          ...after,
          anchors: after.anchors.map((a) => ({ ...a, handleIn: a.handleIn ? { ...a.handleIn } : null, handleOut: a.handleOut ? { ...a.handleOut } : null })),
        }
      }
      board.history.push({
        undo: () => {
          const j = layer.paths.findIndex((p) => p.id === targetId)
          if (j !== -1) layer.paths[j] = { ...beforeSnap, anchors: beforeSnap.anchors.map((a) => ({ ...a, handleIn: a.handleIn ? { ...a.handleIn } : null, handleOut: a.handleOut ? { ...a.handleOut } : null })) }
          board.markDirty()
        },
        redo: () => {
          const j = layer.paths.findIndex((p) => p.id === targetId)
          if (j !== -1) layer.paths[j] = { ...after, anchors: after.anchors.map((a) => ({ ...a, handleIn: a.handleIn ? { ...a.handleIn } : null, handleOut: a.handleOut ? { ...a.handleOut } : null })) }
          board.markDirty()
        },
      })
      this.anchors = []
      this._extendingPathId = null
      this._extendingPathSnapshot = null
      board.clearStrokeCanvas()
      board.markDirty()
      return
    }

    // Fresh path: original create-new behavior.
    const beforePaths = layer.paths.slice()
    const path = layer.createPath(
      [...this.anchors],
      closed,
      this.settings.strokeColor,
      this.settings.strokeWidth,
      this.settings.fillColor,
      this.settings.opacity,
    )
    layer.addPath(path)
    board.history.push({
      undo: () => { layer.paths = [...beforePaths]; board.markDirty() },
      redo: () => { layer.paths = [...beforePaths, path]; board.markDirty() },
    })

    this.anchors = []
    board.clearStrokeCanvas()
    board.markDirty()
  }

  // ── Overlay (in-progress path preview) ───────────────────────────────────

  private scheduleOverlayRedraw(): void {
    if (this._overlayPending) return
    this._overlayPending = true
    requestAnimationFrame(() => {
      this._overlayPending = false
      this.redrawOverlay()
    })
  }

  private redrawOverlay(): void {
    const board = this.board
    if (!board?.strokeCtx) return
    const { strokeCtx } = board
    const dpr = window.devicePixelRatio ?? 1
    const W = board.logicalWidth, H = board.logicalHeight
    const layer = board.getActiveLayer() as VectorLayer | undefined

    strokeCtx.clearRect(0, 0, strokeCtx.canvas.width, strokeCtx.canvas.height)

    // Edge-hover hint: when no path in-progress, probe for nearest edge
    // and draw a "+" marker so the user knows clicking will insert an
    // anchor. Probe cost: ~20 samples × paths-in-active-layer per frame
    // (acceptable for typical scenes; rAF-throttled by scheduleOverlayRedraw).
    if (this.anchors.length === 0 && !this._pendingAnchor && layer && !this._extendingPathId) {
      const radiusLocal = EDGE_HOVER_RADIUS_SCREEN / board.camera.zoom
      const hit = layer.hitTestEdgePoint(this.mouseWorld.x, this.mouseWorld.y, radiusLocal)
      if (hit) {
        strokeCtx.save()
        strokeCtx.scale(dpr, dpr)
        const ps = board.camera.worldToScreen(hit.x + layer.transform.x, hit.y + layer.transform.y, W, H)
        // Outer ring + plus glyph.
        strokeCtx.strokeStyle = '#63b3ed'
        strokeCtx.lineWidth = 2
        strokeCtx.beginPath()
        strokeCtx.arc(ps.x, ps.y, 7, 0, Math.PI * 2)
        strokeCtx.stroke()
        strokeCtx.beginPath()
        strokeCtx.moveTo(ps.x - 3, ps.y); strokeCtx.lineTo(ps.x + 3, ps.y)
        strokeCtx.moveTo(ps.x, ps.y - 3); strokeCtx.lineTo(ps.x, ps.y + 3)
        strokeCtx.stroke()
        strokeCtx.restore()
        return
      }
    }

    if (this.anchors.length === 0 && !this._pendingAnchor) return

    strokeCtx.save()
    strokeCtx.scale(dpr, dpr)

    const toScreen = (lx: number, ly: number) =>
      board.camera.worldToScreen(lx + (layer?.transform.x ?? 0), ly + (layer?.transform.y ?? 0), W, H)

    // Build cursor anchor (pending anchor with handle preview, or just mouse position)
    const cursorAnchor: BezierAnchor = {
      x: this.mouseWorld.x, y: this.mouseWorld.y,
      handleIn: null, handleOut: null, type: 'corner',
    }
    if (this._pendingAnchor && this._isDragging) {
      const world = this.mouseWorld
      const pa = this._pendingAnchor
      const dx = world.x - pa.x, dy = world.y - pa.y
      cursorAnchor.x = pa.x; cursorAnchor.y = pa.y
      cursorAnchor.handleIn = { x: pa.x - dx, y: pa.y - dy }
      cursorAnchor.handleOut = { x: pa.x + dx, y: pa.y + dy }
      cursorAnchor.type = 'smooth'
    }

    strokeCtx.lineCap = 'round'
    strokeCtx.lineJoin = 'round'

    // 1. Draw committed segments (stroke color + subtle glow)
    if (this.anchors.length >= 2) {
      strokeCtx.strokeStyle = this.settings.strokeColor
      strokeCtx.lineWidth = Math.max(1, this.settings.strokeWidth * board.camera.zoom)
      strokeCtx.setLineDash([])
      strokeCtx.globalAlpha = this.settings.opacity * 0.72
      strokeCtx.shadowBlur = 10
      strokeCtx.shadowColor = 'rgba(96, 205, 255, 0.35)'
      for (let i = 1; i < this.anchors.length; i++) {
        const prev = this.anchors[i - 1]!
        const curr = this.anchors[i]!
        const ps = toScreen(prev.x, prev.y)
        const cs = toScreen(curr.x, curr.y)
        const cp1 = prev.handleOut ? toScreen(prev.handleOut.x, prev.handleOut.y) : ps
        const cp2 = curr.handleIn ? toScreen(curr.handleIn.x, curr.handleIn.y) : cs
        strokeCtx.beginPath()
        strokeCtx.moveTo(ps.x, ps.y)
        strokeCtx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, cs.x, cs.y)
        strokeCtx.stroke()
      }
      strokeCtx.shadowBlur = 0
    }

    // 2. Draw rubber-band: last committed anchor → cursor (dashed gradient tail)
    if (this.anchors.length >= 1) {
      const lastA = this.anchors[this.anchors.length - 1]!
      const lastS = toScreen(lastA.x, lastA.y)
      const cursorS = toScreen(cursorAnchor.x, cursorAnchor.y)
      const dx = cursorS.x - lastS.x, dy = cursorS.y - lastS.y
      if (dx * dx + dy * dy > 4) {
        const grad = strokeCtx.createLinearGradient(lastS.x, lastS.y, cursorS.x, cursorS.y)
        grad.addColorStop(0, 'rgba(96, 205, 255, 0.72)')
        grad.addColorStop(0.55, 'rgba(96, 205, 255, 0.32)')
        grad.addColorStop(1, 'rgba(96, 205, 255, 0.04)')
        const cp1 = lastA.handleOut ? toScreen(lastA.handleOut.x, lastA.handleOut.y) : lastS
        const cp2 = cursorAnchor.handleIn ? toScreen(cursorAnchor.handleIn.x, cursorAnchor.handleIn.y) : cursorS
        strokeCtx.strokeStyle = grad
        strokeCtx.lineWidth = 1.5
        strokeCtx.setLineDash([5, 4])
        strokeCtx.globalAlpha = 1
        strokeCtx.beginPath()
        strokeCtx.moveTo(lastS.x, lastS.y)
        strokeCtx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, cursorS.x, cursorS.y)
        strokeCtx.stroke()
        strokeCtx.setLineDash([])
      }
    }

    // 3. PENDING anchor (the one being placed RIGHT NOW): always draw an
    // anchor circle at its position. While dragging, also draw both bezier
    // handles + tether lines so the user sees the curve being shaped in
    // real time. This is the preview the user said was missing during
    // drag — previously we only rendered a soft dot for the very first
    // anchor and nothing for subsequent ones.
    if (this._pendingAnchor) {
      const pa = this._pendingAnchor
      const ps = toScreen(pa.x, pa.y)
      // Anchor circle for the pending point.
      strokeCtx.globalAlpha = 1
      strokeCtx.setLineDash([])
      strokeCtx.beginPath()
      strokeCtx.arc(ps.x, ps.y, 5, 0, Math.PI * 2)
      strokeCtx.fillStyle = '#fff'
      strokeCtx.strokeStyle = '#63b3ed'
      strokeCtx.lineWidth = 2
      strokeCtx.fill(); strokeCtx.stroke()

      // Live handle preview while dragging.
      if (this._isDragging && cursorAnchor.handleIn && cursorAnchor.handleOut) {
        const hIn = toScreen(cursorAnchor.handleIn.x, cursorAnchor.handleIn.y)
        const hOut = toScreen(cursorAnchor.handleOut.x, cursorAnchor.handleOut.y)
        // Tether lines.
        strokeCtx.strokeStyle = 'rgba(99,179,237,0.6)'
        strokeCtx.lineWidth = 1
        strokeCtx.setLineDash([3, 3])
        strokeCtx.beginPath(); strokeCtx.moveTo(hIn.x, hIn.y); strokeCtx.lineTo(hOut.x, hOut.y); strokeCtx.stroke()
        strokeCtx.setLineDash([])
        // Handle squares.
        for (const h of [hIn, hOut]) {
          strokeCtx.fillStyle = '#fff'
          strokeCtx.strokeStyle = '#63b3ed'
          strokeCtx.lineWidth = 1.5
          strokeCtx.fillRect(h.x - 3.5, h.y - 3.5, 7, 7)
          strokeCtx.strokeRect(h.x - 3.5, h.y - 3.5, 7, 7)
        }
      }
    }

    // Draw handles for committed anchors
    strokeCtx.globalAlpha = 1
    for (const a of this.anchors) {
      const as = toScreen(a.x, a.y)
      if (a.handleIn) {
        const hs = toScreen(a.handleIn.x, a.handleIn.y)
        strokeCtx.strokeStyle = 'rgba(99,179,237,0.5)'
        strokeCtx.lineWidth = 1
        strokeCtx.setLineDash([3, 3])
        strokeCtx.beginPath(); strokeCtx.moveTo(as.x, as.y); strokeCtx.lineTo(hs.x, hs.y); strokeCtx.stroke()
        strokeCtx.fillStyle = '#fff'
        strokeCtx.strokeStyle = '#63b3ed'
        strokeCtx.lineWidth = 1.5
        strokeCtx.setLineDash([])
        strokeCtx.fillRect(hs.x - 3.5, hs.y - 3.5, 7, 7)
        strokeCtx.strokeRect(hs.x - 3.5, hs.y - 3.5, 7, 7)
      }
      if (a.handleOut) {
        const hs = toScreen(a.handleOut.x, a.handleOut.y)
        strokeCtx.strokeStyle = 'rgba(99,179,237,0.5)'
        strokeCtx.lineWidth = 1
        strokeCtx.setLineDash([3, 3])
        strokeCtx.beginPath(); strokeCtx.moveTo(as.x, as.y); strokeCtx.lineTo(hs.x, hs.y); strokeCtx.stroke()
        strokeCtx.fillStyle = '#fff'
        strokeCtx.strokeStyle = '#63b3ed'
        strokeCtx.lineWidth = 1.5
        strokeCtx.setLineDash([])
        strokeCtx.fillRect(hs.x - 3.5, hs.y - 3.5, 7, 7)
        strokeCtx.strokeRect(hs.x - 3.5, hs.y - 3.5, 7, 7)
      }
      // Anchor circle
      strokeCtx.setLineDash([])
      strokeCtx.beginPath()
      strokeCtx.arc(as.x, as.y, 5, 0, Math.PI * 2)
      strokeCtx.fillStyle = '#fff'
      strokeCtx.strokeStyle = '#63b3ed'
      strokeCtx.lineWidth = 2
      strokeCtx.fill(); strokeCtx.stroke()
    }

    // Close-path indicator: highlight first anchor when mouse is near it
    if (this.anchors.length >= 2) {
      const first = this.anchors[0]!
      const fs = toScreen(first.x, first.y)
      const dx = this.mouseScreen.x - fs.x, dy = this.mouseScreen.y - fs.y
      if (dx * dx + dy * dy <= CLOSE_RADIUS_SCREEN * CLOSE_RADIUS_SCREEN) {
        strokeCtx.beginPath()
        strokeCtx.arc(fs.x, fs.y, 9, 0, Math.PI * 2)
        strokeCtx.strokeStyle = 'rgba(99,179,237,0.9)'
        strokeCtx.lineWidth = 2
        strokeCtx.stroke()
      }
    }

    strokeCtx.restore()
  }

  private toLayerCoords(sx: number, sy: number, layer: VectorLayer) {
    const board = this.board!
    const w = board.camera.screenToWorld(sx, sy, board.logicalWidth, board.logicalHeight)
    return { x: w.x - layer.transform.x, y: w.y - layer.transform.y }
  }
}
