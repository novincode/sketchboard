import { Tool } from './Tool'
import type { PointerData } from '../types'
import { VectorLayer, type VectorPath, type VectorShape } from '../layers/VectorLayer'
import { buildShapeAnchors } from '../shapes/shapeAnchors'

export type ShapeKind = 'rect' | 'ellipse' | 'polygon'

export interface ShapeSettings {
  kind: ShapeKind
  strokeColor: string | null
  strokeWidth: number
  fillColor: string | null
  opacity: number
  /** Initial uniform corner radius for rect. User can edit per-corner after via the SelectTool. */
  cornerRadius: number
  /** Vertex count for polygon. Min 3. */
  sides: number
}

/**
 * Drag-to-create shape tool. On pointer down it begins a transient shape;
 * pointer move updates the shape's bounds in world coords; pointer up commits
 * the path into the active VectorLayer with a `shape` metadata descriptor so
 * downstream UIs (SelectTool corner-radius handles, properties panel) can
 * edit it parametrically.
 *
 * Modifier keys mirror Figma:
 *   Shift  → constrain to 1:1 (square / circle / regular)
 *   Alt    → grow from the click point as center (otherwise from click as a
 *            corner of the bounding box)
 *
 * The tool draws a preview onto the board's strokeCanvas while the gesture
 * is in flight so the active VectorLayer's canvas isn't dirtied.
 */
export class ShapeTool extends Tool {
  settings: ShapeSettings = {
    kind: 'rect',
    strokeColor: '#1a1a1a',
    strokeWidth: 2,
    fillColor: null,
    opacity: 1,
    cornerRadius: 0,
    sides: 6,
  }

  private _drag: {
    layer: VectorLayer
    startWX: number
    startWY: number
    shiftDown: boolean
    altDown: boolean
  } | null = null

  onActivate(): void {
    if (this.board) this.board.canvas.style.cursor = 'crosshair'
  }
  onDeactivate(): void {
    if (this.board) this.board.canvas.style.cursor = ''
    this.board?.clearStrokeCanvas()
    this._drag = null
  }

  onPointerDown(e: PointerData): void {
    if (!this.board) return
    const layer = this.board.getActiveLayer()
    if (!(layer instanceof VectorLayer)) {
      this.board.hooks.drawBlocked.call({ reason: 'wrong-layer-type' })
      return
    }
    if (!layer.visible) {
      this.board.hooks.drawBlocked.call({ reason: 'layer-hidden' })
      return
    }
    const world = this.board.camera.screenToWorld(e.x, e.y, this.board.logicalWidth, this.board.logicalHeight)
    const startWX = world.x - layer.transform.x
    const startWY = world.y - layer.transform.y
    this._drag = {
      layer, startWX, startWY,
      shiftDown: false, altDown: false,
    }
  }

  onPointerMove(e: PointerData): void {
    const d = this._drag
    if (!d || !this.board) return
    this._drawPreview(e)
  }

  onPointerUp(e: PointerData): void {
    const d = this._drag
    if (!d || !this.board) return
    const shape = this._computeShape(e)
    this._drag = null
    this.board.clearStrokeCanvas()

    // Bail on degenerate sizes — single-click without drag.
    if (Math.abs(shape.width) < 2 || Math.abs(shape.height) < 2) return

    const normalized = normalizeShape(shape)
    const anchors = buildShapeAnchors(normalized)
    const layer = d.layer
    const board = this.board
    const path: VectorPath = layer.createPath(
      anchors, true,
      this.settings.strokeColor, this.settings.strokeWidth,
      this.settings.fillColor, this.settings.opacity, 'source-over',
    )
    path.shape = normalized
    layer.addPath(path)
    board.markDirty()
    board.history.push({
      undo: () => { layer.removePath(path.id); board.markDirty() },
      redo: () => { layer.addPath(path); board.markDirty() },
    })
  }

  onPointerCancel(_e: PointerData): void {
    this._drag = null
    this.board?.clearStrokeCanvas()
  }

  // ── Preview drawing on the stroke overlay ────────────────────────────────

  private _drawPreview(e: PointerData): void {
    const board = this.board!
    const ctx = board.strokeCtx
    const canvas = board.strokeCanvas
    if (!ctx || !canvas) return

    // Reset transform, clear, then mirror the renderer's dpr+camera pipeline
    // so world coords plot to the right screen pixels.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)
    board.camera.applyToContext(ctx, board.logicalWidth, board.logicalHeight)

    const shape = normalizeShape(this._computeShape(e))
    const layer = this._drag!.layer
    ctx.translate(layer.transform.x, layer.transform.y)

    const anchors = buildShapeAnchors(shape)
    if (anchors.length < 2) { ctx.restore(); return }

    ctx.beginPath()
    ctx.moveTo(anchors[0]!.x, anchors[0]!.y)
    for (let i = 1; i < anchors.length; i++) {
      const prev = anchors[i - 1]!
      const curr = anchors[i]!
      const cp1 = prev.handleOut ?? { x: prev.x, y: prev.y }
      const cp2 = curr.handleIn ?? { x: curr.x, y: curr.y }
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, curr.x, curr.y)
    }
    // Close the loop
    const last = anchors[anchors.length - 1]!
    const first = anchors[0]!
    const cp1 = last.handleOut ?? { x: last.x, y: last.y }
    const cp2 = first.handleIn ?? { x: first.x, y: first.y }
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, first.x, first.y)
    ctx.closePath()

    if (this.settings.fillColor) {
      ctx.fillStyle = this.settings.fillColor
      ctx.globalAlpha = this.settings.opacity
      ctx.fill()
    }
    if (this.settings.strokeColor) {
      ctx.strokeStyle = this.settings.strokeColor
      ctx.lineWidth = this.settings.strokeWidth
      ctx.globalAlpha = this.settings.opacity
      ctx.stroke()
    }
    ctx.restore()
  }

  /**
   * Compute the IN-FLIGHT shape from the current pointer position. Bounds
   * may have negative width/height (user dragged up-left); normalizeShape
   * fixes that for commit.
   */
  private _computeShape(e: PointerData): VectorShape {
    const board = this.board!
    const d = this._drag!
    const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
    let endWX = world.x - d.layer.transform.x
    let endWY = world.y - d.layer.transform.y

    // We don't have raw modifier state on PointerData; ShapeTool subscribes
    // to window keydown/up in its own way? For now, no live shift/alt during
    // drag. We rely on settings.kind for shape choice and bounds are computed
    // straightforwardly. (Modifier-aware constraints can be added with a
    // window-modifier listener if needed.)
    const startX = d.startWX
    const startY = d.startWY
    const x = Math.min(startX, endWX)
    const y = Math.min(startY, endWY)
    const w = Math.abs(endWX - startX)
    const h = Math.abs(endWY - startY)

    return {
      kind: this.settings.kind,
      x, y, width: w, height: h,
      cornerRadius: this.settings.kind === 'rect'
        ? [this.settings.cornerRadius, this.settings.cornerRadius, this.settings.cornerRadius, this.settings.cornerRadius]
        : undefined,
      sides: this.settings.kind === 'polygon' ? Math.max(3, this.settings.sides) : undefined,
      rotation: 0,
    }
  }
}

/** Clamp negatives / radius / sides into safe ranges. */
function normalizeShape(s: VectorShape): VectorShape {
  const w = Math.max(0, s.width)
  const h = Math.max(0, s.height)
  const out: VectorShape = { ...s, x: s.x, y: s.y, width: w, height: h }
  if (out.cornerRadius) {
    const max = Math.min(w, h) / 2
    out.cornerRadius = out.cornerRadius.map((r) => Math.max(0, Math.min(r, max))) as [number, number, number, number]
  }
  if (out.sides !== undefined) out.sides = Math.max(3, Math.min(64, Math.round(out.sides)))
  return out
}
