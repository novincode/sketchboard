import { Transform } from '../Transform'
import type { Camera } from '../Camera'
import type { BlendMode } from '../types'
// Forward reference — GroupLayer imports Layer, so we use a type-only alias.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GroupLayerRef = any

let _nextId = 1

export abstract class Layer {
  abstract readonly type: string

  readonly id: string
  name: string
  visible: boolean = true
  opacity: number = 1         // 0–1
  blendMode: BlendMode = 'normal'
  transform: Transform = Transform.identity()

  /**
   * Parent group, or null when this layer is at the Board root.
   * Maintained by GroupLayer.add/remove and Board.addLayer/removeLayer.
   * Never mutate directly — go through Board.moveLayer / GroupLayer methods.
   */
  parent: GroupLayerRef | null = null

  constructor(name?: string) {
    this.id = `layer-${_nextId++}`
    this.name = name ?? this.id
  }

  abstract render(ctx: CanvasRenderingContext2D, camera: Camera): void
  abstract clone(): Layer
}
