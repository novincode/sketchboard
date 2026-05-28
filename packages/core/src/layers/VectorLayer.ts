import { Layer } from './Layer'
import type { Camera } from '../Camera'
import { buildShapeAnchors } from '../shapes/shapeAnchors'
import { splitStroke, splitPath, type CoveragePredicate } from '../vector/vectorSplit'

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

/**
 * Optional shape descriptor — present when a path was created by the shape
 * tool (rectangle, ellipse, regular polygon, etc). The renderer ignores this
 * field entirely; it's metadata for editing UIs (corner-radius handles,
 * "Sides" stepper) and for the regeneration helper that rebuilds `anchors`
 * when shape params change.
 *
 * Without this metadata a path is "free" — it can still be edited node by
 * node like any other bezier path; only the shape-aware editing affordances
 * disappear.
 */
export interface VectorShape {
  kind: 'rect' | 'ellipse' | 'polygon'
  /** Bounding box top-left in layer-local coords. */
  x: number
  y: number
  width: number
  height: number
  /**
   * Per-corner radius for rectangles (top-left, top-right, bottom-right, bottom-left).
   * Ignored for ellipse/polygon. Always 4 entries; clamped to half-min-dimension.
   */
  cornerRadius?: [number, number, number, number]
  /** Polygon vertex count (3..N). Ignored for rect/ellipse. */
  sides?: number
  /** Polygon rotation in radians (default 0 = first vertex at top). */
  rotation?: number
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
  /** Optional shape descriptor enabling shape-aware editing. See {@link VectorShape}. */
  shape?: VectorShape
  /**
   * Figma-style "round all corners" radius for free-form pen paths. When
   * set, the renderer-fed `anchors` are the ROUNDED version of `baseAnchors`
   * — the source-of-truth anchors that survive radius changes. Sliding the
   * radius from 0 → 20 → 5 → 0 always recovers exactly the original shape.
   *
   * Pen-drawn paths use this; ShapeTool paths use the `shape` descriptor
   * instead (which has its own per-corner radius semantics).
   */
  cornerRadius?: number
  /** Pristine anchors before corner-rounding. Required when `cornerRadius` > 0. */
  baseAnchors?: BezierAnchor[]
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

  /**
   * Update the shape descriptor on a path and regenerate its anchors. No-op
   * if the path doesn't carry shape metadata. Bounds-only changes (move /
   * resize) should go through translateElement / scaleElement instead, which
   * update both anchors AND mirror those changes back into shape.x/y/width/height
   * via {@link syncShapeBounds} so the parametric editor stays in sync.
   */
  updateShape(pathId: string, patch: Partial<VectorShape>): boolean {
    const path = this.paths.find((p) => p.id === pathId)
    if (!path || !path.shape) return false
    const next = { ...path.shape, ...patch }
    // Re-clamp radius / sides to stay safe
    if (next.cornerRadius) {
      const max = Math.min(next.width, next.height) / 2
      next.cornerRadius = next.cornerRadius.map((r) => Math.max(0, Math.min(r, max))) as [number, number, number, number]
    }
    if (next.sides !== undefined) next.sides = Math.max(3, Math.min(64, Math.round(next.sides)))
    path.shape = next
    path.anchors = buildShapeAnchors(next)
    return true
  }

  /**
   * After translate/scale on a shape-bearing path, mirror the new bounding
   * box back into the shape descriptor so further parametric edits start
   * from the correct origin.
   */
  syncShapeBounds(pathId: string): void {
    const path = this.paths.find((p) => p.id === pathId)
    if (!path || !path.shape) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const a of path.anchors) {
      if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x
      if (a.y < minY) minY = a.y; if (a.y > maxY) maxY = a.y
    }
    if (minX === Infinity) return
    path.shape = { ...path.shape, x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

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

  /**
   * Apply a coverage predicate (eraser disk, lasso polygon, etc.) precisely
   * to the layer's strokes and paths — splitting each touched element into
   * the parts OUTSIDE coverage, dropping the parts INSIDE. The lifted
   * (cut-out) pieces are returned separately so a caller can use them as a
   * lasso selection. Returns mappings the caller can replay for undo/redo:
   *   - `replacedStrokes`: original stroke ids that were touched (need
   *     re-insertion on undo)
   *   - `replacedPaths`: original path ids similarly
   *   - `addedStrokeIds` / `addedPathIds`: ids of new sub-elements
   *   - `originalStrokes` / `originalPaths`: snapshots of replaced originals
   *   - `cutStrokes` / `cutPaths`: the inside-coverage pieces (not added to
   *     the layer — caller decides what to do with them)
   *
   * NOTE: this is the unified primitive used by both EraserTool (vector
   * pixel mode) and LassoSelectTool. Coupling the split logic here keeps
   * the two tools consistent and lets us add new "operators" (e.g. a
   * scissor tool, knife slicing) without re-implementing geometry.
   */
  splitByCoverage(
    isCovered: CoveragePredicate,
    /**
     * Optional bounding box of the coverage region in layer-local coords.
     * Elements whose own bbox doesn't intersect are skipped without running
     * the per-point predicate — turns a fast-cursor sweep across hundreds
     * of fragments into an O(N) bbox-test pass instead of full geometry.
     * Omit for non-bounded predicates (e.g. arbitrary functions).
     */
    coverageBounds?: { x0: number; y0: number; x1: number; y1: number },
  ): {
    addedStrokes: VectorStroke[]
    addedPaths: VectorPath[]
    cutStrokes: VectorStroke[]
    cutPaths: VectorPath[]
    originalStrokes: VectorStroke[]
    originalPaths: VectorPath[]
  } {
    const addedStrokes: VectorStroke[] = []
    const addedPaths: VectorPath[] = []
    const cutStrokes: VectorStroke[] = []
    const cutPaths: VectorPath[] = []
    const originalStrokes: VectorStroke[] = []
    const originalPaths: VectorPath[] = []

    const intersects = (b: { x: number; y: number; w: number; h: number }) => {
      if (!coverageBounds) return true
      return !(b.x > coverageBounds.x1 || b.x + b.w < coverageBounds.x0
            || b.y > coverageBounds.y1 || b.y + b.h < coverageBounds.y0)
    }

    const newStrokes: VectorStroke[] = []
    for (const s of this.strokes) {
      // Bbox reject: skip strokes entirely outside the coverage region.
      if (coverageBounds) {
        const b = this.getBounds(s.id)
        if (b && !intersects(b)) { newStrokes.push(s); continue }
      }
      const result = splitStroke(s, isCovered)
      if (!result) { newStrokes.push(s); continue }
      originalStrokes.push(s)
      for (const pts of result.keep) {
        const replaced = this.createStroke(pts.map((p) => ({ ...p })), s.color, s.lineWidth, s.opacity, s.compositeOperation)
        newStrokes.push(replaced)
        addedStrokes.push(replaced)
      }
      for (const pts of result.cut) {
        const lift = this.createStroke(pts.map((p) => ({ ...p })), s.color, s.lineWidth, s.opacity, s.compositeOperation)
        cutStrokes.push(lift)
      }
    }
    this.strokes = newStrokes

    const newPaths: VectorPath[] = []
    for (const p of this.paths) {
      if (coverageBounds) {
        const b = this.getBounds(p.id)
        if (b && !intersects(b)) { newPaths.push(p); continue }
      }
      const result = splitPath(p, isCovered)
      if (!result || !result.changed) { newPaths.push(p); continue }
      originalPaths.push(p)
      for (const anchors of result.keep) {
        // Touched paths become open polylines for the outside portion.
        // Drop the shape descriptor — it no longer describes the geometry
        // after a cut. Stroke/fill style preserved.
        const replaced = this.createPath(anchors, false, p.strokeColor, p.strokeWidth, p.fillColor, p.opacity, p.compositeOperation)
        newPaths.push(replaced)
        addedPaths.push(replaced)
      }
      for (const anchors of result.cut) {
        const lift = this.createPath(anchors, false, p.strokeColor, p.strokeWidth, p.fillColor, p.opacity, p.compositeOperation)
        cutPaths.push(lift)
      }
    }
    this.paths = newPaths

    return { addedStrokes, addedPaths, cutStrokes, cutPaths, originalStrokes, originalPaths }
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

  /**
   * Scale a stroke or path from an origin point in layer-local coords.
   *
   * Shape-bearing paths (rect/ellipse/polygon created via ShapeTool) get
   * special treatment: instead of scaling each anchor individually (which
   * would distort the corner-radius arcs), we scale the shape's BOUNDING
   * BOX and regenerate anchors via `buildShapeAnchors`. The cornerRadius
   * stays at its original value (just clamped to the new half-min), so
   * resizing a rounded rectangle preserves the radius — matching Figma /
   * Illustrator behavior where radius is independent of size.
   */
  scaleElement(id: string, sx: number, sy: number, originX: number, originY: number): void {
    const scaleX = (x: number) => originX + (x - originX) * sx
    const scaleY = (y: number) => originY + (y - originY) * sy
    const stroke = this.strokes.find((s) => s.id === id)
    if (stroke) {
      for (const p of stroke.points) { p.x = scaleX(p.x); p.y = scaleY(p.y) }
      return
    }
    const path = this.paths.find((p) => p.id === id)
    if (!path) return

    if (path.shape) {
      // Shape-aware resize: compute the new bbox from the original shape's
      // bounds and regenerate anchors with the same radius/sides/rotation.
      const s = path.shape
      const tlX = scaleX(s.x),         tlY = scaleY(s.y)
      const brX = scaleX(s.x + s.width), brY = scaleY(s.y + s.height)
      const nx = Math.min(tlX, brX), ny = Math.min(tlY, brY)
      const nw = Math.max(1, Math.abs(brX - tlX))
      const nh = Math.max(1, Math.abs(brY - tlY))
      const maxR = Math.min(nw, nh) / 2
      const next: VectorShape = {
        ...s,
        x: nx, y: ny, width: nw, height: nh,
        cornerRadius: s.cornerRadius
          ? s.cornerRadius.map((r) => Math.max(0, Math.min(r, maxR))) as [number, number, number, number]
          : undefined,
      }
      path.shape = next
      path.anchors = buildShapeAnchors(next)
      return
    }

    for (const a of path.anchors) {
      a.x = scaleX(a.x); a.y = scaleY(a.y)
      if (a.handleIn) { a.handleIn.x = scaleX(a.handleIn.x); a.handleIn.y = scaleY(a.handleIn.y) }
      if (a.handleOut) { a.handleOut.x = scaleX(a.handleOut.x); a.handleOut.y = scaleY(a.handleOut.y) }
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
      // Mirror translation into shape descriptor so later parametric edits
      // (radius drag, side count) start from the new position.
      if (path.shape) {
        path.shape = { ...path.shape, x: path.shape.x + dx, y: path.shape.y + dy }
      }
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
      shape: p.shape ? { ...p.shape, cornerRadius: p.shape.cornerRadius ? [...p.shape.cornerRadius] as [number, number, number, number] : undefined } : undefined,
    }))
    copy.opacity = this.opacity
    copy.blendMode = this.blendMode
    copy.transform = this.transform.clone()
    copy.masks = this.masks.map((m) => ({ ...m }))
    return copy
  }
}
