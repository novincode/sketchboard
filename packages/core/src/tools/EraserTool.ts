import { BrushTool } from './BrushTool'
import { VectorLayer, type VectorStroke, type VectorPath } from '../layers/VectorLayer'
import { diskCoverage, capsuleCoverage } from '../vector/vectorSplit'
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
  // Eraser handles BOTH raster and vector layers — picks behavior based on
  // active layer kind in onPointerDown. Override BrushTool's eventual
  // raster-only requirement so the guard doesn't reject vector clicks.
  readonly requiredLayerType = 'any' as const
  private _eraseMode: 'raster' | 'vector' = 'raster'
  /**
   * Layer-level snapshot taken at pointerdown. The commit step takes a
   * second snapshot and pushes ONE undo/redo entry that restores from each.
   *
   * This is intentionally NOT incremental tracking of removed/added ids.
   * Incremental aggregation broke when a single gesture cut a piece that
   * was itself produced by an earlier stamp in the same gesture — undo
   * would then re-add the intermediate piece because both its "removed at
   * stamp N" id and its "added at stamp N-1" id were on the lists. The
   * symptom was duplicate stacked rectangles after undo. Snapshot-based
   * history sidesteps the bug entirely: the layer either looks like its
   * pre-gesture state, or its post-gesture state. Nothing in between.
   */
  private _gestureStartSnap: { strokes: VectorStroke[]; paths: VectorPath[] } | null = null
  private _vectorLayer: VectorLayer | null = null
  /** Last erase point in layer-local coords — used for capsule sweep. */
  private _lastEraseLocal: { x: number; y: number } | null = null
  /** Tracks whether the gesture actually mutated the layer (skip history if not). */
  private _gestureDirty = false

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
      this._vectorLayer = layer as VectorLayer
      this._lastEraseLocal = null
      this._gestureDirty = false
      this._gestureStartSnap = this._vectorLayer.snapshotElements()
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
    if (!board || !this._vectorLayer) return
    const layer = this._vectorLayer
    const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
    const lx = world.x - layer.transform.x
    const ly = world.y - layer.transform.y
    const radius = (this.settings.size / 2) / board.camera.zoom

    if (this.vectorMode === 'stroke') {
      const { strokes, paths } = layer.eraseAt(lx, ly, radius)
      if (strokes.length || paths.length) {
        this._gestureDirty = true
        board.markDirty()
      }
      this._lastEraseLocal = { x: lx, y: ly }
      return
    }

    // Pixel-precise split: sweep a CAPSULE from the previous sample to the
    // current one (degenerate first stamp = disk). Catches strokes the cursor
    // flew over between samples + clean parallel cut edge. Bbox lets
    // splitByCoverage skip elements outside the sweep cheaply.
    const prev = this._lastEraseLocal
    const isCovered = prev
      ? capsuleCoverage(prev.x, prev.y, lx, ly, radius)
      : diskCoverage(lx, ly, radius)
    const x0 = prev ? Math.min(prev.x, lx) - radius : lx - radius
    const y0 = prev ? Math.min(prev.y, ly) - radius : ly - radius
    const x1 = prev ? Math.max(prev.x, lx) + radius : lx + radius
    const y1 = prev ? Math.max(prev.y, ly) + radius : ly + radius
    this._lastEraseLocal = { x: lx, y: ly }
    const result = layer.splitByCoverage(isCovered, { x0, y0, x1, y1 })
    if (result.originalStrokes.length > 0 || result.originalPaths.length > 0) {
      this._gestureDirty = true
      board.markDirty()
    }
  }

  private _commitVectorErase(): void {
    const board = this.board
    const layer = this._vectorLayer
    const startSnap = this._gestureStartSnap
    const dirty = this._gestureDirty
    this._gestureStartSnap = null
    this._vectorLayer = null
    this._lastEraseLocal = null
    this._gestureDirty = false
    if (!board || !layer || !startSnap || !dirty) return

    // Snapshot the POST state once and push ONE undo/redo. Snapshot-based
    // history is identical for stroke and pixel modes — no separate code
    // paths, no aggregation bugs.
    const endSnap = layer.snapshotElements()
    board.history.push({
      undo: () => { layer.restoreElementsSnapshot(startSnap); board.markDirty() },
      redo: () => { layer.restoreElementsSnapshot(endSnap);   board.markDirty() },
    })
  }
}
