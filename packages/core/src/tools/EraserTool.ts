import { BrushTool } from './BrushTool'
import { Color } from '../math/Color'

export class EraserTool extends BrushTool {
  constructor() {
    super()
    this.settings = {
      ...this.settings,
      size: 24,
      opacity: 1,
      hardness: 0.7,
      color: Color.black(), // color is irrelevant for destination-out
      compositeOperation: 'destination-out',
    }
  }
}
