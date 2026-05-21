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
    if (!this.board) return
    const layer = this.board.getActiveLayer() as RasterLayer | undefined
    if (!layer?.ctx) return

    this.activeLayer = layer
    this.isDrawing = true
    this.points = []
    this.overlayDrawnTo = 0
    this.preStrokeSnapshot = layer.getImageData()

    this.addPoint(e)

    if (this.usesOverlay) {
      this.appendToOverlay()
      // No markDirty — overlay handles visual feedback
    } else {
      this.renderToLayer()
      this.board.markDirty()
    }
  }

  onPointerMove(e: PointerData): void {
    if (!this.isDrawing || !this.board) return

    this.addPoint(e)

    if (this.usesOverlay) {
      this.appendToOverlay()   // O(1) — only draws the new tail segment
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

  /**
   * Incrementally appends the NEW tail of the stroke to the overlay canvas.
   * O(1) per pointer event — never redraws old points.
   * The overlay is only cleared on stroke start (onPointerDown) and stroke end.
   */
  private appendToOverlay(): void {
    const board = this.board!
    const { strokeCtx } = board
    if (!strokeCtx || this.points.length === 0) return

    // We need at least 1 overlap point for smooth bezier joining
    const startIdx = Math.max(0, this.overlayDrawnTo - 1)
    const slice = this.points.slice(startIdx)
    if (slice.length < 2) return

    const dpr = window.devicePixelRatio ?? 1
    strokeCtx.save()
    strokeCtx.scale(dpr, dpr)
    this.applyBrushStyle(strokeCtx, board.camera.zoom, true)
    this.drawPath(strokeCtx, slice, 'screen')
    strokeCtx.restore()
    this.overlayDrawnTo = this.points.length - 1
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

    // Soft brush: apply blur. Scale blur by zoom for screen rendering.
    if (this.settings.hardness < 0.95) {
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

    // Multi-segment variable-width bezier stroke.
    // Each segment is drawn as a quadratic bezier from midpoint[i-1] to midpoint[i]
    // with pts[i] as the control point. Width varies per segment.
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]!
      const p1 = pts[i]!
      const c0 = coord(p0)
      const c1 = coord(p1)

      const avgPressure = (p0.pressure + p1.pressure) / 2
      const w = this.effectiveSize(avgPressure, baseSize)

      ctx.lineWidth = w

      // Midpoints for smooth joining between segments
      let mx0: number, my0: number, mx1: number, my1: number

      if (i === 1) {
        mx0 = c0.x
        my0 = c0.y
      } else {
        const pp = coord(pts[i - 2]!)
        mx0 = (pp.x + c0.x) / 2
        my0 = (pp.y + c0.y) / 2
      }

      if (i === pts.length - 1) {
        mx1 = c1.x
        my1 = c1.y
      } else {
        const pn = coord(pts[i + 1]!)
        mx1 = (c0.x + pn.x) / 2
        my1 = (c0.y + pn.y) / 2
      }

      ctx.beginPath()
      ctx.moveTo(mx0, my0)
      ctx.quadraticCurveTo(c0.x, c0.y, (c0.x + mx1) / 2, (c0.y + my1) / 2)
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
