import type { Board } from '../Board'
import type { PointerData } from '../types'
import { RasterLayer } from '../layers/RasterLayer'
import { VectorLayer } from '../layers/VectorLayer'

/**
 * Constraint on which layer type a tool needs the active layer to be:
 *   'raster'  → only operates on a RasterLayer (brush/pen/eraser raster path/fill)
 *   'vector'  → only operates on a VectorLayer (vector brush/pen, shape tool)
 *   'any'     → operates on any visible layer (select, pan, eyedropper)
 *
 * Tools that pick mode based on layer (Eraser, Fill, SelectTool) declare 'any'
 * and handle the branching internally. The declarative constraint is the
 * source of truth for the "wrong-layer-type" guard that fires the
 * `drawBlocked` hook so UI prompts can react uniformly.
 */
export type ToolLayerRequirement = 'raster' | 'vector' | 'any'

export abstract class Tool {
  protected board: Board | null = null

  /**
   * Declarative layer-type requirement. Subclasses override (default 'any')
   * so the central `guardActiveLayer` helper can fire `drawBlocked` with the
   * right reason — and the demo's LayerMismatchPrompt is reused for ALL tools
   * without each tool re-inventing the check.
   */
  readonly requiredLayerType: ToolLayerRequirement = 'any'

  /** Called when the tool is registered to a Board */
  attach(board: Board): void {
    this.board = board
  }

  onActivate(): void {}
  onDeactivate(): void {}

  abstract onPointerDown(e: PointerData): void
  abstract onPointerMove(e: PointerData): void
  abstract onPointerUp(e: PointerData): void
  abstract onPointerCancel(e: PointerData): void

  /**
   * Returns true if the active layer satisfies `requiredLayerType` AND is
   * visible. Otherwise fires the appropriate `drawBlocked` hook and returns
   * false. Tools call this at the top of `onPointerDown` so the rest of the
   * handler can assume the layer is OK.
   *
   * Centralising this means adding a new layer type only requires updating
   * `Tool` and the renderer — not patching every tool's onPointerDown.
   */
  protected guardActiveLayer(): boolean {
    const board = this.board
    if (!board) return false
    const layer = board.getActiveLayer()
    if (!layer) {
      board.hooks.drawBlocked.call({ reason: 'no-active-layer' })
      return false
    }
    if (!layer.visible) {
      board.hooks.drawBlocked.call({ reason: 'layer-hidden' })
      return false
    }
    const req = this.requiredLayerType
    if (req === 'any') return true
    const isRaster = layer instanceof RasterLayer
    const isVector = layer instanceof VectorLayer
    if (req === 'raster' && !isRaster) {
      board.hooks.drawBlocked.call({ reason: 'wrong-layer-type' })
      return false
    }
    if (req === 'vector' && !isVector) {
      board.hooks.drawBlocked.call({ reason: 'wrong-layer-type' })
      return false
    }
    return true
  }
}

export type { PointerData }
