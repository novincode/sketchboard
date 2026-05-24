import { BrushTool } from './BrushTool'
import { VectorLayer, type VectorStroke, type VectorPath } from '../layers/VectorLayer'
import { Color } from '../math/Color'
import type { PointerData } from '../types'

export class EraserTool extends BrushTool {
  private _eraseMode: 'raster' | 'vector' = 'raster'
  // Aggregate everything removed during this gesture so a single undo entry
  // restores the entire stroke — matches the raster eraser's UX where you
  // get one undo per pointer-down, not one per pixel.
  private _vectorRemoved: { strokes: VectorStroke[]; paths: VectorPath[] } | null = null
  private _vectorLayer: VectorLayer | null = null

  constructor() {
    super()
    this.settings = {
      ...this.settings,
      size: 24,
      opacity: 1,
      hardness: 1.0,  // hard eraser edge (blur on destination-out causes feathering + lag)
      color: Color.black(),
      compositeOperation: 'destination-out',
    }
  }

  onPointerDown(e: PointerData): void {
    const layer = this.board?.getActiveLayer()
    this._eraseMode = layer instanceof VectorLayer ? 'vector' : 'raster'
    if (this._eraseMode === 'vector') {
      this._vectorRemoved = { strokes: [], paths: [] }
      this._vectorLayer = layer as VectorLayer
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
    if (this._eraseMode === 'vector') {
      this._commitVectorErase()
      return
    }
    super.onPointerUp(e)
  }

  onPointerCancel(e: PointerData): void {
    if (this._eraseMode === 'vector') {
      this._commitVectorErase()
      return
    }
    super.onPointerCancel(e)
  }

  private _eraseVector(e: PointerData): void {
    const board = this.board
    if (!board || !this._vectorLayer || !this._vectorRemoved) return
    const layer = this._vectorLayer
    const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
    const lx = world.x - layer.transform.x
    const ly = world.y - layer.transform.y
    const radius = (this.settings.size / 2) / board.camera.zoom
    const { strokes, paths } = layer.eraseAt(lx, ly, radius)
    if (strokes.length || paths.length) {
      this._vectorRemoved.strokes.push(...strokes)
      this._vectorRemoved.paths.push(...paths)
      board.markDirty()
    }
  }

  private _commitVectorErase(): void {
    const board = this.board
    const removed = this._vectorRemoved
    const layer = this._vectorLayer
    this._vectorRemoved = null
    this._vectorLayer = null
    if (!board || !removed || !layer) return
    if (removed.strokes.length === 0 && removed.paths.length === 0) return

    // History: undo restores the removed strokes/paths to the layer.
    // Order of restoration doesn't matter — drawing order is by array
    // position, which we lost on filter(); we re-append at the end, which
    // moves them to the top. Acceptable trade-off; users undoing usually
    // want the content back regardless of z-order.
    board.history.push({
      undo: () => {
        for (const s of removed.strokes) layer.addStroke(s)
        for (const p of removed.paths)   layer.addPath(p)
        board.markDirty()
      },
      redo: () => {
        for (const s of removed.strokes) layer.removeStroke(s.id)
        for (const p of removed.paths)   layer.removePath(p.id)
        board.markDirty()
      },
    })
  }
}
