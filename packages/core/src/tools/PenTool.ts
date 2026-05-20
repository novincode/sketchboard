import { BrushTool } from './BrushTool'

/** Hard-edged pressure-sensitive pen — no softness, clean lines */
export class PenTool extends BrushTool {
  constructor() {
    super()
    this.settings = {
      ...this.settings,
      size: 4,
      hardness: 1.0,
      opacity: 1,
      pressureAffectsSize: true,
      pressureAffectsOpacity: false,
    }
  }
}
