import { BrushTool } from './BrushTool'
import { Vec2 } from '../math/Vec2'

/** Textured pencil — slight randomized jitter for a grainy, graphite feel */
export class PencilTool extends BrushTool {
  constructor() {
    super()
    this.settings = {
      ...this.settings,
      size: 8,
      hardness: 0.95,
      opacity: 0.85,
      pressureAffectsSize: true,
      pressureAffectsOpacity: true,
    }
  }

  protected drawStamp(
    ctx: CanvasRenderingContext2D,
    pos: Vec2,
    size: number,
    opacity: number,
  ): void {
    // Add slight jitter for the pencil texture effect
    const jitter = size * 0.12
    const jx = pos.x + (Math.random() - 0.5) * jitter
    const jy = pos.y + (Math.random() - 0.5) * jitter
    const sizeVariation = size * (0.8 + Math.random() * 0.4)
    const opacityVariation = opacity * (0.75 + Math.random() * 0.25)

    super.drawStamp(ctx, new Vec2(jx, jy), sizeVariation, opacityVariation)
  }
}
