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
    if (!layer || layer.type !== 'vector') return
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
    const before = this.activeLayer.strokes.slice()
    const stroke: VectorStroke = this.activeLayer.createStroke(
      this.points.map((p) => ({ x: p.lx, y: p.ly, pressure: p.pressure })),
      `rgb(${r},${g},${b})`,
      this.settings.size,
      this.settings.opacity,
      this.settings.compositeOperation,
    )
    this.activeLayer.addStroke(stroke)

    const layer = this.activeLayer
    const board = this.board
    board.history.push({
      undo: () => { layer.strokes = before; board.markDirty() },
      redo: () => { layer.addStroke(stroke); board.markDirty() },
    })

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
