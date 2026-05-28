import type { BezierAnchor, VectorShape } from '../layers/VectorLayer'

/** Cubic-bezier circle approximation constant (~0.5523). */
const KAPPA = 0.5522847498307933

/**
 * Apply Figma-style uniform corner radius to an arbitrary path's anchors.
 *
 * For each anchor that's a sharp corner (no incoming OR outgoing handle),
 * we replace it with TWO anchors offset along the incoming/outgoing edges
 * by `radius`, with bezier handles forming a circular arc. Anchors that
 * already have handles (smoothed by the pen tool) are left untouched.
 *
 * `closed` mirrors the source path's flag — closed paths round the seam
 * vertex too; open paths leave the first/last anchors as corners since
 * they have no "previous" or "next" edge to offset along.
 *
 * Result is purely a function of (anchors, closed, radius) — calling it
 * twice with the same inputs produces the same output. This means the
 * caller can keep the user's original `baseAnchors` around and re-derive
 * the rounded `anchors` whenever the radius slider moves; sliding from
 * 0 → 20 → 5 → 0 always recovers exactly the original shape.
 */
export function roundPathCorners(
  anchors: BezierAnchor[],
  closed: boolean,
  radius: number,
): BezierAnchor[] {
  if (radius <= 0 || anchors.length < 3) {
    return anchors.map((a) => ({
      ...a,
      handleIn: a.handleIn ? { ...a.handleIn } : null,
      handleOut: a.handleOut ? { ...a.handleOut } : null,
    }))
  }
  const n = anchors.length
  const out: BezierAnchor[] = []
  for (let i = 0; i < n; i++) {
    const V = anchors[i]!
    const isSharp = !V.handleIn && !V.handleOut
    const hasPrev = closed || i > 0
    const hasNext = closed || i < n - 1
    if (!isSharp || !hasPrev || !hasNext) {
      out.push({
        ...V,
        handleIn: V.handleIn ? { ...V.handleIn } : null,
        handleOut: V.handleOut ? { ...V.handleOut } : null,
      })
      continue
    }
    const P = anchors[(i - 1 + n) % n]!
    const N = anchors[(i + 1) % n]!
    const inLen  = Math.hypot(V.x - P.x, V.y - P.y)
    const outLen = Math.hypot(N.x - V.x, N.y - V.y)
    const r = Math.min(radius, inLen / 2, outLen / 2)
    if (r <= 0.01) {
      out.push({ ...V, handleIn: null, handleOut: null, type: 'corner' })
      continue
    }
    const inUx = (P.x - V.x) / inLen, inUy = (P.y - V.y) / inLen
    const outUx = (N.x - V.x) / outLen, outUy = (N.y - V.y) / outLen
    const aStart = { x: V.x + inUx * r, y: V.y + inUy * r }
    const aEnd   = { x: V.x + outUx * r, y: V.y + outUy * r }
    // KAPPA approximates a quarter-circle bezier; for non-90° corners it
    // still produces a visually clean arc within ~0.6% radius error.
    out.push({
      x: aStart.x, y: aStart.y,
      handleIn: null,
      handleOut: { x: aStart.x - inUx * r * KAPPA, y: aStart.y - inUy * r * KAPPA },
      type: 'corner',
    })
    out.push({
      x: aEnd.x, y: aEnd.y,
      handleIn: { x: aEnd.x - outUx * r * KAPPA, y: aEnd.y - outUy * r * KAPPA },
      handleOut: null,
      type: 'corner',
    })
  }
  return out
}

/**
 * Regenerate the BezierAnchor[] for a VectorPath from its shape descriptor.
 *
 * This is the single source of truth for "what does a rect / ellipse /
 * polygon look like as a bezier path". The shape tool calls it when creating
 * a shape; the corner-radius drag and side-count stepper call it on every
 * change. The renderer never calls it — it always renders the cached
 * `anchors` directly. Cheap to run (O(sides) or O(4) per call).
 *
 * Coordinate convention: anchors are in LAYER-LOCAL coords (matching the
 * surrounding VectorPath data model).
 */
export function buildShapeAnchors(shape: VectorShape): BezierAnchor[] {
  switch (shape.kind) {
    case 'rect':    return buildRoundedRect(shape)
    case 'ellipse': return buildEllipse(shape)
    case 'polygon': return buildPolygon(shape)
  }
}

// ─── Rectangle (with optional per-corner radius) ──────────────────────────────

function buildRoundedRect(s: VectorShape): BezierAnchor[] {
  const x = s.x, y = s.y, w = s.width, h = s.height
  const maxR = Math.max(0, Math.min(w, h) / 2)
  const [r0, r1, r2, r3] = (s.cornerRadius ?? [0, 0, 0, 0]).map((r) => Math.max(0, Math.min(r, maxR))) as [number, number, number, number]

  // Corners (TL, TR, BR, BL). Each rounded corner emits ONE anchor at the
  // arc's midpoint with bezier handles approximating a quarter circle, OR
  // two corner anchors connected by a straight segment when radius is 0.
  //
  // We use the simpler "one anchor per corner at the radius midpoint" only
  // when r > 0; r=0 corners use a single sharp anchor at the corner vertex.
  //
  // For a uniform rectangle (all radii equal and > 0), the path is a
  // rounded rect; for mixed radii, each corner is handled independently and
  // the edges between them are straight.
  const anchors: BezierAnchor[] = []
  const addRoundedCorner = (cx: number, cy: number, r: number, quadrant: 0 | 1 | 2 | 3) => {
    if (r <= 0) {
      anchors.push({ x: cx, y: cy, handleIn: null, handleOut: null, type: 'corner' })
      return
    }
    // Quadrant 0 = TL, 1 = TR, 2 = BR, 3 = BL.
    // We add TWO anchors per rounded corner: arc start and arc end.
    // Arc start (along the previous edge) — no incoming handle, outgoing tangent into the arc.
    // Arc end   (along the next edge)    — incoming tangent out of the arc, no outgoing handle.
    const k = r * KAPPA
    let aStart: { x: number; y: number }, aEnd: { x: number; y: number }
    let outDelta: { x: number; y: number }, inDelta: { x: number; y: number }
    if (quadrant === 0) {       // TL: arc goes from x+r,y → x,y+r (curving over the corner)
      aStart = { x: cx + r, y: cy }
      aEnd   = { x: cx,     y: cy + r }
      outDelta = { x: -k, y: 0 }
      inDelta  = { x: 0, y: -k }
    } else if (quadrant === 1) { // TR: from x,y+r... wait re-derive in local center terms.
      // TR corner vertex is (cx, cy). Previous edge enters from (cx - r, cy); arc to (cx, cy + r).
      aStart = { x: cx - r, y: cy }
      aEnd   = { x: cx,     y: cy + r }
      outDelta = { x: k, y: 0 }
      inDelta  = { x: 0, y: -k }
    } else if (quadrant === 2) { // BR
      aStart = { x: cx,     y: cy - r }
      aEnd   = { x: cx - r, y: cy }
      outDelta = { x: 0, y: k }
      inDelta  = { x: k, y: 0 }
    } else {                     // BL
      // aStart sits ABOVE the BL corner on the left edge; its handleOut
      // must pull DOWN toward the corner (positive y), not up. Same logic
      // as the other quadrants — the handle deltas always point toward
      // the corner vertex. The previous (0, -k) flipped the BL handle
      // away from the corner, producing the misaligned "left side looks
      // weird" the user reported.
      aStart = { x: cx,     y: cy - r }
      aEnd   = { x: cx + r, y: cy }
      outDelta = { x: 0, y: k }
      inDelta  = { x: -k, y: 0 }
    }
    anchors.push({
      x: aStart.x, y: aStart.y,
      handleIn: null,
      handleOut: { x: aStart.x + outDelta.x, y: aStart.y + outDelta.y },
      type: 'corner',
    })
    anchors.push({
      x: aEnd.x, y: aEnd.y,
      handleIn: { x: aEnd.x + inDelta.x, y: aEnd.y + inDelta.y },
      handleOut: null,
      type: 'corner',
    })
  }

  // Corners in clockwise order: TL → TR → BR → BL
  addRoundedCorner(x,         y,         r0, 0)
  addRoundedCorner(x + w,     y,         r1, 1)
  addRoundedCorner(x + w,     y + h,     r2, 2)
  addRoundedCorner(x,         y + h,     r3, 3)
  return anchors
}

// ─── Ellipse ──────────────────────────────────────────────────────────────────

function buildEllipse(s: VectorShape): BezierAnchor[] {
  const cx = s.x + s.width / 2
  const cy = s.y + s.height / 2
  const rx = s.width / 2
  const ry = s.height / 2
  const kx = rx * KAPPA
  const ky = ry * KAPPA
  // Four anchors at cardinal points with symmetric tangent handles forming
  // the classic 4-arc bezier ellipse approximation.
  return [
    { x: cx,      y: cy - ry, handleIn: { x: cx - kx, y: cy - ry }, handleOut: { x: cx + kx, y: cy - ry }, type: 'smooth' },
    { x: cx + rx, y: cy,      handleIn: { x: cx + rx, y: cy - ky }, handleOut: { x: cx + rx, y: cy + ky }, type: 'smooth' },
    { x: cx,      y: cy + ry, handleIn: { x: cx + kx, y: cy + ry }, handleOut: { x: cx - kx, y: cy + ry }, type: 'smooth' },
    { x: cx - rx, y: cy,      handleIn: { x: cx - rx, y: cy + ky }, handleOut: { x: cx - rx, y: cy - ky }, type: 'smooth' },
  ]
}

// ─── Regular polygon (N sides) ───────────────────────────────────────────────

function buildPolygon(s: VectorShape): BezierAnchor[] {
  const n = Math.max(3, s.sides ?? 3)
  const cx = s.x + s.width / 2
  const cy = s.y + s.height / 2
  const rx = s.width / 2
  const ry = s.height / 2
  const rot = (s.rotation ?? 0) - Math.PI / 2 // start at top
  // Vertices around the bounding ellipse.
  const verts: { x: number; y: number }[] = []
  for (let i = 0; i < n; i++) {
    const t = rot + (i / n) * Math.PI * 2
    verts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry })
  }

  // Polygon corner radius — uniform across all vertices. We reuse
  // cornerRadius[0] when present (rectangles use all 4; polygons collapse
  // to a single value). 0 / undefined → sharp corners (legacy behavior).
  const radius = Math.max(0, s.cornerRadius?.[0] ?? 0)
  if (radius <= 0) {
    return verts.map((v) => ({ x: v.x, y: v.y, handleIn: null, handleOut: null, type: 'corner' as const }))
  }

  // Rounded polygon: each vertex V becomes two anchors offset along its
  // incoming/outgoing edges by `r`, with bezier handles forming a circular
  // arc at the corner. r is clamped to half the shorter adjacent edge so
  // adjacent rounds never overlap.
  const out: BezierAnchor[] = []
  for (let i = 0; i < n; i++) {
    const V = verts[i]!
    const P = verts[(i - 1 + n) % n]!
    const N = verts[(i + 1) % n]!
    const inLen  = Math.hypot(V.x - P.x, V.y - P.y)
    const outLen = Math.hypot(N.x - V.x, N.y - V.y)
    const r = Math.min(radius, inLen / 2, outLen / 2)
    if (r <= 0.01) {
      out.push({ x: V.x, y: V.y, handleIn: null, handleOut: null, type: 'corner' })
      continue
    }
    // Unit vectors from V toward P and N.
    const inUx = (P.x - V.x) / inLen, inUy = (P.y - V.y) / inLen
    const outUx = (N.x - V.x) / outLen, outUy = (N.y - V.y) / outLen
    const aStart = { x: V.x + inUx * r,  y: V.y + inUy * r }    // step back along incoming edge
    const aEnd   = { x: V.x + outUx * r, y: V.y + outUy * r }   // step forward along outgoing edge
    // Bezier handles approximate a circular arc — pull each anchor's handle
    // toward V by r*KAPPA which is the classic 1/4-circle approximation.
    out.push({
      x: aStart.x, y: aStart.y,
      handleIn: null,
      handleOut: { x: aStart.x - inUx * r * KAPPA, y: aStart.y - inUy * r * KAPPA },
      type: 'corner',
    })
    out.push({
      x: aEnd.x, y: aEnd.y,
      handleIn: { x: aEnd.x - outUx * r * KAPPA, y: aEnd.y - outUy * r * KAPPA },
      handleOut: null,
      type: 'corner',
    })
  }
  return out
}
