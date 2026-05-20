// Core
export { Board } from './Board'
export { Camera } from './Camera'
export { Transform } from './Transform'

// Layers
export { Layer } from './layers/Layer'
export { RasterLayer } from './layers/RasterLayer'
export { GroupLayer } from './layers/GroupLayer'

// Tools
export { Tool } from './tools/Tool'
export { BrushTool } from './tools/BrushTool'
export { EraserTool } from './tools/EraserTool'
export type { BrushSettings } from './tools/BrushTool'

// Renderer
export type { Renderer } from './renderer/Renderer'
export { Canvas2DRenderer } from './renderer/Canvas2DRenderer'

// Plugins
export type { Plugin } from './plugins/Plugin'
export { PluginManager } from './plugins/PluginManager'

// History
export { HistoryManager } from './history/HistoryManager'
export type { HistoryEntry } from './history/HistoryManager'

// Hooks
export { BoardHooks } from './hooks/BoardHooks'

// Gestures
export { GestureManager } from './gestures/GestureManager'

// Math
export { Vec2 } from './math/Vec2'
export { Color } from './math/Color'

// Types
export type { BoardOptions, BlendMode, PointerData } from './types'
