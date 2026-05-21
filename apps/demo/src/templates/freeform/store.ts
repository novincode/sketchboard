'use client'

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Board, BrushTool, VectorBrushTool, Layer, VectorPenTool } from '@sketchboard/core'
import { Color, RasterLayer, VectorLayer } from '@sketchboard/core'
import type { ToolId, Background, EraserMode, LayerType } from './types'

// ─── State shape ─────────────────────────────────────────────────────────────

interface LayerMeta {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: string
  type: LayerType
}

interface FreeformState {
  board: Board | null

  activeToolId: ToolId
  brushSize: number
  brushOpacity: number
  brushHardness: number
  brushColor: string       // hex

  eraserSize: number
  eraserMode: EraserMode

  vectorSize: number
  vectorOpacity: number

  background: Background
  showColorPicker: boolean
  showLayerPanel: boolean

  layers: LayerMeta[]
  activeLayerId: string | null
}

interface FreeformActions {
  _setBoard(board: Board | null): void

  setActiveToolId(id: ToolId): void
  setBrushSize(size: number): void
  setBrushOpacity(opacity: number): void
  setBrushHardness(hardness: number): void
  setBrushColor(hex: string): void

  setEraserSize(size: number): void
  setEraserMode(mode: EraserMode): void

  setVectorSize(size: number): void
  setVectorOpacity(opacity: number): void

  setBackground(bg: Background): void
  toggleColorPicker(): void
  closePanels(): void
  toggleLayerPanel(): void

  addLayer(type?: LayerType): void
  removeLayer(id: string): void
  setActiveLayerId(id: string): void
  setLayerVisibility(id: string, visible: boolean): void
  setLayerOpacity(id: string, opacity: number): void
  setLayerName(id: string, name: string): void
  setLayerBlendMode(id: string, blendMode: string): void

  exportPng(filename?: string): void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyBrushColor(board: Board, hex: string) {
  const color = Color.fromHex(hex)
  for (const name of ['pen', 'brush'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) tool.settings.color = color
  }
  const vec = board.getTool<VectorBrushTool>('vector')
  if (vec) vec.settings.color = color
  const pen = board.getTool<VectorPenTool>('vectorpen')
  if (pen) pen.settings.strokeColor = hex
}

function applyBrushSize(board: Board, size: number) {
  for (const name of ['pen', 'brush'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) tool.settings.size = size
  }
}

function applyBrushOpacity(board: Board, opacity: number) {
  for (const name of ['pen', 'brush'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) tool.settings.opacity = opacity
  }
}

function applyBrushHardness(board: Board, hardness: number) {
  for (const name of ['pen', 'brush'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) tool.settings.hardness = hardness
  }
}

function layersToMeta(layers: ReadonlyArray<Layer>): LayerMeta[] {
  return layers.map((l) => ({
    id: l.id,
    name: l.name,
    visible: l.visible,
    opacity: l.opacity,
    blendMode: l.blendMode,
    type: (l as RasterLayer | VectorLayer).type === 'vector' ? 'vector' : 'raster',
  }))
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useFreeformStore = create<FreeformState & FreeformActions>()(
  subscribeWithSelector((set, get) => ({
    board: null,
    activeToolId: 'pen',
    brushSize: 8,
    brushOpacity: 1,
    brushHardness: 0.9,
    brushColor: '#1a1a1a',
    eraserSize: 24,
    eraserMode: 'pixel',
    vectorSize: 4,
    vectorOpacity: 1,
    background: 'dots',
    showColorPicker: false,
    showLayerPanel: false,
    layers: [],
    activeLayerId: null,

    // ── Board ──────────────────────────────────────────────────────────────
    _setBoard(board) {
      if (!board) { set({ board: null, layers: [], activeLayerId: null }); return }
      set({ board, layers: layersToMeta(board.getLayers()) })

      const s = get()
      applyBrushColor(board, s.brushColor)
      applyBrushSize(board, s.brushSize)
      applyBrushOpacity(board, s.brushOpacity)
      applyBrushHardness(board, s.brushHardness)

      const vec = board.getTool<VectorBrushTool>('vector')
      if (vec) {
        vec.settings.size = s.vectorSize
        vec.settings.opacity = s.vectorOpacity
        vec.settings.color = Color.fromHex(s.brushColor)
      }

      board.hooks.layerAdded.tap('store', () => set({ layers: layersToMeta(board.getLayers()) }))
      board.hooks.layerRemoved.tap('store', () => set({ layers: layersToMeta(board.getLayers()) }))
      board.hooks.activeLayerChanged.tap('store', ({ id }) => set({ activeLayerId: id }))
    },

    // ── Tool ──────────────────────────────────────────────────────────────
    setActiveToolId(id) {
      const { board } = get()
      board?.setActiveTool(id)
      set({ activeToolId: id })
    },

    // ── Raster brush ──────────────────────────────────────────────────────
    setBrushSize(size) {
      const { board } = get()
      if (board) applyBrushSize(board, size)
      set({ brushSize: size })
    },
    setBrushOpacity(opacity) {
      const { board } = get()
      if (board) applyBrushOpacity(board, opacity)
      set({ brushOpacity: opacity })
    },
    setBrushHardness(hardness) {
      const { board } = get()
      if (board) applyBrushHardness(board, hardness)
      set({ brushHardness: hardness })
    },
    setBrushColor(hex) {
      const { board } = get()
      if (board) applyBrushColor(board, hex)
      set({ brushColor: hex })
    },

    // ── Eraser ────────────────────────────────────────────────────────────
    setEraserSize(size) {
      const { board } = get()
      const tool = board?.getTool<BrushTool>('eraser')
      if (tool) tool.settings.size = size
      set({ eraserSize: size })
    },
    setEraserMode(mode) { set({ eraserMode: mode }) },

    // ── Vector brush ──────────────────────────────────────────────────────
    setVectorSize(size) {
      const { board } = get()
      const tool = board?.getTool<VectorBrushTool>('vector')
      if (tool) tool.settings.size = size
      set({ vectorSize: size })
    },
    setVectorOpacity(opacity) {
      const { board } = get()
      const tool = board?.getTool<VectorBrushTool>('vector')
      if (tool) tool.settings.opacity = opacity
      set({ vectorOpacity: opacity })
    },

    // ── UI ────────────────────────────────────────────────────────────────
    setBackground: (bg) => set({ background: bg }),
    toggleColorPicker: () =>
      set((s) => ({ showColorPicker: !s.showColorPicker, showLayerPanel: false })),
    closePanels: () => set({ showColorPicker: false, showLayerPanel: false }),
    toggleLayerPanel: () =>
      set((s) => ({ showLayerPanel: !s.showLayerPanel, showColorPicker: false })),

    // ── Layer management ──────────────────────────────────────────────────
    addLayer(type = 'raster') {
      const { board } = get()
      if (!board) return
      const n = board.getLayers().length + 1
      let layer: Layer
      if (type === 'vector') {
        layer = new VectorLayer(`Vector ${n}`)
      } else {
        const r = new RasterLayer(3840, 2160, `Layer ${n}`)
        r.backgroundColor = null
        layer = r
      }
      const added = board.addLayer(layer)
      board.setActiveLayer(added.id)
    },

    removeLayer(id) {
      const { board, activeLayerId } = get()
      if (!board) return
      board.removeLayer(id)
      if (activeLayerId === id) {
        const remaining = board.getLayers()
        if (remaining.length > 0) board.setActiveLayer(remaining.at(-1)!.id)
      }
    },

    setActiveLayerId(id) {
      const { board } = get()
      board?.setActiveLayer(id)
      set({ activeLayerId: id })
    },

    setLayerVisibility(id, visible) {
      const { board } = get()
      const layer = board?.getLayerById(id)
      if (!layer) return
      layer.visible = visible
      board?.markDirty()
      set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, visible } : l)) }))
    },

    setLayerOpacity(id, opacity) {
      const { board } = get()
      const layer = board?.getLayerById(id)
      if (!layer) return
      layer.opacity = opacity
      board?.markDirty()
      set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l)) }))
    },

    setLayerName(id, name) {
      const { board } = get()
      const layer = board?.getLayerById(id)
      if (!layer) return
      layer.name = name
      set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, name } : l)) }))
    },

    setLayerBlendMode(id, blendMode) {
      const { board } = get()
      const layer = board?.getLayerById(id)
      if (!layer) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(layer as any).blendMode = blendMode
      board?.markDirty()
      set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, blendMode } : l)) }))
    },

    // ── Export ────────────────────────────────────────────────────────────
    exportPng(filename = 'sketchboard-export.png') {
      const { board } = get()
      if (!board) return

      // Determine export size from the first raster layer (canvas artboard)
      const layers = board.getLayers()
      let exportW = 1920, exportH = 1080
      for (const l of layers) {
        if (l instanceof RasterLayer) { exportW = l.width; exportH = l.height; break }
      }

      // Composite all visible layers at native resolution.
      // Both RasterLayer and VectorLayer ignore the camera param — they render in world space.
      const offscreen = document.createElement('canvas')
      offscreen.width = exportW
      offscreen.height = exportH
      const ctx = offscreen.getContext('2d')!

      for (const l of layers) {
        if (!l.visible) continue
        l.render(ctx, board.camera)
      }

      const link = document.createElement('a')
      link.download = filename
      link.href = offscreen.toDataURL('image/png')
      link.click()
    },
  })),
)
