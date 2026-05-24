import { Camera } from './Camera'
import { BoardHooks } from './hooks/BoardHooks'
import { HistoryManager } from './history/HistoryManager'
import { PluginManager } from './plugins/PluginManager'
import { BrushRegistry } from './brushes/BrushRegistry'
import { Canvas2DRenderer } from './renderer/Canvas2DRenderer'
import { GestureManager } from './gestures/GestureManager'
import type { Layer } from './layers/Layer'
import { RasterLayer } from './layers/RasterLayer'
import { GroupLayer } from './layers/GroupLayer'
import { rasterizeLayer } from './renderer/rasterizeLayer'
import type { Tool } from './tools/Tool'
import type { Renderer } from './renderer/Renderer'
import type { Plugin } from './plugins/Plugin'
import type { BoardOptions } from './types'

export class Board {
  readonly canvas: HTMLCanvasElement
  readonly camera: Camera
  readonly hooks: BoardHooks
  readonly history: HistoryManager
  readonly plugins: PluginManager
  readonly brushRegistry: BrushRegistry

  private renderer: Renderer
  private gestureManager: GestureManager
  private layers: Layer[] = []
  private toolRegistry = new Map<string, Tool>()
  private _activeTool: Tool | null = null
  /** Transient tool override (Space-to-pan etc.) — never fires toolChanged hook */
  private _tempTool: Tool | null = null
  private _activeLayerId: string | null = null
  private rafId: number | null = null
  private _dirty = true
  private resizeObserver: ResizeObserver

  /** Logical (CSS) canvas width in pixels. Tracks the last ResizeObserver measurement. */
  private _logicalWidth = 0
  /** Logical (CSS) canvas height in pixels. Tracks the last ResizeObserver measurement. */
  private _logicalHeight = 0

  /**
   * Viewport-sized overlay canvas for active stroke visual feedback.
   * Drawing here is very cheap because no layer compositing is required during a stroke.
   * null when the container is a raw HTMLCanvasElement (can't add overlay).
   */
  strokeCanvas: HTMLCanvasElement | null = null
  strokeCtx: CanvasRenderingContext2D | null = null

  constructor(container: HTMLElement | HTMLCanvasElement, options: BoardOptions = {}) {
    this.brushRegistry = new BrushRegistry()
    if (container instanceof HTMLCanvasElement) {
      this.canvas = container
    } else {
      // Ensure the container can host absolute children
      if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative'
      }
      this.canvas = document.createElement('canvas')
      this.canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%'
      container.appendChild(this.canvas)

      // Stroke overlay — sits on top, pointer-events:none so gestures fall through
      this.strokeCanvas = document.createElement('canvas')
      this.strokeCanvas.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none'
      container.appendChild(this.strokeCanvas)
      this.strokeCtx = this.strokeCanvas.getContext('2d')!
    }

    this.hooks = new BoardHooks()
    this.camera = new Camera()
    this.history = new HistoryManager(() => this.markDirty(), options.historySize)
    this.renderer = new Canvas2DRenderer(this.canvas, options.background, options.pixelRatio)
    this.plugins = new PluginManager(this)
    this.gestureManager = new GestureManager(this.canvas, this.camera, this)

    const observeTarget =
      container instanceof HTMLCanvasElement ? container.parentElement ?? document.body : container

    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      this._logicalWidth = width
      this._logicalHeight = height
      const dpr = options.pixelRatio ?? window.devicePixelRatio ?? 1
      const pw = Math.round(width * dpr)
      const ph = Math.round(height * dpr)
      this.canvas.width = pw
      this.canvas.height = ph
      if (this.strokeCanvas) {
        this.strokeCanvas.width = pw
        this.strokeCanvas.height = ph
      }
      this.markDirty()
    })
    this.resizeObserver.observe(observeTarget)

    this.startRenderLoop()
  }

  // ─── Dimensions ────────────────────────────────────────────────────────────

  /** Logical (CSS) canvas width. Use this for all coordinate math. */
  get logicalWidth(): number {
    return this._logicalWidth || this.canvas.clientWidth || this.canvas.width
  }

  /** Logical (CSS) canvas height. Use this for all coordinate math. */
  get logicalHeight(): number {
    return this._logicalHeight || this.canvas.clientHeight || this.canvas.height
  }

  // ─── Plugin API ────────────────────────────────────────────────────────────

  use(plugin: Plugin): this {
    this.plugins.register(plugin)
    return this
  }

  // ─── Layer API ─────────────────────────────────────────────────────────────

  addLayer<T extends Layer>(layer: T): T {
    if (layer.parent) (layer.parent as GroupLayer).remove(layer.id)
    this.layers.push(layer)
    layer.parent = null
    this.hooks.layerAdded.call(layer)
    this.markDirty()
    return layer
  }

  /**
   * Recursively removes the layer with the given id, whether it sits at the
   * root or nested inside a GroupLayer. Returns true if found and removed.
   */
  removeLayer(id: string): boolean {
    const removed = this._detachLayer(id)
    if (!removed) return false
    if (this._activeLayerId === id) this._activeLayerId = null
    if (this.referenceLayerId === id) this.referenceLayerId = null
    // Strip any mask references to the gone layer so the renderer doesn't
    // walk into stale ids on subsequent frames.
    for (const l of this.getAllLayers()) {
      if (l.masks.length && l.masks.some((m) => m.layerId === id)) {
        l.masks = l.masks.filter((m) => m.layerId !== id)
      }
    }
    this.hooks.layerRemoved.call({ id })
    this.markDirty()
    return true
  }

  // ─── Mask API ──────────────────────────────────────────────────────────────

  /** Replace a layer's full mask stack. */
  setMasks(targetId: string, masks: ReadonlyArray<{ layerId: string; mode?: 'alpha' | 'inverse-alpha' }>): boolean {
    const target = this.getLayerById(targetId)
    if (!target) return false
    target.masks = masks.map((m) => ({ layerId: m.layerId, mode: m.mode ?? 'alpha' }))
    this.markDirty()
    return true
  }

  /** Add a mask overlay to a target's mask stack. Idempotent on duplicate ids. */
  addMask(targetId: string, overlayId: string, mode: 'alpha' | 'inverse-alpha' = 'alpha'): boolean {
    if (targetId === overlayId) return false
    const target = this.getLayerById(targetId)
    const overlay = this.getLayerById(overlayId)
    if (!target || !overlay) return false
    if (target.masks.some((m) => m.layerId === overlayId)) return false
    target.masks = [...target.masks, { layerId: overlayId, mode }]
    this.markDirty()
    return true
  }

  /** Remove one overlay from a target's mask stack. */
  removeMask(targetId: string, overlayId: string): boolean {
    const target = this.getLayerById(targetId)
    if (!target) return false
    const before = target.masks.length
    target.masks = target.masks.filter((m) => m.layerId !== overlayId)
    if (target.masks.length !== before) { this.markDirty(); return true }
    return false
  }

  /** Drop all masks from a target. */
  clearMasks(targetId: string): boolean {
    const target = this.getLayerById(targetId)
    if (!target || target.masks.length === 0) return false
    target.masks = []
    this.markDirty()
    return true
  }

  /** Detach (don't fire hooks) — used by removeLayer / moveLayer. */
  private _detachLayer(id: string): Layer | null {
    const idx = this.layers.findIndex((l) => l.id === id)
    if (idx !== -1) {
      const [layer] = this.layers.splice(idx, 1)
      if (layer) layer.parent = null
      return layer ?? null
    }
    for (const l of this.layers) {
      if (l instanceof GroupLayer) {
        const removed = this._detachFromGroup(l, id)
        if (removed) return removed
      }
    }
    return null
  }

  private _detachFromGroup(group: GroupLayer, id: string): Layer | null {
    const direct = group.remove(id)
    if (direct) return direct
    for (const child of group.children) {
      if (child instanceof GroupLayer) {
        const r = this._detachFromGroup(child, id)
        if (r) return r
      }
    }
    return null
  }

  /** Top-level layers, as added. Children of groups are NOT included here. */
  getLayers(): ReadonlyArray<Layer> {
    return this.layers
  }

  /** Flat list of every layer in the tree (depth-first), including group children. */
  getAllLayers(): Layer[] {
    const out: Layer[] = []
    const walk = (ls: ReadonlyArray<Layer>) => {
      for (const l of ls) {
        out.push(l)
        if (l instanceof GroupLayer) walk(l.children)
      }
    }
    walk(this.layers)
    return out
  }

  /** Recursive lookup by id across the full layer tree. */
  getLayerById(id: string): Layer | undefined {
    const find = (ls: ReadonlyArray<Layer>): Layer | undefined => {
      for (const l of ls) {
        if (l.id === id) return l
        if (l instanceof GroupLayer) {
          const hit = find(l.children)
          if (hit) return hit
        }
      }
      return undefined
    }
    return find(this.layers)
  }

  setActiveLayer(id: string): void {
    this._activeLayerId = id
    this.hooks.activeLayerChanged.call({ id })
  }

  getActiveLayer(): Layer | undefined {
    if (this._activeLayerId) return this.getLayerById(this._activeLayerId)
    return this.layers.at(-1)
  }

  /**
   * Reorder a sibling list (top-level by default, or the children of a group)
   * to match the given id sequence. Ids not present in the target list are skipped.
   */
  reorderLayers(ids: string[], parentId: string | null = null): void {
    const siblings = parentId == null
      ? this.layers
      : ((this.getLayerById(parentId) as GroupLayer | undefined)?.children ?? null)
    if (!siblings) return
    const map = new Map(siblings.map((l) => [l.id, l]))
    const reordered = ids.map((id) => map.get(id)).filter(Boolean) as Layer[]
    // Preserve any siblings the caller forgot about — append at end in their original order.
    for (const l of siblings) if (!ids.includes(l.id)) reordered.push(l)
    siblings.length = 0
    siblings.push(...reordered)
    this.markDirty()
  }

  /**
   * Move a layer to a new parent (null = root) at the given index.
   * Reparents safely and fires no extra hooks beyond a render mark.
   */
  moveLayer(id: string, parentId: string | null, index: number): boolean {
    const layer = this.getLayerById(id)
    if (!layer) return false

    // Prevent inserting a group into itself or its own descendants.
    if (parentId != null && layer instanceof GroupLayer) {
      const target = this.getLayerById(parentId)
      if (!target || this._isAncestor(layer, target)) return false
    }

    this._detachLayer(id)

    if (parentId == null) {
      const clamped = Math.max(0, Math.min(index, this.layers.length))
      this.layers.splice(clamped, 0, layer)
      layer.parent = null
    } else {
      const parent = this.getLayerById(parentId)
      if (!(parent instanceof GroupLayer)) {
        // Parent vanished — fall back to root append rather than losing the layer.
        this.layers.push(layer)
        layer.parent = null
        this.markDirty()
        return false
      }
      parent.insert(layer, index)
    }
    this.markDirty()
    return true
  }

  private _isAncestor(ancestor: GroupLayer, descendant: Layer): boolean {
    let cur: Layer | null = descendant
    while (cur) {
      if (cur === ancestor) return true
      cur = cur.parent as Layer | null
    }
    return false
  }

  /**
   * Group the given layers into a new GroupLayer. The group is inserted in
   * the position of the topmost (last in tree order) selected layer, in that
   * layer's parent. The original layers become the group's children, preserving
   * their relative order. Returns the new group, or null if no valid layers.
   */
  groupLayers(ids: string[], name?: string): GroupLayer | null {
    // De-dupe and resolve in tree order
    const flat = this.getAllLayers()
    const set = new Set(ids)
    const ordered = flat.filter((l) => set.has(l.id))
    if (ordered.length === 0) return null

    // Anchor: parent + index of the topmost (last) selected layer
    const anchor = ordered[ordered.length - 1]!
    const anchorParent = anchor.parent as GroupLayer | null
    const anchorSiblings = anchorParent ? anchorParent.children : this.layers
    const anchorIndex = anchorSiblings.indexOf(anchor)

    // Detach all selected layers (deepest first so indices stay valid)
    const detached: Layer[] = []
    for (let i = ordered.length - 1; i >= 0; i--) {
      const d = this._detachLayer(ordered[i]!.id)
      if (d) detached.unshift(d)
    }

    const group = new GroupLayer(name ?? 'Group')
    for (const l of detached) {
      group.children.push(l)
      l.parent = group
    }

    // Insert group where the anchor used to be (clamped)
    const targetSiblings = anchorParent ? anchorParent.children : this.layers
    const insertAt = Math.max(0, Math.min(anchorIndex, targetSiblings.length))
    targetSiblings.splice(insertAt, 0, group)
    group.parent = anchorParent ?? null

    this.hooks.layerAdded.call(group)
    this.markDirty()
    return group
  }

  /**
   * Dissolve a group, splicing its children back into the group's parent at
   * the group's position. The group itself is removed. Returns the freed
   * children, or null if `id` is not a group.
   */
  ungroupLayer(id: string): Layer[] | null {
    const group = this.getLayerById(id)
    if (!(group instanceof GroupLayer)) return null

    const parent = group.parent as GroupLayer | null
    const siblings = parent ? parent.children : this.layers
    const idx = siblings.indexOf(group)
    if (idx === -1) return null

    const children = group.children.slice()
    siblings.splice(idx, 1, ...children)
    for (const c of children) c.parent = parent ?? null
    group.children.length = 0
    group.parent = null

    this.hooks.layerRemoved.call({ id: group.id })
    this.markDirty()
    return children
  }

  // ─── Reference layer ───────────────────────────────────────────────────────

  /** When set, brush strokes and fill are clipped to this layer's alpha. */
  referenceLayerId: string | null = null

  /**
   * Masks `layer`'s pixels against the reference layer's alpha channel.
   * Pixels where the reference layer is fully transparent are erased.
   */
  applyReferenceMask(layer: RasterLayer): void {
    if (!this.referenceLayerId) return
    const ref = this.getLayerById(this.referenceLayerId)
    if (!ref || ref === layer) return

    // Sample the reference layer into the active layer's pixel space.
    // For raster references at matching resolution we read directly;
    // anything else (vector, mismatched size, group) is rasterized.
    let refData: ImageData | null = null
    if (ref instanceof RasterLayer && ref.width === layer.width && ref.height === layer.height
        && ref.transform.x === layer.transform.x && ref.transform.y === layer.transform.y) {
      refData = ref.getImageData()
    } else {
      refData = rasterizeLayer(ref, layer.width, layer.height, layer.transform.x, layer.transform.y)
    }

    if (!refData) return
    const activeData = layer.getImageData()
    const ad = activeData.data
    const rd = refData.data
    if (ad.length !== rd.length) return
    for (let i = 3; i < ad.length; i += 4) {
      if (rd[i] === 0) ad[i] = 0
    }
    layer.putImageData(activeData)
  }

  // ─── Stroke overlay helpers ────────────────────────────────────────────────

  clearStrokeCanvas(): void {
    if (this.strokeCtx && this.strokeCanvas) {
      this.strokeCtx.clearRect(0, 0, this.strokeCanvas.width, this.strokeCanvas.height)
    }
  }

  // ─── Tool API ──────────────────────────────────────────────────────────────

  registerTool(name: string, tool: Tool): void {
    tool.attach(this)
    this.toolRegistry.set(name, tool)
  }

  setActiveTool(name: string): void {
    const tool = this.toolRegistry.get(name)
    if (!tool) throw new Error(`Tool "${name}" not registered`)
    this._activeTool?.onDeactivate()
    this._activeTool = tool
    tool.onActivate()
    this.hooks.toolChanged.call({ name })
  }

  /**
   * Temporarily override the active tool without firing toolChanged.
   * Used by GestureManager for Space-to-pan. The toolbar stays on the real active tool.
   */
  setTempTool(name: string): void {
    const tool = this.toolRegistry.get(name)
    if (!tool) return
    this._tempTool = tool
    tool.onActivate()
  }

  clearTempTool(): void {
    this._tempTool?.onDeactivate()
    this._tempTool = null
    this._activeTool?.onActivate()
  }

  /** Returns the temp tool if set, otherwise the regular active tool */
  get activeTool(): Tool | null {
    return this._tempTool ?? this._activeTool
  }

  getTool<T extends Tool>(name: string): T | undefined {
    return this.toolRegistry.get(name) as T | undefined
  }

  hasTool(name: string): boolean {
    return this.toolRegistry.has(name)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  markDirty(): void {
    this._dirty = true
  }

  private startRenderLoop(): void {
    const loop = () => {
      if (this._dirty) {
        this.hooks.beforeRender.call(this)
        this.renderer.render(this.layers, this.camera, (id) => this.getLayerById(id))
        this.hooks.afterRender.call(this)
        this._dirty = false
      }
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /** True after destroy() has been called */
  private _destroyed = false
  get destroyed(): boolean {
    return this._destroyed
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.resizeObserver.disconnect()
    this.gestureManager.destroy()
    this.plugins.destroyAll()
    this.hooks.destroy.call(this)
  }
}
