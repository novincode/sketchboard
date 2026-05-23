'use client'

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Board, BrushTool, VectorBrushTool, Layer, VectorPenTool, FillTool, FillPlacement } from '@sketchboard/core'
import { Color, RasterLayer, VectorLayer } from '@sketchboard/core'
import type { ToolId, Background, EraserMode, LayerType } from './types'
import { RASTER_BRUSH_PRESETS, DEFAULT_BRUSH_PRESET_ID } from './brushPresets'
import type { BrushPreset } from './brushPresets'

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
  vectorBrushMerge: boolean
  vectorStreamline: number

  fillTolerance: number
  fillPlacement: FillPlacement

  /** Active raster brush preset id */
  activeBrushPresetId: string
  brushPressureSize: boolean
  brushPressureOpacity: boolean

  background: Background
  showColorPicker: boolean
  showLayerPanel: boolean

  /** Toolbar dock position — shared so ToolOptionsPanel can align itself */
  toolbarSnap: 'bottom' | 'left' | 'right' | 'top'
  toolbarEdgeOffset: number  // position along the edge (fraction 0–1)

  layers: LayerMeta[]
  activeLayerId: string | null

  /** The special "Background" layer id — always at index 0 */
  backgroundLayerId: string | null
  backgroundLayerColor: string

  /** Layer marked as reference for brush clipping + fill detection */
  referenceLayerId: string | null
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
  setVectorBrushMerge(merge: boolean): void
  setVectorStreamline(streamline: number): void

  setFillTolerance(tolerance: number): void
  setFillPlacement(placement: FillPlacement): void

  setActiveBrushPreset(id: string): void

  setBackground(bg: Background): void
  toggleColorPicker(): void
  closePanels(): void
  toggleLayerPanel(): void
  setToolbarSnap(snap: 'bottom' | 'left' | 'right' | 'top', offset?: number): void

  addLayer(type?: LayerType): void
  removeLayer(id: string): void
  duplicateLayer(id: string): void
  clearLayer(id: string): void
  setActiveLayerId(id: string): void
  setLayerVisibility(id: string, visible: boolean): void
  setLayerOpacity(id: string, opacity: number): void
  setLayerName(id: string, name: string): void
  setLayerBlendMode(id: string, blendMode: string): void
  setBackgroundColor(hex: string): void
  setReferenceLayerId(id: string | null): void

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
  const fill = board.getTool<FillTool>('fill')
  if (fill) fill.settings.color = hex
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

function applyBrushPreset(board: Board, preset: BrushPreset) {
  for (const name of ['pen', 'brush'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) {
      tool.settings.hardness = preset.hardness
      tool.settings.pressureAffectsSize = preset.pressureSize
      tool.settings.pressureAffectsOpacity = preset.pressureOpacity
    }
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
    activeToolId: 'brush',
    brushSize: 8,
    brushOpacity: 1,
    brushHardness: 0.85,
    brushColor: '#1a1a1a',
    eraserSize: 24,
    eraserMode: 'pixel',
    vectorSize: 4,
    vectorOpacity: 1,
    vectorBrushMerge: false,
    vectorStreamline: 0.2,
    fillTolerance: 32,
    fillPlacement: 'back' as FillPlacement,
    activeBrushPresetId: DEFAULT_BRUSH_PRESET_ID,
    brushPressureSize: true,
    brushPressureOpacity: false,
    background: 'dots' as Background,
    backgroundLayerId: null,
    backgroundLayerColor: '#ffffff',
    referenceLayerId: null,
    toolbarSnap: 'bottom' as const,
    toolbarEdgeOffset: 0.5,
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
      const defaultPreset = RASTER_BRUSH_PRESETS.find((p) => p.id === s.activeBrushPresetId) ?? RASTER_BRUSH_PRESETS[0]!
      applyBrushPreset(board, defaultPreset)

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
      if (board && board.hasTool(id)) {
        board.setActiveTool(id)
      }
      set({ activeToolId: id })
    },

    // ── Brush presets ─────────────────────────────────────────────────────
    setActiveBrushPreset(id) {
      const { board } = get()
      const preset = RASTER_BRUSH_PRESETS.find((p) => p.id === id)
      if (!preset) return
      if (board) {
        applyBrushPreset(board, preset)
        if (board.hasTool(preset.toolId)) board.setActiveTool(preset.toolId)
      }
      set({
        activeBrushPresetId: id,
        activeToolId: preset.toolId,
        brushHardness: preset.hardness,
        brushPressureSize: preset.pressureSize,
        brushPressureOpacity: preset.pressureOpacity,
      })
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
    setVectorBrushMerge(merge) {
      const { board } = get()
      const tool = board?.getTool<VectorBrushTool>('vector')
      if (tool) tool.settings.merge = merge
      set({ vectorBrushMerge: merge })
    },
    setVectorStreamline(streamline) {
      const { board } = get()
      const tool = board?.getTool<VectorBrushTool>('vector')
      if (tool) tool.settings.streamline = streamline
      set({ vectorStreamline: streamline })
    },

    // ── Fill tool ─────────────────────────────────────────────────────────
    setFillTolerance(tolerance) {
      const { board } = get()
      const tool = board?.getTool<FillTool>('fill')
      if (tool) tool.settings.tolerance = tolerance
      set({ fillTolerance: tolerance })
    },
    setFillPlacement(placement) {
      const { board } = get()
      const tool = board?.getTool<FillTool>('fill')
      if (tool) tool.settings.placement = placement
      set({ fillPlacement: placement })
    },

    // ── UI ────────────────────────────────────────────────────────────────
    setBackground: (bg) => set({ background: bg }),
    setToolbarSnap: (snap, offset = 0.5) => set({ toolbarSnap: snap, toolbarEdgeOffset: offset }),
    toggleColorPicker: () =>
      set((s) => ({ showColorPicker: !s.showColorPicker, showLayerPanel: false })),
    closePanels: () => set({ showColorPicker: false, showLayerPanel: false }),
    toggleLayerPanel: () =>
      set((s) => ({ showLayerPanel: !s.showLayerPanel, showColorPicker: false })),

    // ── Layer management ──────────────────────────────────────────────────
    addLayer(type: LayerType = 'raster') {
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

    duplicateLayer(id) {
      const { board } = get()
      if (!board) return
      const original = board.getLayerById(id)
      if (!original) return
      const copy = original.clone()
      copy.name = `${original.name} copy`
      board.addLayer(copy)
      board.setActiveLayer(copy.id)
    },

    clearLayer(id) {
      const { board } = get()
      const layer = board?.getLayerById(id)
      if (!layer) return
      if (layer instanceof RasterLayer) {
        layer.clear()
        board?.markDirty()
      } else if (layer instanceof VectorLayer) {
        layer.strokes = []
        layer.paths = []
        board?.markDirty()
      }
    },

    setBackgroundColor(hex) {
      const { board, backgroundLayerId } = get()
      if (!backgroundLayerId) return
      const layer = board?.getLayerById(backgroundLayerId)
      if (!(layer instanceof RasterLayer)) return
      layer.backgroundColor = hex
      board?.markDirty()
      set({ backgroundLayerColor: hex })
    },

    setReferenceLayerId(id) {
      const { board } = get()
      if (board) board.referenceLayerId = id
      set({ referenceLayerId: id })
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
