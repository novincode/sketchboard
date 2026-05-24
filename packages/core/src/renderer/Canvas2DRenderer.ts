import type { Renderer } from './Renderer'
import type { Layer } from '../layers/Layer'
import type { Camera } from '../Camera'

/**
 * Canvas-2D compositor with full mask-layer support.
 *
 * Standard render: dpr scale → camera transform → each layer renders into
 * the same context in order. That's the fast path for layers with no masks.
 *
 * Mask render (when `layer.masks` is non-empty): we draw the layer into a
 * private offscreen `targetScratch`, build a union of mask overlays in
 * another offscreen `maskScratch`, combine via `destination-in` (or
 * `destination-out` for inverse masks), then blit the result to the main
 * canvas. This pipeline is uniform across raster, vector, and group layers
 * — any layer can mask any other — and it preserves the camera transform
 * by configuring each scratch context with the same dpr+camera setup as
 * the main one. Scratch canvases are reused frame-to-frame and resized
 * lazily to match the main canvas's physical dimensions.
 */
export class Canvas2DRenderer implements Renderer {
  private ctx: CanvasRenderingContext2D
  private dpr: number

  // Reusable offscreen surfaces, lazily allocated and resized on demand.
  private _targetScratch: HTMLCanvasElement | null = null
  private _maskScratch: HTMLCanvasElement | null = null

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

  render(
    layers: ReadonlyArray<Layer>,
    camera: Camera,
    lookupLayer?: (id: string) => Layer | undefined,
  ): void {
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
    this.ctx.scale(dpr, dpr)
    camera.applyToContext(this.ctx, logicalW, logicalH)

    for (const layer of layers) {
      if (!layer.visible) continue
      this._renderLayer(layer, camera, logicalW, logicalH, physicalW, physicalH, dpr, lookupLayer)
    }

    this.ctx.restore()
  }

  /**
   * Render a single top-level layer, applying its mask stack if any.
   * (Nested children of a GroupLayer go through the group's own render —
   * group-level masks affect the group's combined output, not individual
   * children unless those children have their own masks too.)
   */
  private _renderLayer(
    layer: Layer,
    camera: Camera,
    logicalW: number, logicalH: number,
    physicalW: number, physicalH: number,
    dpr: number,
    lookupLayer?: (id: string) => Layer | undefined,
  ): void {
    if (!layer.masks || layer.masks.length === 0 || !lookupLayer) {
      // Fast path: no masks → render straight into the main context.
      layer.render(this.ctx, camera)
      return
    }

    // Resolve overlay layers; drop any that don't exist anymore (stale refs).
    const overlays = layer.masks
      .map((m) => ({ layer: lookupLayer(m.layerId), mode: m.mode ?? 'alpha' as const }))
      .filter((m): m is { layer: Layer; mode: 'alpha' | 'inverse-alpha' } => !!m.layer && m.layer !== layer)
    if (overlays.length === 0) {
      layer.render(this.ctx, camera)
      return
    }

    const targetCanvas = this._ensureScratch('target', physicalW, physicalH)
    const maskCanvas = this._ensureScratch('mask', physicalW, physicalH)
    const targetCtx = targetCanvas.getContext('2d')!
    const maskCtx = maskCanvas.getContext('2d')!

    // ── 1. Render the TARGET layer into its scratch with the same transform stack
    this._configureScratchContext(targetCtx, dpr, camera, logicalW, logicalH)
    layer.render(targetCtx, camera)
    targetCtx.restore()

    // ── 2. Render each overlay into the mask scratch (alpha union: source-over)
    this._configureScratchContext(maskCtx, dpr, camera, logicalW, logicalH)
    for (const { layer: overlayLayer } of overlays) {
      if (overlayLayer.visible) overlayLayer.render(maskCtx, camera)
    }
    maskCtx.restore()

    // ── 3. Clip target by mask (or inverse). We restore to physical-pixel
    //    coordinates first so the composite covers the entire scratch buffer.
    targetCtx.save()
    targetCtx.setTransform(1, 0, 0, 1, 0, 0)
    // If ANY overlay is inverse, we need a more nuanced merge. For now we
    // treat the entire stack as 'alpha' if any overlay is 'alpha'; if all
    // overlays are 'inverse-alpha', we use destination-out. This matches
    // user intent in the common cases without needing per-overlay passes.
    const allInverse = overlays.every((o) => o.mode === 'inverse-alpha')
    targetCtx.globalCompositeOperation = allInverse ? 'destination-out' : 'destination-in'
    targetCtx.drawImage(maskCanvas, 0, 0)
    targetCtx.restore()

    // ── 4. Blit the masked result onto the main canvas in screen space.
    //    The main ctx is currently set up with dpr scale + camera; we need
    //    raw screen-space drawImage, so temporarily reset its transform.
    this.ctx.save()
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.drawImage(targetCanvas, 0, 0)
    this.ctx.restore()
  }

  /** Lazy-allocate / resize a scratch canvas to match physical dimensions. */
  private _ensureScratch(kind: 'target' | 'mask', pw: number, ph: number): HTMLCanvasElement {
    const slot = kind === 'target' ? this._targetScratch : this._maskScratch
    if (slot && slot.width === pw && slot.height === ph) return slot
    const canvas = slot ?? document.createElement('canvas')
    canvas.width = pw
    canvas.height = ph
    if (kind === 'target') this._targetScratch = canvas
    else this._maskScratch = canvas
    return canvas
  }

  /**
   * Set up a scratch context to mirror the main ctx's coordinate space, then
   * clear it. Caller is responsible for `ctx.restore()` after layer.render
   * — we leave it in the saved state so the layer can `ctx.save/restore`
   * freely without leaking transform state.
   */
  private _configureScratchContext(
    ctx: CanvasRenderingContext2D,
    dpr: number, camera: Camera,
    logicalW: number, logicalH: number,
  ): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)
    camera.applyToContext(ctx, logicalW, logicalH)
  }

  resize(_width: number, _height: number): void {
    // Actual resize is handled by Board's ResizeObserver; nothing to do here.
  }

  destroy(): void {
    this._targetScratch = null
    this._maskScratch = null
  }
}
