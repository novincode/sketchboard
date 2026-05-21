import { Layer } from './Layer'
import type { Camera } from '../Camera'

export class RasterLayer extends Layer {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D

  /**
   * Optional background fill drawn behind the layer's pixels each frame.
   * Set to '#ffffff' to give the layer a white artboard appearance.
   * null = fully transparent (default).
   */
  backgroundColor: string | null = null

  constructor(
    public width: number,
    public height: number,
    name?: string,
  ) {
    super(name)
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('RasterLayer: could not get 2D context')
    this.ctx = ctx
  }

  render(ctx: CanvasRenderingContext2D, _camera: Camera): void {
    ctx.save()
    ctx.globalAlpha = this.opacity
    ctx.globalCompositeOperation = this.blendMode as GlobalCompositeOperation
    this.transform.applyToContext(ctx)

    // Draw optional background (artboard fill) before pixel content
    if (this.backgroundColor) {
      ctx.fillStyle = this.backgroundColor
      ctx.fillRect(0, 0, this.width, this.height)
    }

    ctx.drawImage(this.canvas, 0, 0)
    ctx.restore()
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  getImageData(x = 0, y = 0, w = this.width, h = this.height): ImageData {
    return this.ctx.getImageData(x, y, w, h)
  }

  putImageData(data: ImageData, x = 0, y = 0): void {
    this.ctx.putImageData(data, x, y)
  }

  /** Sample a single pixel at canvas-local coordinates (useful for eyedropper) */
  pickColor(x: number, y: number): [r: number, g: number, b: number, a: number] {
    const d = this.ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0]
  }

  clone(): RasterLayer {
    const copy = new RasterLayer(this.width, this.height, this.name)
    copy.ctx.drawImage(this.canvas, 0, 0)
    copy.opacity = this.opacity
    copy.blendMode = this.blendMode
    copy.transform = this.transform.clone()
    copy.backgroundColor = this.backgroundColor
    return copy
  }
}
