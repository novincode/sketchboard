'use client'

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Board, BrushTool, VectorBrushTool, Layer, VectorPenTool, FillTool, FillPlacement } from '@sketchboard/core'
import { Color, RasterLayer, VectorLayer, GroupLayer } from '@sketchboard/core'
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
  type: LayerType | 'group'
  /** Tree depth — 0 for root layers, +1 per nested group. */
  depth: number
  /** Id of the containing GroupLayer, or null for root. */
  parentId: string | null
  /** Group rows only — collapsed in the panel. */
  collapsed?: boolean
  /** Group rows only — number of direct children. */
  childCount?: number
  /** Overlay ids that clip THIS layer (this layer is the target). */
  maskOverlayIds: string[]
  /** Target ids that THIS layer clips (this layer is the overlay). */
  maskTargetIds: string[]
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
  /** Vector-fill gap-close radius in layer-local px (Blender-style). */
  fillGapClose: number

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

  /** Multi-select: includes activeLayerId by convention when non-empty. */
  selectedLayerIds: string[]

  /**
   * When true, the layer panel shows checkboxes and a single tap toggles
   * inclusion in `selectedLayerIds`. Designed for touch — right-click /
   * long-press on any selected row then acts on the whole set.
   */
  selectionMode: boolean

  /** Live fill-tool tolerance scrub feedback (Procreate-style drag). */
  fillPreview: { tolerance: number; x: number; y: number } | null

  /**
   * Procreate-style ColorDrop: user is dragging the color swatch out of the
   * toolbar across the canvas. `x`/`y` are viewport coordinates of the cursor.
   * Cleared when the drag ends (drop or cancel).
   */
  colorDrag: { color: string; x: number; y: number } | null

  /** Animated ripples played at a fill drop point. Each has a unique id. */
  colorDropRipples: Array<{ id: number; x: number; y: number; color: string }>

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
  setFillGapClose(gap: number): void

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

  // ── Multi-select & tree ops ─────────────────────────────────────────────
  /** additive=false replaces selection; true toggles. */
  selectLayer(id: string, additive: boolean): void
  selectRange(toId: string): void
  clearLayerSelection(): void
  groupSelectedLayers(): void
  ungroupLayer(id: string): void
  toggleGroupCollapsed(id: string): void
  /** Move `id` to a new parent (null = root) at the given index. */
  moveLayer(id: string, parentId: string | null, index: number): void
  /** Reorder the children of `parentId` (null = root) to the given id sequence. */
  reorderSiblings(orderedIds: string[], parentId: string | null): void

  // ── Selection mode ──────────────────────────────────────────────────────
  setSelectionMode(on: boolean): void
  toggleLayerInSelection(id: string): void

  // ── Mask API (drives Board.addMask/removeMask/clearMasks) ───────────────
  /**
   * Mask the lower of two layers using the upper as the overlay. If a single
   * layer is selected, use it as the overlay and the layer immediately below
   * it (in panel order) as the target — same as Figma's mask-with-layer-below.
   */
  maskSelected(): void
  /** Remove all masks from the given layer(s). */
  releaseMasksFor(ids: string[]): void
  /** Add `overlayId` to `targetId`'s mask stack. Used by drag-between behavior. */
  joinMask(targetId: string, overlayId: string): void

  // ── ColorDrop (drag swatch → fill at canvas point) ──────────────────────
  beginColorDrag(color: string, x: number, y: number): void
  updateColorDrag(x: number, y: number): void
  /** End drag. Returns true if a fill happened. */
  endColorDrag(x: number, y: number): boolean
  cancelColorDrag(): void

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

/**
 * Flatten the layer tree depth-first so the UI can render a single scroll list
 * with indentation per depth. Collapsed groups skip their descendants.
 */
function layersToMeta(layers: ReadonlyArray<Layer>): LayerMeta[] {
  // First pass: collect everyone's mask refs so we can compute reverse-lookup
  // (which targets each overlay clips) in O(n).
  const reverse = new Map<string, string[]>()
  const collect = (ls: ReadonlyArray<Layer>) => {
    for (const l of ls) {
      for (const m of l.masks) {
        const arr = reverse.get(m.layerId) ?? []
        arr.push(l.id)
        reverse.set(m.layerId, arr)
      }
      if (l instanceof GroupLayer) collect(l.children)
    }
  }
  collect(layers)

  const out: LayerMeta[] = []
  const walk = (ls: ReadonlyArray<Layer>, depth: number, parentId: string | null) => {
    for (const l of ls) {
      const maskOverlayIds = l.masks.map((m) => m.layerId)
      const maskTargetIds = reverse.get(l.id) ?? []
      if (l instanceof GroupLayer) {
        out.push({
          id: l.id, name: l.name,
          visible: l.visible, opacity: l.opacity, blendMode: l.blendMode,
          type: 'group', depth, parentId,
          collapsed: l.collapsed,
          childCount: l.children.length,
          maskOverlayIds, maskTargetIds,
        })
        if (!l.collapsed) walk(l.children, depth + 1, l.id)
      } else {
        out.push({
          id: l.id, name: l.name,
          visible: l.visible, opacity: l.opacity, blendMode: l.blendMode,
          type: (l as RasterLayer | VectorLayer).type === 'vector' ? 'vector' : 'raster',
          depth, parentId,
          maskOverlayIds, maskTargetIds,
        })
      }
    }
  }
  walk(layers, 0, null)
  return out
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
    fillGapClose: 0,
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
    selectedLayerIds: [],
    selectionMode: false,
    fillPreview: null,
    colorDrag: null,
    colorDropRipples: [],

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

      const fillTool = board.getTool<FillTool>('fill')
      if (fillTool) {
        fillTool.settings.tolerance = s.fillTolerance
        fillTool.settings.placement = s.fillPlacement
        fillTool.settings.gapClose = s.fillGapClose
      }

      board.hooks.layerAdded.tap('store', () => set({ layers: layersToMeta(board.getLayers()) }))
      board.hooks.layerRemoved.tap('store', () => set({ layers: layersToMeta(board.getLayers()) }))
      board.hooks.activeLayerChanged.tap('store', ({ id }) => {
        set((s) => ({
          activeLayerId: id,
          // Reset multi-select to just the new active layer unless user is mid-shift/cmd op (handled in selectLayer)
          selectedLayerIds: id ? (s.selectedLayerIds.includes(id) ? s.selectedLayerIds : [id]) : [],
        }))
      })
      board.hooks.toolPreview.tap('store', ({ kind, data }) => {
        if (kind === 'tolerance') {
          set({ fillPreview: { tolerance: data.tolerance as number, x: data.x as number, y: data.y as number } })
        } else if (kind === 'end') {
          set({ fillPreview: null })
        }
      })
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
    setFillGapClose(gap) {
      const { board } = get()
      const tool = board?.getTool<FillTool>('fill')
      if (tool) tool.settings.gapClose = gap
      set({ fillGapClose: gap })
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
      const { board, activeLayerId, selectedLayerIds } = get()
      if (!board) return
      board.removeLayer(id)
      if (activeLayerId === id) {
        const remaining = board.getLayers()
        if (remaining.length > 0) board.setActiveLayer(remaining.at(-1)!.id)
      }
      set({ selectedLayerIds: selectedLayerIds.filter((x) => x !== id) })
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

    // ── Multi-select & tree ops ──────────────────────────────────────────
    selectLayer(id, additive) {
      const { selectedLayerIds, board, backgroundLayerId } = get()
      if (id === backgroundLayerId) {
        // Background never participates in multi-select
        board?.setActiveLayer(id)
        set({ activeLayerId: id, selectedLayerIds: [] })
        return
      }
      let next: string[]
      if (additive) {
        next = selectedLayerIds.includes(id)
          ? selectedLayerIds.filter((x) => x !== id)
          : [...selectedLayerIds.filter((x) => x !== backgroundLayerId), id]
      } else {
        next = [id]
      }
      board?.setActiveLayer(id)
      set({ activeLayerId: id, selectedLayerIds: next })
    },

    selectRange(toId) {
      const { layers, activeLayerId, backgroundLayerId } = get()
      if (!activeLayerId) return
      const flatIds = layers.filter((l) => l.id !== backgroundLayerId).map((l) => l.id)
      const a = flatIds.indexOf(activeLayerId)
      const b = flatIds.indexOf(toId)
      if (a === -1 || b === -1) return
      const [lo, hi] = a < b ? [a, b] : [b, a]
      const range = flatIds.slice(lo, hi + 1)
      const { board } = get()
      board?.setActiveLayer(toId)
      set({ activeLayerId: toId, selectedLayerIds: range })
    },

    clearLayerSelection() { set({ selectedLayerIds: [] }) },

    groupSelectedLayers() {
      const { board, selectedLayerIds, activeLayerId, backgroundLayerId } = get()
      if (!board) return
      const candidate = selectedLayerIds.length > 0
        ? selectedLayerIds
        : (activeLayerId ? [activeLayerId] : [])
      const ids = candidate.filter((id) => id !== backgroundLayerId)
      if (ids.length === 0) return
      const group = board.groupLayers(ids, `Group ${board.getAllLayers().filter((l) => l.id.startsWith('layer-')).length}`)
      if (!group) return
      board.setActiveLayer(group.id)
      set({
        layers: layersToMeta(board.getLayers()),
        activeLayerId: group.id,
        selectedLayerIds: [group.id],
      })
    },

    ungroupLayer(id) {
      const { board } = get()
      if (!board) return
      const children = board.ungroupLayer(id)
      if (!children) return
      set({
        layers: layersToMeta(board.getLayers()),
        selectedLayerIds: children.map((c) => c.id),
        activeLayerId: children.at(-1)?.id ?? null,
      })
    },

    toggleGroupCollapsed(id) {
      const { board } = get()
      const layer = board?.getLayerById(id)
      if (!(layer instanceof GroupLayer)) return
      layer.collapsed = !layer.collapsed
      set({ layers: layersToMeta(board!.getLayers()) })
    },

    moveLayer(id, parentId, index) {
      const { board, backgroundLayerId } = get()
      if (!board) return
      if (id === backgroundLayerId) return
      // Background must stay at index 0 of the root — clamp moves around it.
      if (parentId == null && backgroundLayerId) {
        const bgIdx = board.getLayers().findIndex((l) => l.id === backgroundLayerId)
        if (bgIdx === 0 && index === 0) index = 1
      }
      board.moveLayer(id, parentId, index)
      set({ layers: layersToMeta(board.getLayers()) })
    },

    reorderSiblings(orderedIds, parentId) {
      const { board } = get()
      if (!board) return
      board.reorderLayers(orderedIds, parentId)
      set({ layers: layersToMeta(board.getLayers()) })
    },

    // ── Selection mode ───────────────────────────────────────────────────
    setSelectionMode(on) {
      if (!on) set({ selectionMode: false })
      else set({ selectionMode: true })
    },

    toggleLayerInSelection(id) {
      const { selectedLayerIds, backgroundLayerId } = get()
      if (id === backgroundLayerId) return
      const next = selectedLayerIds.includes(id)
        ? selectedLayerIds.filter((x) => x !== id)
        : [...selectedLayerIds, id]
      set({ selectedLayerIds: next, activeLayerId: next.at(-1) ?? null })
      const { board } = get()
      if (board && next.length > 0) board.setActiveLayer(next.at(-1)!)
    },

    // ── Mask API ─────────────────────────────────────────────────────────
    maskSelected() {
      const { board, selectedLayerIds, backgroundLayerId, layers } = get()
      if (!board) return
      const candidate = selectedLayerIds.filter((id) => id !== backgroundLayerId)
      let overlayId: string | undefined
      let targetIds: string[] = []
      if (candidate.length >= 2) {
        // Top of the SELECTION in panel order becomes the overlay.
        // Panel reverses sibling order; we want the topmost row, which is the
        // LAST in tree order among the selected ids that share a parent.
        const ordered = layers.filter((l) => candidate.includes(l.id))
        // Use the topmost in tree order as overlay, rest as targets.
        const last = ordered[ordered.length - 1]
        overlayId = last?.id
        targetIds = candidate.filter((id) => id !== overlayId)
      } else if (candidate.length === 1) {
        overlayId = candidate[0]
        // Single-select mask: target the layer immediately below in panel order.
        const flatIds = layers.filter((l) => l.id !== backgroundLayerId).map((l) => l.id)
        const idx = flatIds.indexOf(overlayId!)
        // Panel reverses siblings, so "below" in panel = previous in tree order.
        const targetId = idx > 0 ? flatIds[idx - 1] : undefined
        if (targetId) targetIds = [targetId]
      }
      if (!overlayId || targetIds.length === 0) return
      for (const t of targetIds) board.addMask(t, overlayId, 'alpha')
      set({ layers: layersToMeta(board.getLayers()) })
    },

    releaseMasksFor(ids) {
      const { board } = get()
      if (!board) return
      for (const id of ids) board.clearMasks(id)
      // Also: if `id` was being used as an overlay elsewhere, drop that ref.
      // We approximate by scanning all layers; reverse map kept by render.
      const all = board.getAllLayers()
      for (const l of all) {
        if (l.masks.some((m) => ids.includes(m.layerId))) {
          for (const id of ids) board.removeMask(l.id, id)
        }
      }
      set({ layers: layersToMeta(board.getLayers()) })
    },

    joinMask(targetId, overlayId) {
      const { board } = get()
      if (!board) return
      board.addMask(targetId, overlayId, 'alpha')
      set({ layers: layersToMeta(board.getLayers()) })
    },

    // ── ColorDrop (drag swatch onto canvas) ───────────────────────────────
    beginColorDrag(color, x, y) {
      set({ colorDrag: { color, x, y } })
    },
    updateColorDrag(x, y) {
      const { colorDrag } = get()
      if (!colorDrag) return
      set({ colorDrag: { ...colorDrag, x, y } })
    },
    endColorDrag(x, y) {
      const { board, colorDrag } = get()
      set({ colorDrag: null })
      if (!board || !colorDrag) return false

      // Did the user release over the canvas? Use the canvas element bounding rect.
      const canvasEl = board.canvas.parentElement
      const rect = canvasEl?.getBoundingClientRect()
      if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false

      const fill = board.getTool<FillTool>('fill')
      if (!fill) return false

      const localX = x - rect.left
      const localY = y - rect.top
      const filled = fill.fillAtScreenPoint(localX, localY, colorDrag.color)
      if (filled) {
        // Ripple anchored to viewport coords so it survives store re-renders.
        const id = Date.now() + Math.random()
        set((s) => ({
          colorDropRipples: [...s.colorDropRipples, { id, x, y, color: colorDrag.color }],
        }))
        // Auto-cleanup after the CSS animation completes.
        setTimeout(() => {
          set((s) => ({ colorDropRipples: s.colorDropRipples.filter((r) => r.id !== id) }))
        }, 700)
      }
      return filled
    },
    cancelColorDrag() {
      set({ colorDrag: null })
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
