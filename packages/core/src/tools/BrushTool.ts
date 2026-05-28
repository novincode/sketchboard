import { Tool } from './Tool'
import { Vec2 } from '../math/Vec2'
import { Color } from '../math/Color'
import type { PointerData } from '../types'
import type { RasterLayer } from '../layers/RasterLayer'

export interface BrushSettings {
  size: number
  opacity: number
  /** 0 = very soft/blurry, 1 = hard crisp edge */
  hardness: number
  pressureAffectsSize: boolean
  pressureAffectsOpacity: boolean
  color: Color
  /** CSS compositeOperation for the path — use 'destination-out' for eraser */
  compositeOperation: GlobalCompositeOperation
}

interface StrokePoint {
  /** Screen-space CSS pixel position — used for stroke overlay rendering */
  sx: number
  sy: number
  /** Layer-canvas-local pixel position — used when committing to layer */
  lx: number
  ly: number
  pressure: number
}

export class BrushTool extends Tool {
  /**
   * Raster brush requires a raster layer to draw into. Subclasses that
   * span layer types (Eraser) override to 'any' and branch internally.
   * PenTool inherits this requirement.
   */
  readonly requiredLayerType: 'raster' | 'vector' | 'any' = 'raster'

  settings: BrushSettings = {
    size: 16,
    opacity: 1,
    hardness: 0.85,
    pressureAffectsSize: true,
    pressureAffectsOpacity: false,
    color: Color.black(),
    compositeOperation: 'source-over',
  }

  private isDrawing = false
  private points: StrokePoint[] = []
  private activeLayer: RasterLayer | null = null
  private preStrokeSnapshot: ImageData | null = null
  /** Prevents scheduling more than one rAF redraw per frame */
  private _overlayPending = false

  /** True when we can use the stroke overlay canvas for rendering. */
  private get usesOverlay(): boolean {
    return this.settings.compositeOperation !== 'destination-out' && !!this.board?.strokeCtx
  }

  // ─── Pointer handlers ─────────────────────────────────────────────────────

  onPointerDown(e: PointerData): void {
    if (!this.guardActiveLayer()) return
    const board = this.board!
    const layer = board.getActiveLayer() as RasterLayer
    if (!layer.ctx) return

    this.activeLayer = layer
    this.isDrawing = true
    this.points = []
    this.preStrokeSnapshot = layer.getImageData()

    this.addPoint(e)

    if (this.usesOverlay) {
      board.clearStrokeCanvas()
      this.scheduleOverlayRedraw()
    } else {
      this.renderToLayer()
      board.markDirty()
    }
  }

  onPointerMove(e: PointerData): void {
    if (!this.isDrawing || !this.board) return

    this.addPoint(e)

    if (this.usesOverlay) {
      this.scheduleOverlayRedraw()
    } else {
      this.renderToLayer()
      this.board.markDirty()
    }
  }

  onPointerUp(e: PointerData): void {
    if (!this.isDrawing || !this.board) return

    this.addPoint(e)

    if (this.usesOverlay) {
      // Commit the stroke to the layer canvas (once), then clear overlay
      this.renderToLayer()
      this.board.clearStrokeCanvas()
    }

    // Clip painted pixels to reference layer alpha (if one is set)
    if (this.activeLayer) this.board.applyReferenceMask(this.activeLayer)

    this.pushHistory()
    this.isDrawing = false
    this.activeLayer = null
    this.points = []
    this.board.markDirty()
  }

  onPointerCancel(_e: PointerData): void {
    if (!this.isDrawing || !this.board) return
    if (this.preStrokeSnapshot && this.activeLayer) {
      this.activeLayer.putImageData(this.preStrokeSnapshot)
    }
    if (this.usesOverlay) this.board.clearStrokeCanvas()
    this.isDrawing = false
    this.activeLayer = null
    this.points = []
    this.board.markDirty()
  }

  // ─── Point recording ──────────────────────────────────────────────────────

  private addPoint(e: PointerData): void {
    if (!this.board || !this.activeLayer) return
    const world = this.board.camera.screenToWorld(
      e.x, e.y,
      this.board.logicalWidth,
      this.board.logicalHeight,
    )
    this.points.push({
      sx: e.x,
      sy: e.y,
      lx: world.x - this.activeLayer.transform.x,
      ly: world.y - this.activeLayer.transform.y,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    })
  }

  // ─── Overlay rendering (screen space, no composite cost) ──────────────────

  private scheduleOverlayRedraw(): void {
    if (this._overlayPending) return
    this._overlayPending = true
    requestAnimationFrame(() => {
      this._overlayPending = false
      if (this.isDrawing) this.redrawOverlayFull()
    })
  }

  private redrawOverlayFull(): void {
    const board = this.board!
    const { strokeCtx } = board
    if (!strokeCtx || this.points.length === 0) return
    const dpr = window.devicePixelRatio ?? 1
    strokeCtx.clearRect(0, 0, strokeCtx.canvas.width, strokeCtx.canvas.height)
    strokeCtx.save()
    strokeCtx.scale(dpr, dpr)
    this.applyBrushStyle(strokeCtx, board.camera.zoom, true)
    this.drawPath(strokeCtx, this.points, 'screen')
    strokeCtx.restore()
  }

  // ─── Layer canvas rendering (world space, called once per stroke) ─────────

  private renderToLayer(): void {
    if (!this.activeLayer) return
    const ctx = this.activeLayer.ctx
    ctx.save()
    this.applyBrushStyle(ctx, 1, false)
    this.drawPath(ctx, this.points, 'world')
    ctx.restore()
  }

  // ─── Style application ────────────────────────────────────────────────────

  private applyBrushStyle(
    ctx: CanvasRenderingContext2D,
    zoom: number,
    isScreen: boolean,
  ): void {
    const { r, g, b } = this.settings.color
    ctx.strokeStyle = `rgb(${r},${g},${b})`
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = this.settings.opacity
    ctx.globalCompositeOperation = this.settings.compositeOperation

    // Soft brush: apply blur — but NEVER on destination-out (eraser) since it bleeds
    // into adjacent pixels and causes the "feathered edge growing" performance bug.
    if (this.settings.hardness < 0.95 && this.settings.compositeOperation !== 'destination-out') {
      const blurPx = (1 - this.settings.hardness) * this.settings.size * (isScreen ? zoom : 1) * 0.4
      if (blurPx > 0.5) ctx.filter = `blur(${blurPx.toFixed(1)}px)`
    }
  }

  // ─── Smooth bezier path drawing ───────────────────────────────────────────

  private drawPath(
    ctx: CanvasRenderingContext2D,
    pts: StrokePoint[],
    space: 'screen' | 'world',
  ): void {
    if (pts.length === 0) return
    const zoom = this.board?.camera.zoom ?? 1

    const coord = (p: StrokePoint) =>
      space === 'screen' ? { x: p.sx, y: p.sy } : { x: p.lx, y: p.ly }

    const baseSize = this.settings.size * (space === 'screen' ? zoom : 1)

    // Single dot
    if (pts.length === 1) {
      const c = coord(pts[0]!)
      const size = this.effectiveSize(pts[0]!.pressure, baseSize)
      ctx.beginPath()
      ctx.arc(c.x, c.y, size / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }

    // Variable-width quadratic bezier chain.
    // Each segment goes from midpoint(pts[i-2], pts[i-1]) to midpoint(pts[i-1], pts[i])
    // with pts[i-1] as the control point — guaranteed C0 continuity between segments.
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]!
      const p1 = pts[i]!
      const c0 = coord(p0)
      const c1 = coord(p1)

      ctx.lineWidth = this.effectiveSize((p0.pressure + p1.pressure) / 2, baseSize)

      // Start: midpoint(pts[i-2], pts[i-1]), or pts[0] for the first segment
      let sx: number, sy: number
      if (i === 1) {
        sx = c0.x; sy = c0.y
      } else {
        const pp = coord(pts[i - 2]!)
        sx = (pp.x + c0.x) / 2
        sy = (pp.y + c0.y) / 2
      }

      // End: midpoint(pts[i-1], pts[i]), or pts[n] for the last segment
      let ex: number, ey: number
      if (i === pts.length - 1) {
        ex = c1.x; ey = c1.y
      } else {
        ex = (c0.x + c1.x) / 2
        ey = (c0.y + c1.y) / 2
      }

      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.quadraticCurveTo(c0.x, c0.y, ex, ey)
      ctx.stroke()
    }
  }

  private effectiveSize(pressure: number, baseSize: number): number {
    if (!this.settings.pressureAffectsSize) return baseSize
    return baseSize * (0.15 + pressure * 0.85)
  }

  // ─── History ──────────────────────────────────────────────────────────────

  private pushHistory(): void {
    if (!this.board || !this.activeLayer || !this.preStrokeSnapshot) return
    const layer = this.activeLayer
    const before = this.preStrokeSnapshot
    const after = layer.getImageData()
    const board = this.board
    board.history.push({
      undo: () => { layer.putImageData(before); board.markDirty() },
      redo: () => { layer.putImageData(after); board.markDirty() },
    })
    this.preStrokeSnapshot = null
  }
}
