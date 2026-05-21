import { Camera } from './Camera'
import { BoardHooks } from './hooks/BoardHooks'
import { HistoryManager } from './history/HistoryManager'
import { PluginManager } from './plugins/PluginManager'
import { Canvas2DRenderer } from './renderer/Canvas2DRenderer'
import { GestureManager } from './gestures/GestureManager'
import type { Layer } from './layers/Layer'
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

  constructor(container: HTMLElement | HTMLCanvasElement, options: BoardOptions = {}) {
    if (container instanceof HTMLCanvasElement) {
      this.canvas = container
    } else {
      this.canvas = document.createElement('canvas')
      this.canvas.style.display = 'block'
      this.canvas.style.width = '100%'
      this.canvas.style.height = '100%'
      container.appendChild(this.canvas)
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
      this.canvas.width = Math.round(width * dpr)
      this.canvas.height = Math.round(height * dpr)
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
