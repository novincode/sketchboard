import { BrushTool } from './BrushTool'
import { VectorLayer } from '../layers/VectorLayer'
import { Color } from '../math/Color'
import type { PointerData } from '../types'

export class EraserTool extends BrushTool {
  private _eraseMode: 'raster' | 'vector' = 'raster'

  constructor() {
    super()
    this.settings = {
      ...this.settings,
      size: 24,
      opacity: 1,
      hardness: 0.7,
      color: Color.black(),
      compositeOperation: 'destination-out',
    }
  }

  onPointerDown(e: PointerData): void {
    const layer = this.board?.getActiveLayer()
    this._eraseMode = layer instanceof VectorLayer ? 'vector' : 'raster'
    if (this._eraseMode === 'vector') {
      // Erase immediately at first position
      this._eraseVector(e)
    } else {
      super.onPointerDown(e)
    }
  }

  onPointerMove(e: PointerData): void {
    if (this._eraseMode === 'vector') {
      this._eraseVector(e)
    } else {
      super.onPointerMove(e)
    }
  }

  onPointerUp(e: PointerData): void {
    if (this._eraseMode === 'vector') return
    super.onPointerUp(e)
  }

  onPointerCancel(e: PointerData): void {
    if (this._eraseMode === 'vector') return
    super.onPointerCancel(e)
  }

  private _eraseVector(e: PointerData): void {
    const board = this.board
    if (!board) return
    const layer = board.getActiveLayer()
    if (!(layer instanceof VectorLayer)) return
    const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
    const lx = world.x - layer.transform.x
    const ly = world.y - layer.transform.y
    const radius = (this.settings.size / 2) / board.camera.zoom
    if (layer.eraseAt(lx, ly, radius)) board.markDirty()
  }
}
