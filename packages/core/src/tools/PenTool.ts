import { BrushTool } from './BrushTool'

/** Hard-edge pressure pen — crisp round line, full opacity */
export class PenTool extends BrushTool {
  constructor() {
    super()
    Object.assign(this.settings, {
      size: 4,
      hardness: 1.0,
      opacity: 1,
      pressureAffectsSize: true,
      pressureAffectsOpacity: false,
    })
  }
}
