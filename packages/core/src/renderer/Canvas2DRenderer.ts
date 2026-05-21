import type { Renderer } from './Renderer'
import type { Layer } from '../layers/Layer'
import type { Camera } from '../Camera'

export class Canvas2DRenderer implements Renderer {
  private ctx: CanvasRenderingContext2D
  private dpr: number

  constructor(
    private canvas: HTMLCanvasElement,
    private background: string = 'transparent',
    pixelRatio?: number,
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas2DRenderer: could not get 2D context')
    this.ctx = ctx
    this.dpr = pixelRatio ?? window.devicePixelRatio ?? 1
  }

  render(layers: ReadonlyArray<Layer>, camera: Camera): void {
    // canvas.width/height are in PHYSICAL pixels.
    // All coordinate math (camera, pointer events, brush) must be in LOGICAL CSS pixels.
    // We scale the context by dpr so that after the scale, 1 unit = 1 CSS px.
    const physicalW = this.canvas.width
    const physicalH = this.canvas.height
    const dpr = window.devicePixelRatio ?? this.dpr
    const logicalW = physicalW / dpr
    const logicalH = physicalH / dpr

    this.ctx.clearRect(0, 0, physicalW, physicalH)

    if (this.background && this.background !== 'transparent') {
      this.ctx.fillStyle = this.background
      this.ctx.fillRect(0, 0, physicalW, physicalH)
    }

    this.ctx.save()
    // Step 1: scale up by dpr so all subsequent coordinates are in logical CSS px
    this.ctx.scale(dpr, dpr)
    // Step 2: apply camera (expects logical dimensions)
    camera.applyToContext(this.ctx, logicalW, logicalH)

    for (const layer of layers) {
      if (!layer.visible) continue
      layer.render(this.ctx, camera)
    }

    this.ctx.restore()
  }

  resize(_width: number, _height: number): void {
    // Actual resize is handled by Board's ResizeObserver; nothing to do here.
  }

  destroy(): void {
    // No explicit cleanup needed for a 2D context.
  }
}
