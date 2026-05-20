import { Layer } from './Layer'
import type { Camera } from '../Camera'

export class GroupLayer extends Layer {
  children: Layer[] = []

  constructor(name?: string) {
    super(name)
  }

  add(layer: Layer): void {
    this.children.push(layer)
  }

  remove(id: string): boolean {
    const idx = this.children.findIndex((l) => l.id === id)
    if (idx === -1) return false
    this.children.splice(idx, 1)
    return true
  }

  render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    ctx.save()
    ctx.globalAlpha = this.opacity
    this.transform.applyToContext(ctx)
    for (const child of this.children) {
      if (child.visible) child.render(ctx, camera)
    }
    ctx.restore()
  }

  clone(): GroupLayer {
    const copy = new GroupLayer(this.name)
    copy.opacity = this.opacity
    copy.blendMode = this.blendMode
    copy.transform = this.transform.clone()
    copy.children = this.children.map((c) => c.clone())
    return copy
  }
}
