export type ToolId =
  | 'brush'
  | 'pen'        // raster pen — sibling of brush (Shift+B cycles)
  | 'eraser'
  | 'fill'       // fill bucket
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
export const VECTOR_TOOLS: ToolId[] = ['vector', 'vectorpen']
