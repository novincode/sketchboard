import { Camera } from './Camera'
import { BoardHooks } from './hooks/BoardHooks'
import { HistoryManager } from './history/HistoryManager'
import { PluginManager } from './plugins/PluginManager'
import { BrushRegistry } from './brushes/BrushRegistry'
import { Canvas2DRenderer } from './renderer/Canvas2DRenderer'
import { GestureManager } from './gestures/GestureManager'
import type { Layer } from './layers/Layer'
import { RasterLayer } from './layers/RasterLayer'
import { VectorLayer } from './layers/VectorLayer'
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
    this.layers.push(layer)
    this.hooks.layerAdded.call(layer)
    this.markDirty()
    return layer
  }

  removeLayer(id: string): boolean {
    const idx = this.layers.findIndex((l) => l.id === id)
    if (idx === -1) return false
    this.layers.splice(idx, 1)
    if (this._activeLayerId === id) this._activeLayerId = null
    this.hooks.layerRemoved.call({ id })
    this.markDirty()
    return true
  }

  getLayers(): ReadonlyArray<Layer> {
    return this.layers
  }

  getLayerById(id: string): Layer | undefined {
    return this.layers.find((l) => l.id === id)
  }

  setActiveLayer(id: string): void {
    this._activeLayerId = id
    this.hooks.activeLayerChanged.call({ id })
  }

  getActiveLayer(): Layer | undefined {
    if (this._activeLayerId) return this.getLayerById(this._activeLayerId)
    return this.layers.at(-1)
  }

  reorderLayers(ids: string[]): void {
    const map = new Map(this.layers.map((l) => [l.id, l]))
    this.layers = ids.map((id) => map.get(id)).filter(Boolean) as Layer[]
    this.markDirty()
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
    if (!ref) return

    let refData: ImageData | null = null

    if (ref instanceof RasterLayer) {
      if (ref.width !== layer.width || ref.height !== layer.height) return
      refData = ref.getImageData()
    } else if (ref instanceof VectorLayer) {
      // Rasterize vector reference at the active layer's resolution
      const offscreen = document.createElement('canvas')
      offscreen.width = layer.width
      offscreen.height = layer.height
      const ctx = offscreen.getContext('2d')!
      // VectorLayer.render ignores the camera and uses transform.applyToContext
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref.render(ctx, null as any)
      refData = ctx.getImageData(0, 0, layer.width, layer.height)
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
        this.renderer.render(this.layers, this.camera)
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
