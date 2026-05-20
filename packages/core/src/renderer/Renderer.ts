import type { Layer } from '../layers/Layer'
import type { Camera } from '../Camera'

export interface Renderer {
  render(layers: ReadonlyArray<Layer>, camera: Camera): void
  resize(width: number, height: number): void
  destroy(): void
}
