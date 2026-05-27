// Core
export { Board } from './Board'

// Brushes
export { BrushRegistry } from './brushes/BrushRegistry'
export type { RasterBrushDefinition, VectorBrushDefinition, PressureCurvePoint } from './brushes/BrushDefinition'
export {
  DEFAULT_RASTER_BRUSH, DEFAULT_INK_BRUSH, DEFAULT_SOFT_BRUSH,
  DEFAULT_VECTOR_BRUSH, DEFAULT_VECTOR_CALLIGRAPHY,
} from './brushes/BrushDefinition'
export { Camera } from './Camera'
export { Transform } from './Transform'

// Layers
export { Layer } from './layers/Layer'
export type { MaskRef } from './layers/Layer'
export { RasterLayer } from './layers/RasterLayer'
export { GroupLayer } from './layers/GroupLayer'
export { VectorLayer } from './layers/VectorLayer'
export type {
  VectorStroke, VectorStrokePoint,
  VectorPath, BezierAnchor, VectorShape,
} from './layers/VectorLayer'
export { buildShapeAnchors } from './shapes/shapeAnchors'

// Tools
export { Tool } from './tools/Tool'
export { BrushTool } from './tools/BrushTool'
export { EraserTool } from './tools/EraserTool'
export type { EraserVectorMode } from './tools/EraserTool'
export { PenTool } from './tools/PenTool'
export { PencilTool } from './tools/PencilTool'
export { PanTool } from './tools/PanTool'
export { EyedropperTool } from './tools/EyedropperTool'
export { VectorBrushTool } from './tools/VectorBrushTool'
export { VectorPenTool } from './tools/VectorPenTool'
export { SelectTool } from './tools/SelectTool'
export { FillTool } from './tools/FillTool'
export type { FillSettings, FillPlacement } from './tools/FillTool'
export { ShapeTool } from './tools/ShapeTool'
export type { ShapeSettings, ShapeKind } from './tools/ShapeTool'
export { LassoSelectTool } from './tools/LassoSelectTool'
export type { BrushSettings } from './tools/BrushTool'
export type { VectorBrushSettings } from './tools/VectorBrushTool'
export type { VectorPenSettings } from './tools/VectorPenTool'

// Renderer
export type { Renderer } from './renderer/Renderer'
export { Canvas2DRenderer } from './renderer/Canvas2DRenderer'

// Plugins
export type { Plugin } from './plugins/Plugin'
export { PluginManager } from './plugins/PluginManager'

// Keyboard
export { KeyboardManager } from './keyboard/KeyboardManager'
export { KeyboardPlugin } from './keyboard/KeyboardPlugin'
export { DEFAULT_SHORTCUTS } from './keyboard/KeyboardManager'
export type { ShortcutDef, DefaultShortcutId, ShortcutOverrides } from './keyboard/KeyboardManager'

// History
export { HistoryManager } from './history/HistoryManager'
export type { HistoryEntry } from './history/HistoryManager'

// Hooks
export { BoardHooks } from './hooks/BoardHooks'
export type { DrawBlockedReason } from './hooks/BoardHooks'

// Gestures
export { GestureManager } from './gestures/GestureManager'

// Math
export { Vec2 } from './math/Vec2'
export { Color } from './math/Color'

// Types
export type { BoardOptions, BlendMode, PointerData } from './types'
