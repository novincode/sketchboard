import { Tool } from './Tool'
import { Vec2 } from '../math/Vec2'
import { Color } from '../math/Color'
import type { PointerData } from '../types'
import type { RasterLayer } from '../layers/RasterLayer'

export interface BrushSettings {
  size: number
  opacity: number
  /** 0 = fully soft, 1 = hard edge */
  hardness: number
  pressureAffectsSize: boolean
  pressureAffectsOpacity: boolean
  color: Color
  /** Blend mode for each stamp, normally 'source-over' */
  compositeOperation: GlobalCompositeOperation
}

interface StrokePoint {
  pos: Vec2
  pressure: number
}

export class BrushTool extends Tool {
  settings: BrushSettings = {
    size: 16,
    opacity: 1,
    hardness: 0.85,
    pressureAffectsSize: true,
    pressureAffectsOpacity: false,
    color: Color.black(),
    compositeOperation: 'source-over',
  }

  private isDrawing = false
  private points: StrokePoint[] = []
  private activeLayer: RasterLayer | null = null
  /** Snapshot before stroke starts — pushed to history on commit */
  private preStrokeSnapshot: ImageData | null = null

  onPointerDown(e: PointerData): void {
    if (!this.board) return
    const layer = this.board.getActiveLayer()
    if (!layer) return

    // dynamic import guard — avoids hard coupling to RasterLayer type in Tool base
    const rl = layer as RasterLayer
    if (typeof rl.ctx === 'undefined') return

    this.activeLayer = rl
    this.isDrawing = true
    this.points = []
    this.preStrokeSnapshot = rl.getImageData()

    this.addPoint(e)
    this.renderStroke()
    this.board.markDirty()
  }

  onPointerMove(e: PointerData): void {
    if (!this.isDrawing || !this.activeLayer || !this.board) return
    this.addPoint(e)
    this.renderStroke()
    this.board.markDirty()
  }

  onPointerUp(e: PointerData): void {
    if (!this.isDrawing || !this.board) return
    this.addPoint(e)
    this.renderStroke()
    this.commitHistory()
    this.isDrawing = false
    this.activeLayer = null
    this.points = []
    this.board.markDirty()
  }

  onPointerCancel(_e: PointerData): void {
    if (!this.isDrawing || !this.activeLayer) return
    // revert to pre-stroke state
    if (this.preStrokeSnapshot) {
      this.activeLayer.putImageData(this.preStrokeSnapshot)
    }
    this.isDrawing = false
    this.activeLayer = null
    this.points = []
    this.board?.markDirty()
  }

  private addPoint(e: PointerData): void {
    if (!this.board) return
    const { canvas } = this.board
    const world = this.board.camera.screenToWorld(e.x, e.y, canvas.width, canvas.height)
    this.points.push({ pos: world, pressure: e.pressure > 0 ? e.pressure : 0.5 })
  }

  private renderStroke(): void {
    if (!this.activeLayer || this.points.length === 0) return
    const ctx = this.activeLayer.ctx
    const last = this.points[this.points.length - 1]!

    const effectiveSize = this.settings.pressureAffectsSize
      ? this.settings.size * (0.2 + last.pressure * 0.8)
      : this.settings.size
    const effectiveOpacity = this.settings.pressureAffectsOpacity
      ? this.settings.opacity * (0.3 + last.pressure * 0.7)
      : this.settings.opacity

    if (this.points.length === 1) {
      this.drawStamp(ctx, last.pos, effectiveSize, effectiveOpacity)
      return
    }

    const prev = this.points[this.points.length - 2]!
    const dist = prev.pos.distanceTo(last.pos)
    const spacing = Math.max(1, effectiveSize * 0.2)
    const steps = Math.ceil(dist / spacing)

    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const pos = prev.pos.lerp(last.pos, t)
      this.drawStamp(ctx, pos, effectiveSize, effectiveOpacity)
    }
  }

  private drawStamp(
    ctx: CanvasRenderingContext2D,
    pos: Vec2,
    size: number,
    opacity: number,
  ): void {
    const radius = size / 2
    const { r, g, b } = this.settings.color
    const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius)
    gradient.addColorStop(0, `rgba(${r},${g},${b},${opacity})`)
    gradient.addColorStop(this.settings.hardness, `rgba(${r},${g},${b},${opacity})`)
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)

    ctx.save()
    ctx.globalCompositeOperation = this.settings.compositeOperation
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private commitHistory(): void {
    if (!this.board || !this.activeLayer || !this.preStrokeSnapshot) return
    const layer = this.activeLayer
    const before = this.preStrokeSnapshot
    const after = layer.getImageData()
    this.board.history.push({
      undo: () => layer.putImageData(before),
      redo: () => layer.putImageData(after),
    })
    this.preStrokeSnapshot = null
  }
}
