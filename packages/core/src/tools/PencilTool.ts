import { BrushTool } from './BrushTool'

/**
 * Graphite pencil — slightly smaller default size, pressure affects both size and opacity.
 * Inherits the smooth bezier path approach from BrushTool.
 * The texture effect (grain) comes from the slightly reduced hardness + opacity variation.
 */
export class PencilTool extends BrushTool {
  constructor() {
    super()
    Object.assign(this.settings, {
      size: 6,
      hardness: 0.92,
      opacity: 0.9,
      pressureAffectsSize: true,
      pressureAffectsOpacity: true,
    })
  }
}
