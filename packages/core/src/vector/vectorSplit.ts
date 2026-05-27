import type {
  VectorStroke, VectorStrokePoint, VectorPath, BezierAnchor,
} from '../layers/VectorLayer'

/**
 * Predicate that returns true when a point is "covered" by the operator
 * (eraser disk, lasso polygon, etc.) and should be removed.
 */
export type CoveragePredicate = (x: number, y: number) => boolean

/**
 * Binary-search the exact crossing point on the line segment from `from`
 * (outside coverage) to `to` (inside coverage), so we can drop a synthetic
 * point AT the eraser/lasso boundary. Without this, the cut happens at the
 * last fully-outside sample which can be a noticeable fraction of the
 * segment away from the actual disk edge — looking like "too much was
 * erased".
 *
 * `iters = 6` gives 1/64 = ~1.5% of segment-length precision which is well
 * below stroke thickness for typical brush sizes. Cheap and good enough.
 */
function findBoundary(
  from: { x: number; y: number },
  to: { x: number; y: number },
  isCovered: CoveragePredicate,
  iters = 6,
): { x: number; y: number; t: number } {
  // Invariant: isCovered(from) === false, isCovered(to) === true.
  let lo = 0, hi = 1
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2
    const mx = from.x + (to.x - from.x) * mid
    const my = from.y + (to.y - from.y) * mid
    if (isCovered(mx, my)) hi = mid
    else lo = mid
  }
  const t = (lo + hi) / 2
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, t }
}

// ─── Stroke splitting ────────────────────────────────────────────────────────

/**
 * Walk the stroke's points and split it at every contiguous run of covered
 * samples. Returns an array of sub-strokes (each two or more outside-points).
 *
 * Transitions are interpolated: when we cross from outside→inside we drop a
 * synthetic point on the boundary as the LAST point of the kept run; when we
 * cross from inside→outside we drop a synthetic boundary point as the FIRST
 * point of the new run. This makes the cut land at the eraser edge rather
 * than at the previous stored sample — the stroke ends right at the disk
 * boundary, simulating a clean knife cut.
 *
 * If `keepInsidePoints` is provided, the points removed from each gap are
 * collected into a sibling list (mirror-image of the kept set), used by the
 * lasso "select inside" path. Inside runs also get boundary interpolation
 * so the lifted selection lines up with the kept piece exactly.
 */
export function splitStrokePoints(
  points: VectorStrokePoint[],
  isCovered: CoveragePredicate,
  keepInsidePoints?: { out: VectorStrokePoint[][] },
): VectorStrokePoint[][] {
  if (points.length === 0) return []
  const lerpPoint = (a: VectorStrokePoint, b: VectorStrokePoint, t: number): VectorStrokePoint => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    pressure: a.pressure + (b.pressure - a.pressure) * t,
  })

  const outside: VectorStrokePoint[][] = []
  const inside: VectorStrokePoint[][] = []
  let curOut: VectorStrokePoint[] = []
  let curIn: VectorStrokePoint[] = []

  let prev = points[0]!
  let prevCovered = isCovered(prev.x, prev.y)
  if (prevCovered) curIn.push(prev)
  else curOut.push(prev)

  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    const cov = isCovered(p.x, p.y)
    if (cov === prevCovered) {
      if (cov) curIn.push(p)
      else curOut.push(p)
    } else if (cov) {
      // outside → inside: close out the kept run with a boundary point
      const b = findBoundary(prev, p, isCovered)
      const bPoint = lerpPoint(prev, p, b.t)
      curOut.push(bPoint)
      outside.push(curOut)
      curOut = []
      // start the inside run AT the boundary too, so the lasso lift has
      // the same edge as the kept piece.
      curIn.push(bPoint)
      curIn.push(p)
    } else {
      // inside → outside: close out the inside run with a boundary point
      const b = findBoundary(p, prev, isCovered)
      // b is parametrised from p (outside) toward prev (inside) — flip:
      // actual crossing from inside→outside corresponds to (1 - b.t) from
      // prev toward p. Re-derive using lerpPoint on the inside→outside leg.
      const bPoint = lerpPoint(prev, p, 1 - b.t)
      curIn.push(bPoint)
      inside.push(curIn)
      curIn = []
      curOut.push(bPoint)
      curOut.push(p)
    }
    prev = p
    prevCovered = cov
  }
  if (curOut.length) outside.push(curOut)
  if (curIn.length) inside.push(curIn)
  if (keepInsidePoints) keepInsidePoints.out = inside.filter((g) => g.length >= 2)
  return outside.filter((g) => g.length >= 2)
}

// ─── Path splitting ──────────────────────────────────────────────────────────

/**
 * Sample bezier curves at fixed density and split the path wherever samples
 * fall inside `isCovered`. Returns the array of new sub-path anchor lists.
 * The original closed flag is lost (split paths are always open). Bezier
 * smoothness is lost at split points (new anchors are corners).
 *
 * Like stroke splitting, transitions are boundary-interpolated so the cut
 * lands at the eraser edge — not at the last fully-outside sample. With
 * default density=32 + boundary interpolation, the visual cut is sharp
 * even on long bezier segments.
 *
 * `density` controls samples per segment — higher = more accurate cuts but
 * more anchors. Default 32 balances fidelity against anchor count.
 */
export function splitPathAnchors(
  anchors: BezierAnchor[],
  closed: boolean,
  isCovered: CoveragePredicate,
  density = 32,
  keepInsideAnchors?: { out: BezierAnchor[][] },
): BezierAnchor[][] {
  if (anchors.length < 2) {
    if (anchors.length === 1) {
      const a = anchors[0]!
      return isCovered(a.x, a.y) ? [] : [[a]]
    }
    return []
  }

  // Flatten to (x, y) samples first. Each segment from anchor i-1 → i is
  // sampled at j/density for j = 0..density.
  type Sample = { x: number; y: number }
  const samples: Sample[] = []
  const pushBezierSamples = (prev: BezierAnchor, curr: BezierAnchor, includeStart: boolean) => {
    const cp1 = prev.handleOut ?? { x: prev.x, y: prev.y }
    const cp2 = curr.handleIn ?? { x: curr.x, y: curr.y }
    const start = includeStart ? 0 : 1
    for (let j = start; j <= density; j++) {
      const t = j / density
      const mt = 1 - t
      samples.push({
        x: mt*mt*mt*prev.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*curr.x,
        y: mt*mt*mt*prev.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*curr.y,
      })
    }
  }
  for (let i = 1; i < anchors.length; i++) {
    pushBezierSamples(anchors[i - 1]!, anchors[i]!, i === 1)
  }
  if (closed && anchors.length >= 2) {
    pushBezierSamples(anchors[anchors.length - 1]!, anchors[0]!, false)
  }

  // Walk samples with boundary interpolation at each transition (same
  // pattern as splitStrokePoints).
  const outsideRuns: Sample[][] = []
  const insideRuns: Sample[][] = []
  let curOut: Sample[] = []
  let curIn: Sample[] = []

  let prev = samples[0]!
  let prevCovered = isCovered(prev.x, prev.y)
  if (prevCovered) curIn.push(prev)
  else curOut.push(prev)

  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!
    const cov = isCovered(s.x, s.y)
    if (cov === prevCovered) {
      if (cov) curIn.push(s)
      else curOut.push(s)
    } else if (cov) {
      const b = findBoundary(prev, s, isCovered)
      const bPoint = { x: prev.x + (s.x - prev.x) * b.t, y: prev.y + (s.y - prev.y) * b.t }
      curOut.push(bPoint)
      outsideRuns.push(curOut); curOut = []
      curIn.push(bPoint); curIn.push(s)
    } else {
      const b = findBoundary(s, prev, isCovered)
      const tBack = 1 - b.t
      const bPoint = { x: prev.x + (s.x - prev.x) * tBack, y: prev.y + (s.y - prev.y) * tBack }
      curIn.push(bPoint)
      insideRuns.push(curIn); curIn = []
      curOut.push(bPoint); curOut.push(s)
    }
    prev = s
    prevCovered = cov
  }
  if (curOut.length) outsideRuns.push(curOut)
  if (curIn.length) insideRuns.push(curIn)

  // Convert a sample run to anchor list. We keep ALL samples so the shape of
  // the curve survives the cut faithfully — no decimation. Callers that want
  // a sparser representation can simplify afterwards via Ramer-Douglas-Peucker.
  // (Previously a stride=density/4 was used; that was the visible "chunk
  // missing" feel the user reported on long segments.)
  const toAnchors = (run: Sample[]): BezierAnchor[] =>
    run.map((s) => ({ x: s.x, y: s.y, handleIn: null, handleOut: null, type: 'corner' as const }))

  if (keepInsideAnchors) {
    keepInsideAnchors.out = insideRuns.filter((r) => r.length >= 2).map(toAnchors)
  }
  return outsideRuns.filter((r) => r.length >= 2).map(toAnchors)
}

// ─── Helpers — coverage predicate factories ──────────────────────────────────

/** Predicate: inside a circular disk centered at (cx, cy) with radius r. */
export function diskCoverage(cx: number, cy: number, r: number): CoveragePredicate {
  const r2 = r * r
  return (x, y) => {
    const dx = x - cx, dy = y - cy
    return dx * dx + dy * dy <= r2
  }
}

/**
 * Predicate: inside a polygon (raycast). `poly` is a flat list of {x,y}
 * vertices defining a single non-self-intersecting outline.
 */
export function polygonCoverage(poly: ReadonlyArray<{ x: number; y: number }>): CoveragePredicate {
  return (x, y) => {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i]!.x, yi = poly[i]!.y
      const xj = poly[j]!.x, yj = poly[j]!.y
      if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
        inside = !inside
      }
    }
    return inside
  }
}

// ─── High-level operators ────────────────────────────────────────────────────

/**
 * Apply a coverage predicate to a VectorStroke. Returns `null` when nothing
 * was covered (caller should leave the stroke untouched), or an object with:
 *   - `keep`: the parameters needed to create replacement strokes for the
 *     parts OUTSIDE coverage. May be empty when the whole stroke was inside.
 *   - `cut`: same but for parts INSIDE — used by lasso "lift selection".
 */
export interface SplitResult<TPoints> {
  keep: TPoints[]
  cut: TPoints[]
  /** True if at least one point was inside coverage (split actually happened). */
  changed: boolean
}

export function splitStroke(stroke: VectorStroke, isCovered: CoveragePredicate): SplitResult<VectorStrokePoint[]> | null {
  // Quick reject: scan ahead; if none of the points are covered, nothing changed.
  let any = false
  for (const p of stroke.points) { if (isCovered(p.x, p.y)) { any = true; break } }
  if (!any) return null
  const insideBucket: { out: VectorStrokePoint[][] } = { out: [] }
  const keep = splitStrokePoints(stroke.points, isCovered, insideBucket)
  return { keep, cut: insideBucket.out, changed: true }
}

export function splitPath(path: VectorPath, isCovered: CoveragePredicate): SplitResult<BezierAnchor[]> | null {
  // Anchor pre-test is a fast reject for cases where neither the anchors
  // nor the curve cross coverage. If anchors miss but the curve might still
  // cross (e.g. a long bezier dipping into the disk between two anchors),
  // we do the full pass and detect coverage from samples.
  let anyAnchor = false
  for (const a of path.anchors) { if (isCovered(a.x, a.y)) { anyAnchor = true; break } }
  const insideBucket: { out: BezierAnchor[][] } = { out: [] }
  const keep = splitPathAnchors(path.anchors, path.closed, isCovered, 32, insideBucket)
  if (!anyAnchor && insideBucket.out.length === 0) return null
  // changed = at least one cut happened OR no kept run preserves the original shape
  const changed = insideBucket.out.length > 0 || keep.length !== 1 || keep[0]!.length !== path.anchors.length
  return { keep, cut: insideBucket.out, changed }
}
