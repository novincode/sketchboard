import { Tool } from './Tool'
import { Color } from '../math/Color'
import type { PointerData } from '../types'
import { VectorLayer } from '../layers/VectorLayer'
import type { VectorStroke } from '../layers/VectorLayer'

export interface VectorBrushSettings {
  size: number
  opacity: number
  color: Color
  compositeOperation: GlobalCompositeOperation
  /** When true, new strokes append to the last stroke instead of creating a new one */
  merge: boolean
  /** 0 = no simplification, 1 = maximum (fewer points, more rigid). Default 0.2 */
  streamline: number
}

interface VPt {
  sx: number; sy: number   // screen-space CSS pixels (for overlay preview)
  lx: number; ly: number   // layer-local world pixels (for commit)
  pressure: number
}

export class VectorBrushTool extends Tool {
  settings: VectorBrushSettings = {
    size: 4,
    opacity: 1,
    color: Color.black(),
    compositeOperation: 'source-over',
    merge: false,
    streamline: 0.2,
  }

  private isDrawing = false
  private points: VPt[] = []
  private activeLayer: VectorLayer | null = null
  private _overlayPending = false

  private get usesOverlay(): boolean {
    return !!this.board?.strokeCtx
  }

  onPointerDown(e: PointerData): void {
    if (!this.board) return
    const layer = this.board.getActiveLayer() as VectorLayer | undefined
    if (!layer || layer.type !== 'vector') {
      this.board.hooks.drawBlocked.call({ reason: 'wrong-layer-type' })
      return
    }
    if (!layer.visible) {
      this.board.hooks.drawBlocked.call({ reason: 'layer-hidden' })
      return
    }
    this.activeLayer = layer
    this.isDrawing = true
    this.points = []
    this.addPoint(e)
    if (this.usesOverlay) {
      this.board.clearStrokeCanvas()
      this.scheduleOverlayRedraw()
    }
  }

  onPointerMove(e: PointerData): void {
    if (!this.isDrawing || !this.board) return
    this.addPoint(e)
    if (this.usesOverlay) this.scheduleOverlayRedraw()
  }

  onPointerUp(e: PointerData): void {
    if (!this.isDrawing || !this.board || !this.activeLayer) return
    this.addPoint(e)

    const { r, g, b } = this.settings.color
    const rawPts = this.points.map((p) => ({ x: p.lx, y: p.ly, pressure: p.pressure }))
    const newPts = this.settings.streamline > 0
      ? douglasPeucker(rawPts, this.settings.streamline * 4)
      : rawPts
    const layer = this.activeLayer
    const board = this.board

    if (this.settings.merge && layer.strokes.length > 0) {
      const lastStroke = layer.strokes[layer.strokes.length - 1]!
      const beforePoints = lastStroke.points.slice()
      lastStroke.points = [...lastStroke.points, ...newPts]
      board.history.push({
        undo: () => { lastStroke.points = [...beforePoints]; board.markDirty() },
        redo: () => { lastStroke.points = [...beforePoints, ...newPts]; board.markDirty() },
      })
    } else {
      const beforeStrokes = layer.strokes.slice()
      const stroke: VectorStroke = layer.createStroke(
        newPts,
        `rgb(${r},${g},${b})`,
        this.settings.size,
        this.settings.opacity,
        this.settings.compositeOperation,
      )
      layer.addStroke(stroke)
      board.history.push({
        undo: () => { layer.strokes = [...beforeStrokes]; board.markDirty() },
        redo: () => { layer.strokes = [...beforeStrokes, stroke]; board.markDirty() },
      })
    }

    if (this.usesOverlay) board.clearStrokeCanvas()
    this.isDrawing = false
    this.activeLayer = null
    this.points = []
    board.markDirty()
  }

  onPointerCancel(_e: PointerData): void {
    if (!this.isDrawing || !this.board) return
    if (this.usesOverlay) this.board.clearStrokeCanvas()
    this.isDrawing = false
    this.activeLayer = null
    this.points = []
  }

  private addPoint(e: PointerData): void {
    if (!this.board || !this.activeLayer) return
    const world = this.board.camera.screenToWorld(
      e.x, e.y,
      this.board.logicalWidth,
      this.board.logicalHeight,
    )
    this.points.push({
      sx: e.x, sy: e.y,
      lx: world.x - this.activeLayer.transform.x,
      ly: world.y - this.activeLayer.transform.y,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    })
  }

  private scheduleOverlayRedraw(): void {
    if (this._overlayPending) return
    this._overlayPending = true
    requestAnimationFrame(() => {
      this._overlayPending = false
      if (this.isDrawing) this.redrawOverlayFull()
    })
  }

  private redrawOverlayFull(): void {
    const board = this.board!
    const { strokeCtx } = board
    if (!strokeCtx || this.points.length === 0) return
    const dpr = window.devicePixelRatio ?? 1
    const zoom = board.camera.zoom

    strokeCtx.clearRect(0, 0, strokeCtx.canvas.width, strokeCtx.canvas.height)
    strokeCtx.save()
    strokeCtx.scale(dpr, dpr)

    const { r, g, b } = this.settings.color
    strokeCtx.strokeStyle = `rgb(${r},${g},${b})`
    strokeCtx.fillStyle = `rgb(${r},${g},${b})`
    strokeCtx.lineCap = 'round'
    strokeCtx.lineJoin = 'round'
    strokeCtx.globalAlpha = this.settings.opacity
    strokeCtx.globalCompositeOperation = this.settings.compositeOperation

    const screenStroke = {
      id: '',
      points: this.points.map((p) => ({ x: p.sx, y: p.sy, pressure: p.pressure })),
      color: `rgb(${r},${g},${b})`,
      lineWidth: this.settings.size * zoom,
      opacity: this.settings.opacity,
      compositeOperation: this.settings.compositeOperation,
    }
    VectorLayer.drawStroke(strokeCtx, screenStroke)

    strokeCtx.restore()
  }
}

// ── Douglas-Peucker polyline simplification ────────────────────────────────────

function perpendicularDist(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x, dy = b.y - a.y
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y)
}

function douglasPeucker<T extends { x: number; y: number }>(pts: T[], epsilon: number): T[] {
  if (pts.length <= 2) return pts
  let maxDist = 0, maxIdx = 0
  const first = pts[0]!, last = pts[pts.length - 1]!
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDist(pts[i]!, first, last)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(pts.slice(0, maxIdx + 1), epsilon)
    const right = douglasPeucker(pts.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}
