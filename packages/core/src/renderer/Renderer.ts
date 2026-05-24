import type { Layer } from '../layers/Layer'
import type { Camera } from '../Camera'

/**
 * `lookupLayer` resolves a mask reference's `layerId` to the actual Layer
 * object anywhere in the tree (root or nested in a group). Board passes
 * `getLayerById` for this — the renderer doesn't import Board itself, so
 * the dependency stays one-directional.
 */
export interface Renderer {
  render(
    layers: ReadonlyArray<Layer>,
    camera: Camera,
    lookupLayer?: (id: string) => Layer | undefined,
  ): void
  resize(width: number, height: number): void
  destroy(): void
}
