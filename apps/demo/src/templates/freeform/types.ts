/**
 * Tool ids the demo UI distinguishes.
 *
 * Some entries are *virtual* — they don't correspond to a registered Board
 * tool. They proxy to a real tool plus side-effects (e.g. `shape-rect` calls
 * `setActiveTool('shape')` after setting `shapeKind = 'rect'`). The mapping
 * lives in `virtualToolMap` (store.ts).
 *
 * Virtual ids let us expose Figma-style toolbar slots that switch between
 * concrete shape kinds without registering 3 duplicate ShapeTool instances.
 */
export type ToolId =
  | 'brush'
  | 'pen'        // raster pen — sibling of brush (Shift+B cycles)
  | 'eraser'
  | 'fill'       // fill bucket
  | 'shape'      // base shape tool (rarely the activeToolId — see virtuals)
  | 'shape-rect'     // virtual — selects shape tool with kind=rect
  | 'shape-ellipse'  // virtual — selects shape tool with kind=ellipse
  | 'shape-polygon'  // virtual — selects shape tool with kind=polygon
  | 'vector'
  | 'vectorpen'
  | 'select'
  | 'lasso'      // freehand select — sibling of select (Shift+V cycles)
  | 'pan'
  | 'eyedropper'

export type EraserMode = 'pixel' | 'stroke'

export type Background = 'dots' | 'grid' | 'none'

export type LayerType = 'raster' | 'vector'

export interface ToolMeta {
  id: ToolId
  label: string
  shortcut: string
  icon: string
}

/** Flat list used as fallback. Toolbar now driven by TOOLBAR_SLOTS in toolDefs.tsx */
export const TOOLS: ToolMeta[] = [
  { id: 'select',     label: 'Select',       shortcut: 'V',       icon: 'select' },
  { id: 'lasso',      label: 'Lasso Select', shortcut: 'Shift+V', icon: 'lasso' },
  { id: 'brush',      label: 'Brush',        shortcut: 'B',       icon: 'brush' },
  { id: 'pen',        label: 'Raster Pen',   shortcut: 'Shift+B', icon: 'pen' },
  { id: 'eraser',     label: 'Eraser',       shortcut: 'E',       icon: 'eraser' },
  { id: 'fill',       label: 'Fill',         shortcut: 'F',       icon: 'fill' },
  { id: 'vector',     label: 'Vector Brush', shortcut: 'W',       icon: 'vector' },
  { id: 'vectorpen',  label: 'Vector Pen',   shortcut: 'P',       icon: 'vectorpen' },
  { id: 'eyedropper', label: 'Eyedropper',   shortcut: 'I',       icon: 'eyedropper' },
  { id: 'pan',        label: 'Hand',         shortcut: 'H',       icon: 'hand' },
]

export const BRUSH_TOOLS: ToolId[] = ['pen', 'brush']
// Vector-layer-requiring tools, including the shape virtuals (which all proxy
// to the underlying 'shape' tool). Keep in sync with each core tool's
// `requiredLayerType` — this list drives the LayerMismatchPrompt UI.
export const VECTOR_TOOLS: ToolId[] = [
  'vector', 'vectorpen',
  'shape', 'shape-rect', 'shape-ellipse', 'shape-polygon',
]
