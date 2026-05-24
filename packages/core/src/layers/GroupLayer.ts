import { Layer } from './Layer'
import type { Camera } from '../Camera'

/**
 * A nested group of layers. Composites children in order, applies its own
 * opacity / blendMode / transform on top.
 *
 * Children always have their `parent` pointer pointing back to this group.
 * Mutate children only via add()/remove()/insert() to keep that invariant.
 */
export class GroupLayer extends Layer {
  readonly type = 'group' as const
  children: Layer[] = []
  /** UI hint — collapsed in the layer panel. Has no effect on rendering. */
  collapsed: boolean = false

  constructor(name?: string) {
    super(name)
  }

  add(layer: Layer): void {
    this.insert(layer, this.children.length)
  }

  insert(layer: Layer, index: number): void {
    if (layer.parent) (layer.parent as GroupLayer).remove(layer.id)
    const clamped = Math.max(0, Math.min(index, this.children.length))
    this.children.splice(clamped, 0, layer)
    layer.parent = this
  }

  remove(id: string): Layer | null {
    const idx = this.children.findIndex((l) => l.id === id)
    if (idx === -1) return null
    const [removed] = this.children.splice(idx, 1)
    if (removed) removed.parent = null
    return removed ?? null
  }

  render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.children.length === 0) return
    ctx.save()
    ctx.globalAlpha *= this.opacity
    if (this.blendMode !== 'normal') {
      ctx.globalCompositeOperation = this.blendMode as GlobalCompositeOperation
    }
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
    copy.collapsed = this.collapsed
    copy.masks = this.masks.map((m) => ({ ...m }))
    for (const child of this.children) {
      const c = child.clone()
      copy.children.push(c)
      c.parent = copy
    }
    return copy
  }
}
