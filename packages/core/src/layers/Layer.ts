import { Transform } from '../Transform'
import type { Camera } from '../Camera'
import type { BlendMode } from '../types'

let _nextId = 1

export abstract class Layer {
  abstract readonly type: string

  readonly id: string
  name: string
  visible: boolean = true
  opacity: number = 1         // 0–1
  blendMode: BlendMode = 'normal'
  transform: Transform = Transform.identity()

  constructor(name?: string) {
    this.id = `layer-${_nextId++}`
    this.name = name ?? this.id
  }

  abstract render(ctx: CanvasRenderingContext2D, camera: Camera): void
  abstract clone(): Layer
}
