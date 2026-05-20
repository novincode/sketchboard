import type { Renderer } from './Renderer'
import type { Layer } from '../layers/Layer'
import type { Camera } from '../Camera'

export class Canvas2DRenderer implements Renderer {
  private ctx: CanvasRenderingContext2D

  constructor(
    private canvas: HTMLCanvasElement,
    private background: string = 'transparent',
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D rendering context')
    this.ctx = ctx
  }

  render(layers: ReadonlyArray<Layer>, camera: Camera): void {
    const { width, height } = this.canvas
    this.ctx.clearRect(0, 0, width, height)

    if (this.background !== 'transparent') {
      this.ctx.fillStyle = this.background
      this.ctx.fillRect(0, 0, width, height)
    }

    this.ctx.save()
    camera.applyToContext(this.ctx, width, height)

    for (const layer of layers) {
      if (!layer.visible) continue
      layer.render(this.ctx, camera)
    }

    this.ctx.restore()
  }

  resize(width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height
  }

  destroy(): void {
    // Canvas2D context is garbage collected with the canvas
  }
}
