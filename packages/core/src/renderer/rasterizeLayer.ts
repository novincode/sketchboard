import type { Layer } from '../layers/Layer'

/**
 * Rasterize any Layer (RasterLayer, VectorLayer, GroupLayer) into an ImageData
 * of the requested size, in the coordinate space offset by (offsetX, offsetY).
 *
 * Used by reference-mask / fill-with-boundary code paths that need to sample a
 * non-active layer at the active layer's pixel grid. All layers currently
 * render in world coordinates (they ignore the Camera argument), so we just
 * translate the context by -offset to place the active layer's origin at (0,0).
 *
 * Returns null in non-DOM environments — callers should treat that as "skip".
 */
export function rasterizeLayer(
  layer: Layer,
  width: number,
  height: number,
  offsetX: number = 0,
  offsetY: number = 0,
): ImageData | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.translate(-offsetX, -offsetY)
  // All Layer.render impls in this codebase ignore the camera arg.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer.render(ctx, null as any)
  return ctx.getImageData(0, 0, width, height)
}
