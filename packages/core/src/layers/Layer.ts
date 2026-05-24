import { Transform } from '../Transform'
import type { Camera } from '../Camera'
import type { BlendMode } from '../types'
// Forward reference — GroupLayer imports Layer, so we use a type-only alias.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GroupLayerRef = any

let _nextId = 1

/**
 * A reference to another layer used as a clipping mask.
 *
 * The referenced layer is rendered to an offscreen buffer in screen space and
 * its alpha channel is used to clip THIS layer's render. Multiple masks union
 * their alpha (overlapping opaque regions both keep the target visible) so a
 * single target can receive "stack" masking from several overlays.
 *
 * `mode: 'inverse-alpha'` flips the polarity — the target is visible where
 * the overlay is TRANSPARENT instead.
 *
 * The reference is by ID; the mask can live anywhere in the layer tree
 * (root, nested, group, raster, vector — all uniform).
 */
export interface MaskRef {
  layerId: string
  mode?: 'alpha' | 'inverse-alpha'
}

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

  /**
   * Mask overlays applied to this layer during rendering. Empty = no masking.
   * See {@link MaskRef}. Mutate via Board.setMasks / addMask / removeMask so
   * the renderer's cache invalidates correctly.
   */
  masks: MaskRef[] = []

  constructor(name?: string) {
    this.id = `layer-${_nextId++}`
    this.name = name ?? this.id
  }

  abstract render(ctx: CanvasRenderingContext2D, camera: Camera): void
  abstract clone(): Layer
}
