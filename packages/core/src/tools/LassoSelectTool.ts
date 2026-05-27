import { Tool } from './Tool'
import type { PointerData } from '../types'
import { VectorLayer, type VectorStroke, type VectorPath } from '../layers/VectorLayer'
import { RasterLayer } from '../layers/RasterLayer'
import { polygonCoverage } from '../vector/vectorSplit'
import type { SelectTool } from './SelectTool'

/**
 * Lasso selection — freeform polygon. On commit:
 *   - VectorLayer: splits each touched element at the polygon boundary,
 *     replacing the original with the OUTSIDE parts and adding the INSIDE
 *     parts as new elements. The inside pieces are then selected via
 *     SelectTool so the user can move/cut/delete them.
 *   - RasterLayer: stores the polygon as a "raster lasso selection" on the
 *     active SelectTool. SelectTool.deleteSelected() honors it by clearing
 *     pixels inside the polygon. Future: lift-and-move support.
 *
 * Unified geometry: lasso splitting uses the same `splitByCoverage` primitive
 * as EraserTool's pixel mode, so behavior stays consistent.
 */
export class LassoSelectTool extends Tool {
  private points: Array<{ sx: number; sy: number }> = []
  private isDrawing = false
  private _overlayPending = false

  onActivate(): void {
    if (this.board) this.board.canvas.style.cursor = 'crosshair'
  }

  onDeactivate(): void {
    if (this.board) this.board.canvas.style.cursor = ''
    this.board?.clearStrokeCanvas()
    this.points = []
    this.isDrawing = false
  }

  onPointerDown(e: PointerData): void {
    this.points = [{ sx: e.x, sy: e.y }]
    this.isDrawing = true
    this.scheduleOverlayRedraw()
  }

  onPointerMove(e: PointerData): void {
    if (!this.isDrawing) return
    this.points.push({ sx: e.x, sy: e.y })
    this.scheduleOverlayRedraw()
  }

  onPointerUp(_e: PointerData): void {
    if (!this.isDrawing || !this.board) return
    this.isDrawing = false
    this._commitSelection()
  }

  onPointerCancel(_e: PointerData): void {
    this.isDrawing = false
    this.points = []
    this.board?.clearStrokeCanvas()
  }

  private _commitSelection(): void {
    const board = this.board!
    const layer = board.getActiveLayer()
    if (this.points.length < 3) {
      this.points = []
      board.clearStrokeCanvas()
      return
    }

    // Convert lasso screen points to world coordinates first — that's the
    // anchor for both vector (layer-local subtract) and raster (no transform
    // needed; we draw directly on the raster canvas in world units).
    const worldPoly = this.points.map((p) =>
      board.camera.screenToWorld(p.sx, p.sy, board.logicalWidth, board.logicalHeight),
    )

    if (layer instanceof VectorLayer) {
      this._commitVector(layer, worldPoly)
    } else if (layer instanceof RasterLayer) {
      this._commitRaster(layer)
    } else {
      // Unknown layer kind — quietly drop the lasso.
      this.points = []
      board.clearStrokeCanvas()
    }
  }

  /**
   * Vector branch: split each touched element at the polygon boundary using
   * the unified VectorLayer.splitByCoverage primitive. The INSIDE pieces are
   * added to the layer (so the user can see them as a selection) and selected
   * via SelectTool. The OUTSIDE pieces replace the originals. Single history
   * entry so the operation is one undo.
   */
  private _commitVector(layer: VectorLayer, worldPoly: ReadonlyArray<{ x: number; y: number }>): void {
    const board = this.board!
    const lx = layer.transform.x, ly = layer.transform.y
    const localPoly = worldPoly.map((p) => ({ x: p.x - lx, y: p.y - ly }))
    const isCovered = polygonCoverage(localPoly)

    // Snapshot pre-split state so a single history entry covers the lasso op.
    const beforeStrokes = layer.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
    const beforePaths = layer.paths.map((p) => ({
      ...p, anchors: p.anchors.map((a) => ({ ...a, handleIn: a.handleIn ? { ...a.handleIn } : null, handleOut: a.handleOut ? { ...a.handleOut } : null })),
    }))

    const result = layer.splitByCoverage(isCovered)

    // Add cut pieces back into the layer as new elements so they're visible
    // and selectable. (If we tossed them, the user couldn't do anything with
    // their selection — defeating the point of lasso.)
    const selectionIds: string[] = []
    for (const s of result.cutStrokes) { layer.addStroke(s); selectionIds.push(s.id) }
    for (const p of result.cutPaths) { layer.addPath(p); selectionIds.push(p.id) }

    const afterStrokes = layer.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
    const afterPaths = layer.paths.map((p) => ({
      ...p, anchors: p.anchors.map((a) => ({ ...a, handleIn: a.handleIn ? { ...a.handleIn } : null, handleOut: a.handleOut ? { ...a.handleOut } : null })),
    }))

    if (result.originalStrokes.length === 0 && result.originalPaths.length === 0 && selectionIds.length === 0) {
      // Nothing was actually inside the lasso — fall back to legacy center-of-mass
      // hit test so a "marquee around an existing element" still selects it
      // (older behavior users may rely on).
      this._fallbackLegacySelection(layer, localPoly)
      this.points = []
      board.clearStrokeCanvas()
      return
    }

    board.history.push({
      undo: () => {
        layer.strokes = beforeStrokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
        layer.paths = beforePaths.map((p) => ({ ...p, anchors: p.anchors.map((a) => ({ ...a, handleIn: a.handleIn ? { ...a.handleIn } : null, handleOut: a.handleOut ? { ...a.handleOut } : null })) }))
        board.markDirty()
      },
      redo: () => {
        layer.strokes = afterStrokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
        layer.paths = afterPaths.map((p) => ({ ...p, anchors: p.anchors.map((a) => ({ ...a, handleIn: a.handleIn ? { ...a.handleIn } : null, handleOut: a.handleOut ? { ...a.handleOut } : null })) }))
        board.markDirty()
      },
    })

    this.points = []
    board.clearStrokeCanvas()
    board.markDirty()

    const selectTool = board.getTool<SelectTool>('select')
    if (selectTool && selectionIds.length > 0) {
      selectTool.setSelectedIds(selectionIds)
    }
    board.setActiveTool('select')
  }

  /**
   * Legacy center-of-mass selection — used as a fallback when the lasso
   * didn't actually cut any geometry (e.g. user drew a huge polygon around
   * a small element).
   */
  private _fallbackLegacySelection(layer: VectorLayer, localPoly: ReadonlyArray<{ x: number; y: number }>): void {
    const board = this.board!
    const isInside = polygonCoverage(localPoly)
    const selectedIds: string[] = []
    for (const stroke of layer.strokes) {
      if (stroke.points.length === 0) continue
      const cx = stroke.points.reduce((s, p) => s + p.x, 0) / stroke.points.length
      const cy = stroke.points.reduce((s, p) => s + p.y, 0) / stroke.points.length
      if (isInside(cx, cy)) selectedIds.push(stroke.id)
    }
    for (const path of layer.paths) {
      if (path.anchors.length === 0) continue
      const cx = path.anchors.reduce((s, a) => s + a.x, 0) / path.anchors.length
      const cy = path.anchors.reduce((s, a) => s + a.y, 0) / path.anchors.length
      if (isInside(cx, cy)) selectedIds.push(path.id)
    }
    const selectTool = board.getTool<SelectTool>('select')
    if (selectTool) selectTool.setSelectedIds(selectedIds)
    board.setActiveTool('select')
  }

  /**
   * Raster branch: hand the polygon (as screen points) to SelectTool so the
   * user can press Delete to clear those pixels, or Cmd+Shift+I to invert,
   * etc. Selection itself is non-destructive — it's just a stored polygon.
   */
  private _commitRaster(layer: RasterLayer): void {
    const board = this.board!
    // Convert screen → layer-local for the raster polygon. Raster layers
    // are stored at native pixel resolution, ignoring camera zoom — so we
    // sample in WORLD coords and subtract layer.transform to get local.
    const localPoly = this.points.map((p) => {
      const w = board.camera.screenToWorld(p.sx, p.sy, board.logicalWidth, board.logicalHeight)
      return { x: w.x - layer.transform.x, y: w.y - layer.transform.y }
    })
    const select = board.getTool<SelectTool>('select')
    if (select) {
      select.setRasterLassoSelection({ layerId: layer.id, polygon: localPoly })
    }
    this.points = []
    board.clearStrokeCanvas()
    board.setActiveTool('select')
  }

  // ── Overlay ────────────────────────────────────────────────────────────────

  private scheduleOverlayRedraw(): void {
    if (this._overlayPending) return
    this._overlayPending = true
    requestAnimationFrame(() => {
      this._overlayPending = false
      this._redrawOverlay()
    })
  }

  private _redrawOverlay(): void {
    const board = this.board
    if (!board?.strokeCtx) return
    const { strokeCtx } = board
    const dpr = window.devicePixelRatio ?? 1
    strokeCtx.clearRect(0, 0, strokeCtx.canvas.width, strokeCtx.canvas.height)

    if (this.points.length < 2) return

    strokeCtx.save()
    strokeCtx.scale(dpr, dpr)

    strokeCtx.beginPath()
    strokeCtx.moveTo(this.points[0]!.sx, this.points[0]!.sy)
    for (let i = 1; i < this.points.length; i++) {
      strokeCtx.lineTo(this.points[i]!.sx, this.points[i]!.sy)
    }
    strokeCtx.closePath()

    strokeCtx.strokeStyle = 'rgba(99,179,237,0.9)'
    strokeCtx.lineWidth = 1.5
    strokeCtx.setLineDash([5, 4])
    strokeCtx.stroke()

    strokeCtx.fillStyle = 'rgba(99,179,237,0.07)'
    strokeCtx.fill()

    strokeCtx.restore()
  }
}
