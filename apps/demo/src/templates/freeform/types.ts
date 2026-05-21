export type ToolId = 'pen' | 'brush' | 'eraser' | 'vector' | 'pan' | 'eyedropper'

export type EraserMode = 'pixel' | 'stroke'

export type Background = 'dots' | 'grid' | 'none'

export type LayerType = 'raster' | 'vector'

export interface ToolMeta {
  id: ToolId
  label: string
  shortcut: string
  icon: string
}

export const TOOLS: ToolMeta[] = [
  { id: 'pen',        label: 'Pen',        shortcut: 'P', icon: 'pen' },
  { id: 'brush',      label: 'Brush',      shortcut: 'B', icon: 'brush' },
  { id: 'eraser',     label: 'Eraser',     shortcut: 'E', icon: 'eraser' },
  { id: 'vector',     label: 'Vector',     shortcut: 'V', icon: 'vector' },
  { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', icon: 'eyedropper' },
  { id: 'pan',        label: 'Hand',       shortcut: 'H', icon: 'hand' },
]

export const DRAWING_TOOLS: ToolId[] = ['pen', 'brush', 'eraser', 'vector']
export const BRUSH_TOOLS: ToolId[] = ['pen', 'brush']
