export type ToolId = 'pen' | 'brush' | 'pencil' | 'eraser' | 'pan' | 'eyedropper'

export type Background = 'dots' | 'grid' | 'none'

export interface ToolMeta {
  id: ToolId
  label: string
  shortcut: string
  /** lucide-react icon name pattern — resolved in Toolbar */
  icon: string
}

export const TOOLS: ToolMeta[] = [
  { id: 'pen', label: 'Pen', shortcut: 'P', icon: 'pen' },
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: 'brush' },
  { id: 'pencil', label: 'Pencil', shortcut: 'N', icon: 'pencil' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: 'eraser' },
  { id: 'pan', label: 'Hand', shortcut: 'H', icon: 'hand' },
  { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', icon: 'eyedropper' },
]
