'use client'

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Board, BrushTool, Layer } from '@sketchboard/core'
import { Color, RasterLayer } from '@sketchboard/core'
import type { ToolId, Background } from './types'

// ─── State shape ─────────────────────────────────────────────────────────────

interface LayerMeta {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: string
}

interface FreeformState {
  board: Board | null

  activeToolId: ToolId
  brushSize: number
  brushOpacity: number
  brushHardness: number
  brushColor: string // hex e.g. "#1a1a1a"

  background: Background
  showColorPicker: boolean
  showBrushPanel: boolean   // unused—kept for future panels
  showLayerPanel: boolean

  // Layer list — mirrors board.getLayers() for UI reactivity
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

  setBackground(bg: Background): void
  toggleColorPicker(): void
  closePanels(): void
  toggleLayerPanel(): void

  // Layer management
  addLayer(): void
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
  for (const name of ['pen', 'brush', 'pencil'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) tool.settings.color = color
  }
}

function applyBrushSize(board: Board, size: number) {
  for (const name of ['pen', 'brush', 'pencil', 'eraser'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) tool.settings.size = size
  }
}

function applyBrushOpacity(board: Board, opacity: number) {
  for (const name of ['pen', 'brush', 'pencil'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) tool.settings.opacity = opacity
  }
}

function applyBrushHardness(board: Board, hardness: number) {
  for (const name of ['pen', 'brush', 'pencil'] as const) {
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
    background: 'dots',
    showColorPicker: false,
    showBrushPanel: false,
    showLayerPanel: false,
    layers: [],
    activeLayerId: null,

    // ── Board ──────────────────────────────────────────────────────────────
    _setBoard(board) {
      if (!board) {
        set({ board: null, layers: [], activeLayerId: null })
        return
      }
      set({ board, layers: layersToMeta(board.getLayers()) })

      // Sync initial settings
      const s = get()
      applyBrushColor(board, s.brushColor)
      applyBrushSize(board, s.brushSize)
      applyBrushOpacity(board, s.brushOpacity)
      applyBrushHardness(board, s.brushHardness)

      // Keep layer list in sync with board
      board.hooks.layerAdded.tap('store', () => {
        set({ layers: layersToMeta(board.getLayers()) })
      })
      board.hooks.layerRemoved.tap('store', () => {
        set({ layers: layersToMeta(board.getLayers()) })
      })
      board.hooks.activeLayerChanged.tap('store', ({ id }) => {
        set({ activeLayerId: id })
      })
    },

    // ── Tool ──────────────────────────────────────────────────────────────
    setActiveToolId(id) {
      const { board } = get()
      board?.setActiveTool(id)
      set({ activeToolId: id })
    },

    // ── Brush ─────────────────────────────────────────────────────────────
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

    // ── UI ────────────────────────────────────────────────────────────────
    setBackground: (bg) => set({ background: bg }),
    toggleColorPicker: () =>
      set((s) => ({ showColorPicker: !s.showColorPicker, showLayerPanel: false })),
    closePanels: () => set({ showColorPicker: false, showLayerPanel: false }),
    toggleLayerPanel: () =>
      set((s) => ({ showLayerPanel: !s.showLayerPanel, showColorPicker: false })),

    // ── Layer management ──────────────────────────────────────────────────
    addLayer() {
      const { board } = get()
      if (!board) return
      const layer = new RasterLayer(3840, 2160, `Layer ${board.getLayers().length + 1}`)
      const added = board.addLayer(layer)
      // Immediately activate the newly created layer
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
      set((s) => ({
        layers: s.layers.map((l) => (l.id === id ? { ...l, visible } : l)),
      }))
    },

    setLayerOpacity(id, opacity) {
      const { board } = get()
      const layer = board?.getLayerById(id)
      if (!layer) return
      layer.opacity = opacity
      board?.markDirty()
      set((s) => ({
        layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
      }))
    },

    setLayerName(id, name) {
      const { board } = get()
      const layer = board?.getLayerById(id)
      if (!layer) return
      layer.name = name
      set((s) => ({
        layers: s.layers.map((l) => (l.id === id ? { ...l, name } : l)),
      }))
    },

    setLayerBlendMode(id, blendMode) {
      const { board } = get()
      const layer = board?.getLayerById(id) as RasterLayer | undefined
      if (!layer) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layer.blendMode = blendMode as any
      board?.markDirty()
      set((s) => ({
        layers: s.layers.map((l) => (l.id === id ? { ...l, blendMode } : l)),
      }))
    },

    // ── Export ────────────────────────────────────────────────────────────
    exportPng(filename = 'sketchboard-export.png') {
      const { board } = get()
      if (!board) return
      const link = document.createElement('a')
      link.download = filename
      link.href = board.canvas.toDataURL('image/png')
      link.click()
    },
  })),
)
