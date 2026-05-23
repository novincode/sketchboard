export interface BrushPreset {
  id: string
  name: string
  /** Which underlying tool to activate ('brush' or 'pen') */
  toolId: 'brush' | 'pen'
  hardness: number
  pressureSize: boolean
  pressureOpacity: boolean
}

export const RASTER_BRUSH_PRESETS: BrushPreset[] = [
  { id: 'round',   name: 'Round',    toolId: 'brush', hardness: 0.85, pressureSize: true,  pressureOpacity: false },
  { id: 'ink',     name: 'Ink',      toolId: 'pen',   hardness: 1,    pressureSize: true,  pressureOpacity: false },
  { id: 'soft',    name: 'Airbrush', toolId: 'brush', hardness: 0.05, pressureSize: false, pressureOpacity: true  },
  { id: 'chalk',   name: 'Chalk',    toolId: 'brush', hardness: 0.45, pressureSize: true,  pressureOpacity: true  },
  { id: 'marker',  name: 'Marker',   toolId: 'brush', hardness: 0.98, pressureSize: false, pressureOpacity: false },
]

export const DEFAULT_BRUSH_PRESET_ID = 'round'
