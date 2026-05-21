import { Layer } from './Layer'
import type { Camera } from '../Camera'

export interface VectorStrokePoint {
  x: number
  y: number
  pressure: number
}

export interface VectorStroke {
  id: string
  points: VectorStrokePoint[]
  color: string
  lineWidth: number
  opacity: number
  compositeOperation: GlobalCompositeOperation
}

let _strokeId = 1

export class VectorLayer extends Layer {
  readonly type = 'vector' as const
  strokes: VectorStroke[] = []

  createStroke(
    points: VectorStrokePoint[],
    color: string,
    lineWidth: number,
    opacity = 1,
    compositeOperation: GlobalCompositeOperation = 'source-over',
  ): VectorStroke {
    return { id: `vs-${_strokeId++}`, points, color, lineWidth, opacity, compositeOperation }
  }

  addStroke(stroke: VectorStroke): void {
    this.strokes.push(stroke)
  }

  removeStroke(id: string): void {
    this.strokes = this.strokes.filter((s) => s.id !== id)
  }

  /** Remove any stroke whose points come within `radius` (layer-local px) of (x, y). */
  eraseAt(x: number, y: number, radius: number): boolean {
    const before = this.strokes.length
    this.strokes = this.strokes.filter((s) => {
      for (const p of s.points) {
        const dx = p.x - x
        const dy = p.y - y
        if (dx * dx + dy * dy <= radius * radius) return false
      }
      return true
    })
    return this.strokes.length !== before
  }

  render(ctx: CanvasRenderingContext2D, _camera: Camera): void {
    if (!this.visible || this.strokes.length === 0) return
    ctx.save()
    ctx.globalAlpha = this.opacity
    this.transform.applyToContext(ctx)

    for (const stroke of this.strokes) {
      if (stroke.points.length === 0) continue
      ctx.save()
      ctx.globalCompositeOperation = stroke.compositeOperation
      ctx.globalAlpha = stroke.opacity
      ctx.strokeStyle = stroke.color
      ctx.fillStyle = stroke.color
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      VectorLayer.drawStroke(ctx, stroke)
      ctx.restore()
    }

    ctx.restore()
  }

  static drawStroke(ctx: CanvasRenderingContext2D, stroke: VectorStroke): void {
    const pts = stroke.points
    if (pts.length === 0) return
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(pts[0]!.x, pts[0]!.y, stroke.lineWidth / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]!
      const p1 = pts[i]!
      ctx.lineWidth = stroke.lineWidth * (0.15 + ((p0.pressure + p1.pressure) / 2) * 0.85)
      let sx: number, sy: number
      if (i === 1) {
        sx = p0.x; sy = p0.y
      } else {
        const pp = pts[i - 2]!
        sx = (pp.x + p0.x) / 2
        sy = (pp.y + p0.y) / 2
      }
      let ex: number, ey: number
      if (i === pts.length - 1) {
        ex = p1.x; ey = p1.y
      } else {
        ex = (p0.x + p1.x) / 2
        ey = (p0.y + p1.y) / 2
      }
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.quadraticCurveTo(p0.x, p0.y, ex, ey)
      ctx.stroke()
    }
  }

  clone(): VectorLayer {
    const copy = new VectorLayer(this.name)
    copy.strokes = this.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
    copy.opacity = this.opacity
    copy.blendMode = this.blendMode
    copy.transform = this.transform.clone()
    return copy
  }
}
