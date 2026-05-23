import { Tool } from './Tool'
import type { PointerData } from '../types'
import { VectorLayer } from '../layers/VectorLayer'
import type { SelectTool } from './SelectTool'

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
    if (!(layer instanceof VectorLayer) || this.points.length < 3) {
      this.points = []
      board.clearStrokeCanvas()
      return
    }

    // Convert lasso screen points to world polygon
    const worldPoly = this.points.map((p) =>
      board.camera.screenToWorld(p.sx, p.sy, board.logicalWidth, board.logicalHeight),
    )
    const lx = layer.transform.x
    const ly = layer.transform.y
    const localPoly = worldPoly.map((p) => ({ x: p.x - lx, y: p.y - ly }))

    // Find all elements whose bounding-box center is inside the lasso polygon
    const selectedIds: string[] = []
    for (const stroke of layer.strokes) {
      if (stroke.points.length === 0) continue
      const cx = stroke.points.reduce((s, p) => s + p.x, 0) / stroke.points.length
      const cy = stroke.points.reduce((s, p) => s + p.y, 0) / stroke.points.length
      if (raycastPolygon(localPoly, cx, cy)) selectedIds.push(stroke.id)
    }
    for (const path of layer.paths) {
      if (path.anchors.length === 0) continue
      const cx = path.anchors.reduce((s, a) => s + a.x, 0) / path.anchors.length
      const cy = path.anchors.reduce((s, a) => s + a.y, 0) / path.anchors.length
      if (raycastPolygon(localPoly, cx, cy)) selectedIds.push(path.id)
    }

    this.points = []
    board.clearStrokeCanvas()

    // Hand off selection to SelectTool and switch to it
    const selectTool = board.getTool<SelectTool>('select')
    if (selectTool) {
      selectTool.setSelectedIds(selectedIds)
    }
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

function raycastPolygon(pts: Array<{ x: number; y: number }>, px: number, py: number): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x, yi = pts[i]!.y
    const xj = pts[j]!.x, yj = pts[j]!.y
    if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}
