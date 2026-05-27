import { BrushTool } from './BrushTool'
import { VectorLayer, type VectorStroke, type VectorPath } from '../layers/VectorLayer'
import { diskCoverage } from '../vector/vectorSplit'
import { Color } from '../math/Color'
import type { PointerData } from '../types'

/**
 * Two distinct vector eraser behaviors:
 *  - `stroke` (default): touching a stroke/path anywhere removes the entire
 *    element. Matches Procreate's vector eraser & the original behavior.
 *  - `pixel`: precise per-disk split — only the points/curve segments under
 *    the eraser disk are removed, splitting elements into the surviving
 *    pieces. Matches Adobe Fresco's pixel-eraser on vector.
 *
 * Toggle via `settings.vectorMode` from the demo store.
 */
export type EraserVectorMode = 'stroke' | 'pixel'

export class EraserTool extends BrushTool {
  private _eraseMode: 'raster' | 'vector' = 'raster'
  // Aggregate everything removed during this gesture so a single undo entry
  // restores the entire stroke — matches the raster eraser's UX where you
  // get one undo per pointer-down, not one per pixel.
  private _gestureOriginal: { strokes: VectorStroke[]; paths: VectorPath[] } | null = null
  /** Element IDs added during the gesture — used for redo. */
  private _gestureAdded: { strokes: string[]; paths: string[] } | null = null
  private _vectorLayer: VectorLayer | null = null

  /**
   * Vector eraser sub-mode. `'stroke'` removes whole elements (original
   * behavior); `'pixel'` splits elements precisely at the eraser disk.
   * Defaults to stroke since it matches Procreate's affordance.
   */
  vectorMode: EraserVectorMode = 'stroke'

  /** UI hook so the demo store can switch the mode at runtime. */
  setVectorMode(mode: EraserVectorMode): void {
    this.vectorMode = mode
  }

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
      this._gestureOriginal = { strokes: [], paths: [] }
      this._gestureAdded = { strokes: [], paths: [] }
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
    if (!board || !this._vectorLayer || !this._gestureOriginal || !this._gestureAdded) return
    const layer = this._vectorLayer
    const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
    const lx = world.x - layer.transform.x
    const ly = world.y - layer.transform.y
    const radius = (this.settings.size / 2) / board.camera.zoom

    if (this.vectorMode === 'stroke') {
      // Whole-element removal (original behavior). Aggregate for one undo.
      const { strokes, paths } = layer.eraseAt(lx, ly, radius)
      if (strokes.length || paths.length) {
        this._gestureOriginal.strokes.push(...strokes)
        this._gestureOriginal.paths.push(...paths)
        board.markDirty()
      }
      return
    }

    // Pixel-precise split: use the unified VectorLayer.splitByCoverage so
    // this stays consistent with LassoSelectTool's split semantics. The
    // "cut" pieces are simply discarded here — eraser doesn't preserve them.
    const isCovered = diskCoverage(lx, ly, radius)
    const result = layer.splitByCoverage(isCovered)
    if (result.originalStrokes.length === 0 && result.originalPaths.length === 0) return
    // We deliberately don't track the cut pieces (they're erased). For
    // undo/redo, we need: original elements + ids of new replacement
    // pieces. Track both incrementally so a long gesture still has one
    // undo entry on pointer-up.
    this._gestureOriginal.strokes.push(...result.originalStrokes)
    this._gestureOriginal.paths.push(...result.originalPaths)
    this._gestureAdded.strokes.push(...result.addedStrokes.map((s) => s.id))
    this._gestureAdded.paths.push(...result.addedPaths.map((p) => p.id))
    board.markDirty()
  }

  private _commitVectorErase(): void {
    const board = this.board
    const original = this._gestureOriginal
    const added = this._gestureAdded
    const layer = this._vectorLayer
    this._gestureOriginal = null
    this._gestureAdded = null
    this._vectorLayer = null
    if (!board || !original || !layer) return
    if (original.strokes.length === 0 && original.paths.length === 0) return

    if (this.vectorMode === 'stroke') {
      // Whole-element removal undo (original behavior).
      board.history.push({
        undo: () => {
          for (const s of original.strokes) layer.addStroke(s)
          for (const p of original.paths)   layer.addPath(p)
          board.markDirty()
        },
        redo: () => {
          for (const s of original.strokes) layer.removeStroke(s.id)
          for (const p of original.paths)   layer.removePath(p.id)
          board.markDirty()
        },
      })
      return
    }

    // Pixel mode: snapshot the current (post-split) state of the layer so
    // redo can re-apply it precisely without re-running the geometry.
    const addedStrokeIds = added?.strokes ?? []
    const addedPathIds = added?.paths ?? []
    // Capture clone copies of every replacement element so redo works after
    // they've been removed by undo.
    const addedStrokes = addedStrokeIds.flatMap((id) => {
      const s = layer.strokes.find((x) => x.id === id)
      return s ? [{ ...s, points: s.points.map((p) => ({ ...p })) }] : []
    })
    const addedPaths = addedPathIds.flatMap((id) => {
      const p = layer.paths.find((x) => x.id === id)
      return p ? [{ ...p, anchors: p.anchors.map((a) => ({ ...a, handleIn: a.handleIn ? { ...a.handleIn } : null, handleOut: a.handleOut ? { ...a.handleOut } : null })) }] : []
    })
    board.history.push({
      undo: () => {
        for (const id of addedStrokeIds) layer.removeStroke(id)
        for (const id of addedPathIds)   layer.removePath(id)
        for (const s of original.strokes) layer.addStroke(s)
        for (const p of original.paths)   layer.addPath(p)
        board.markDirty()
      },
      redo: () => {
        for (const s of original.strokes) layer.removeStroke(s.id)
        for (const p of original.paths)   layer.removePath(p.id)
        for (const s of addedStrokes) layer.addStroke({ ...s, points: s.points.map((p) => ({ ...p })) })
        for (const p of addedPaths)   layer.addPath({ ...p, anchors: p.anchors.map((a) => ({ ...a, handleIn: a.handleIn ? { ...a.handleIn } : null, handleOut: a.handleOut ? { ...a.handleOut } : null })) })
        board.markDirty()
      },
    })
  }
}
