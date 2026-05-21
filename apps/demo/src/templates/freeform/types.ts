export type ToolId =
  | 'pen'
  | 'brush'
  | 'eraser'
  | 'vector'
  | 'vectorpen'
  | 'select'
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

export const TOOLS: ToolMeta[] = [
  { id: 'select',     label: 'Select',      shortcut: 'V', icon: 'select' },
  { id: 'pen',        label: 'Pen',         shortcut: 'P', icon: 'pen' },
  { id: 'brush',      label: 'Brush',       shortcut: 'B', icon: 'brush' },
  { id: 'eraser',     label: 'Eraser',      shortcut: 'E', icon: 'eraser' },
  { id: 'vector',     label: 'Vector Brush',shortcut: 'W', icon: 'vector' },
  { id: 'vectorpen',  label: 'Vector Pen',  shortcut: 'Q', icon: 'vectorpen' },
  { id: 'eyedropper', label: 'Eyedropper',  shortcut: 'I', icon: 'eyedropper' },
  { id: 'pan',        label: 'Hand',        shortcut: 'H', icon: 'hand' },
]

export const BRUSH_TOOLS: ToolId[] = ['pen', 'brush']
export const VECTOR_TOOLS: ToolId[] = ['vector', 'vectorpen']
