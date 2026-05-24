import { Layer } from './Layer'
import type { Camera } from '../Camera'

// ─── Brush stroke (free-draw, many auto-smooth points) ────────────────────────

export interface VectorStrokePoint {
  x: number
  y: number
  pressure: number
}

export interface VectorStroke {
  id: string
  points: VectorStrokePoint[]
  color: string
  lineWidth: number
  opacity: number
  compositeOperation: GlobalCompositeOperation
}

// ─── Pen path (explicit bezier anchors, like Figma) ───────────────────────────

export interface BezierAnchor {
  x: number
  y: number
  /** Absolute coords of the incoming bezier handle. null = sharp corner. */
  handleIn: { x: number; y: number } | null
  /** Absolute coords of the outgoing bezier handle. null = sharp corner. */
  handleOut: { x: number; y: number } | null
  /** smooth = handles are locked mirror; corner = independent handles */
  type: 'smooth' | 'corner'
}

export interface VectorPath {
  id: string
  anchors: BezierAnchor[]
  closed: boolean
  strokeColor: string | null
  strokeWidth: number
  fillColor: string | null
  opacity: number
  compositeOperation: GlobalCompositeOperation
}

// ─── Layer ────────────────────────────────────────────────────────────────────

let _strokeId = 1
let _pathId = 1

export class VectorLayer extends Layer {
  readonly type = 'vector' as const
  strokes: VectorStroke[] = []
  paths: VectorPath[] = []

  // ── Stroke factory ────────────────────────────────────────────────────────

  createStroke(
    points: VectorStrokePoint[],
    color: string,
    lineWidth: number,
    opacity = 1,
    compositeOperation: GlobalCompositeOperation = 'source-over',
  ): VectorStroke {
    return { id: `vs-${_strokeId++}`, points, color, lineWidth, opacity, compositeOperation }
  }

  addStroke(stroke: VectorStroke): void { this.strokes.push(stroke) }

  removeStroke(id: string): void { this.strokes = this.strokes.filter((s) => s.id !== id) }

  // ── Path factory ──────────────────────────────────────────────────────────

  createPath(
    anchors: BezierAnchor[],
    closed: boolean,
    strokeColor: string | null,
    strokeWidth: number,
    fillColor: string | null = null,
    opacity = 1,
    compositeOperation: GlobalCompositeOperation = 'source-over',
  ): VectorPath {
    return { id: `vp-${_pathId++}`, anchors, closed, strokeColor, strokeWidth, fillColor, opacity, compositeOperation }
  }

  addPath(path: VectorPath): void { this.paths.push(path) }

  removePath(id: string): void { this.paths = this.paths.filter((p) => p.id !== id) }

  // ── Erase ─────────────────────────────────────────────────────────────────

  /**
   * Remove entire strokes/paths that come within `radius` (layer-local px) of (x, y).
   * Returns the removed elements (or empty arrays if nothing matched).
   *
   * Hit-tests strokes by point sample and paths by sampling along each bezier
   * segment — so the eraser catches pen paths anywhere along the curve, not
   * only at the sparse anchor positions.
   */
  eraseAt(x: number, y: number, radius: number): { strokes: VectorStroke[]; paths: VectorPath[] } {
    const r2 = radius * radius
    const removedStrokes: VectorStroke[] = []
    const removedPaths: VectorPath[] = []

    this.strokes = this.strokes.filter((s) => {
      for (const p of s.points) {
        const dx = p.x - x, dy = p.y - y
        if (dx * dx + dy * dy <= r2) { removedStrokes.push(s); return false }
      }
      return true
    })

    this.paths = this.paths.filter((p) => {
      if (VectorLayer.pathHitTest(p, x, y, r2)) { removedPaths.push(p); return false }
      return true
    })

    return { strokes: removedStrokes, paths: removedPaths }
  }

  // ── Hit testing ───────────────────────────────────────────────────────────

  /** Return the id of the topmost stroke or path near (x,y) within `radius`. */
  hitTest(x: number, y: number, radius: number): string | null {
    const r2 = radius * radius
    // Check paths first (drawn on top conceptually) — sample bezier curves for accurate hit testing
    for (let i = this.paths.length - 1; i >= 0; i--) {
      if (VectorLayer.pathHitTest(this.paths[i]!, x, y, r2)) return this.paths[i]!.id
    }
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      for (const p of this.strokes[i]!.points) {
        const dx = p.x - x, dy = p.y - y
        if (dx * dx + dy * dy <= r2) return this.strokes[i]!.id
      }
    }
    return null
  }

  /** Sample a cubic bezier at 20 pts per segment to check if point is within r2. */
  private static pathHitTest(path: VectorPath, x: number, y: number, r2: number): boolean {
    const N = 20
    const cubicAt = (p0x: number, p0y: number, p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number, t: number) => {
      const mt = 1 - t
      return {
        x: mt*mt*mt*p0x + 3*mt*mt*t*p1x + 3*mt*t*t*p2x + t*t*t*p3x,
        y: mt*mt*mt*p0y + 3*mt*mt*t*p1y + 3*mt*t*t*p2y + t*t*t*p3y,
      }
    }
    const checkSegment = (prev: BezierAnchor, curr: BezierAnchor) => {
      const cp1 = prev.handleOut ?? { x: prev.x, y: prev.y }
      const cp2 = curr.handleIn ?? { x: curr.x, y: curr.y }
      for (let j = 0; j <= N; j++) {
        const pt = cubicAt(prev.x, prev.y, cp1.x, cp1.y, cp2.x, cp2.y, curr.x, curr.y, j / N)
        const dx = pt.x - x, dy = pt.y - y
        if (dx*dx + dy*dy <= r2) return true
      }
      return false
    }
    const { anchors, closed } = path
    if (anchors.length === 0) return false
    if (anchors.length === 1) {
      const dx = anchors[0]!.x - x, dy = anchors[0]!.y - y
      return dx*dx + dy*dy <= r2
    }
    for (let i = 1; i < anchors.length; i++) {
      if (checkSegment(anchors[i - 1]!, anchors[i]!)) return true
    }
    if (closed && anchors.length >= 2) {
      if (checkSegment(anchors[anchors.length - 1]!, anchors[0]!)) return true
    }
    return false
  }

  /**
   * Return ids of all strokes and paths that have at least one point inside the rect
   * (layer-local coordinates).
   */
  hitTestRect(x: number, y: number, w: number, h: number): string[] {
    const ids: string[] = []
    const inRect = (px: number, py: number) =>
      px >= x && px <= x + w && py >= y && py <= y + h

    for (const s of this.strokes) {
      if (s.points.some((p) => inRect(p.x, p.y))) ids.push(s.id)
    }
    for (const p of this.paths) {
      if (p.anchors.some((a) => inRect(a.x, a.y))) ids.push(p.id)
    }
    return ids
  }

  /** Get bounding box of a stroke or path by id (layer-local). */
  getBounds(id: string): { x: number; y: number; w: number; h: number } | null {
    const stroke = this.strokes.find((s) => s.id === id)
    if (stroke && stroke.points.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of stroke.points) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
      }
      const r = stroke.lineWidth / 2
      return { x: minX - r, y: minY - r, w: maxX - minX + stroke.lineWidth, h: maxY - minY + stroke.lineWidth }
    }
    const path = this.paths.find((p) => p.id === id)
    if (path && path.anchors.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const a of path.anchors) {
        // Only use anchor points (not handles) so the selection box matches the visible path
        if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x
        if (a.y < minY) minY = a.y; if (a.y > maxY) maxY = a.y
      }
      const r = path.strokeWidth / 2
      return { x: minX - r, y: minY - r, w: maxX - minX + path.strokeWidth, h: maxY - minY + path.strokeWidth }
    }
    return null
  }

  /** Scale a stroke or path from an origin point in layer-local coords. */
  scaleElement(id: string, sx: number, sy: number, originX: number, originY: number): void {
    const scaleX = (x: number) => originX + (x - originX) * sx
    const scaleY = (y: number) => originY + (y - originY) * sy
    const stroke = this.strokes.find((s) => s.id === id)
    if (stroke) {
      for (const p of stroke.points) { p.x = scaleX(p.x); p.y = scaleY(p.y) }
      return
    }
    const path = this.paths.find((p) => p.id === id)
    if (path) {
      for (const a of path.anchors) {
        a.x = scaleX(a.x); a.y = scaleY(a.y)
        if (a.handleIn) { a.handleIn.x = scaleX(a.handleIn.x); a.handleIn.y = scaleY(a.handleIn.y) }
        if (a.handleOut) { a.handleOut.x = scaleX(a.handleOut.x); a.handleOut.y = scaleY(a.handleOut.y) }
      }
    }
  }

  /** Rotate a stroke or path by `angle` radians around an origin in layer-local coords. */
  rotateElement(id: string, angle: number, originX: number, originY: number): void {
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const rot = (x: number, y: number): { x: number; y: number } => {
      const dx = x - originX, dy = y - originY
      return { x: originX + dx * cos - dy * sin, y: originY + dx * sin + dy * cos }
    }
    const stroke = this.strokes.find((s) => s.id === id)
    if (stroke) {
      for (const p of stroke.points) { const r = rot(p.x, p.y); p.x = r.x; p.y = r.y }
      return
    }
    const path = this.paths.find((p) => p.id === id)
    if (path) {
      for (const a of path.anchors) {
        const r = rot(a.x, a.y); a.x = r.x; a.y = r.y
        if (a.handleIn)  { const h = rot(a.handleIn.x,  a.handleIn.y);  a.handleIn.x  = h.x; a.handleIn.y  = h.y }
        if (a.handleOut) { const h = rot(a.handleOut.x, a.handleOut.y); a.handleOut.x = h.x; a.handleOut.y = h.y }
      }
    }
  }

  /** Move a stroke or path by (dx, dy) in layer-local coords. */
  translateElement(id: string, dx: number, dy: number): void {
    const stroke = this.strokes.find((s) => s.id === id)
    if (stroke) { stroke.points.forEach((p) => { p.x += dx; p.y += dy }); return }
    const path = this.paths.find((p) => p.id === id)
    if (path) {
      path.anchors.forEach((a) => {
        a.x += dx; a.y += dy
        if (a.handleIn) { a.handleIn.x += dx; a.handleIn.y += dy }
        if (a.handleOut) { a.handleOut.x += dx; a.handleOut.y += dy }
      })
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  render(ctx: CanvasRenderingContext2D, _camera: Camera): void {
    if (!this.visible || (this.strokes.length === 0 && this.paths.length === 0)) return
    ctx.save()
    ctx.globalAlpha = this.opacity
    this.transform.applyToContext(ctx)
    for (const stroke of this.strokes) {
      if (!stroke.points.length) continue
      ctx.save()
      ctx.globalCompositeOperation = stroke.compositeOperation
      ctx.globalAlpha = stroke.opacity
      ctx.strokeStyle = stroke.color
      ctx.fillStyle = stroke.color
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      VectorLayer.drawStroke(ctx, stroke)
      ctx.restore()
    }
    for (const path of this.paths) {
      ctx.save()
      ctx.globalCompositeOperation = path.compositeOperation
      ctx.globalAlpha = path.opacity
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      VectorLayer.drawPath(ctx, path)
      ctx.restore()
    }
    ctx.restore()
  }

  // ── Static draw helpers ───────────────────────────────────────────────────

  static drawStroke(ctx: CanvasRenderingContext2D, stroke: VectorStroke): void {
    const pts = stroke.points
    if (pts.length === 0) return
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(pts[0]!.x, pts[0]!.y, stroke.lineWidth / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]!
      const p1 = pts[i]!
      ctx.lineWidth = stroke.lineWidth * (0.15 + ((p0.pressure + p1.pressure) / 2) * 0.85)
      let sx: number, sy: number
      if (i === 1) { sx = p0.x; sy = p0.y }
      else { const pp = pts[i - 2]!; sx = (pp.x + p0.x) / 2; sy = (pp.y + p0.y) / 2 }
      let ex: number, ey: number
      if (i === pts.length - 1) { ex = p1.x; ey = p1.y }
      else { ex = (p0.x + p1.x) / 2; ey = (p0.y + p1.y) / 2 }
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.quadraticCurveTo(p0.x, p0.y, ex, ey)
      ctx.stroke()
    }
  }

  static drawPath(ctx: CanvasRenderingContext2D, path: VectorPath): void {
    const { anchors, closed } = path
    if (anchors.length < 2) {
      // Single point — draw a dot
      if (anchors.length === 1 && path.strokeColor) {
        ctx.beginPath()
        ctx.arc(anchors[0]!.x, anchors[0]!.y, path.strokeWidth / 2, 0, Math.PI * 2)
        ctx.fillStyle = path.strokeColor
        ctx.fill()
      }
      return
    }

    ctx.beginPath()
    ctx.moveTo(anchors[0]!.x, anchors[0]!.y)

    for (let i = 1; i < anchors.length; i++) {
      const prev = anchors[i - 1]!
      const curr = anchors[i]!
      const cp1 = prev.handleOut ?? { x: prev.x, y: prev.y }
      const cp2 = curr.handleIn ?? { x: curr.x, y: curr.y }
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, curr.x, curr.y)
    }

    if (closed) {
      const last = anchors[anchors.length - 1]!
      const first = anchors[0]!
      const cp1 = last.handleOut ?? { x: last.x, y: last.y }
      const cp2 = first.handleIn ?? { x: first.x, y: first.y }
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, first.x, first.y)
      ctx.closePath()
    }

    if (path.fillColor) {
      ctx.fillStyle = path.fillColor
      ctx.fill()
    }
    if (path.strokeColor) {
      ctx.strokeStyle = path.strokeColor
      ctx.lineWidth = path.strokeWidth
      ctx.stroke()
    }
  }

  // ── Cloning ───────────────────────────────────────────────────────────────

  clone(): VectorLayer {
    const copy = new VectorLayer(this.name)
    copy.strokes = this.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
    copy.paths = this.paths.map((p) => ({
      ...p,
      anchors: p.anchors.map((a) => ({
        ...a,
        handleIn: a.handleIn ? { ...a.handleIn } : null,
        handleOut: a.handleOut ? { ...a.handleOut } : null,
      })),
    }))
    copy.opacity = this.opacity
    copy.blendMode = this.blendMode
    copy.transform = this.transform.clone()
    copy.masks = this.masks.map((m) => ({ ...m }))
    return copy
  }
}
