import type {
  VectorStroke, VectorStrokePoint, VectorPath, BezierAnchor,
} from '../layers/VectorLayer'

/**
 * Predicate that returns true when a point is "covered" by the operator
 * (eraser disk, lasso polygon, etc.) and should be removed.
 */
export type CoveragePredicate = (x: number, y: number) => boolean

// ─── Stroke splitting ────────────────────────────────────────────────────────

/**
 * Walk the stroke's points and split it at every contiguous run of covered
 * samples. Returns an array of sub-strokes (each one or more outside-points).
 * Single-point runs are dropped — a stroke needs at least two points to be
 * renderable. If `keepInsidePoints` is provided, the points removed from each
 * gap are collected into a sibling list (mirror-image of the kept set), used
 * by the lasso "select inside" path.
 */
export function splitStrokePoints(
  points: VectorStrokePoint[],
  isCovered: CoveragePredicate,
  keepInsidePoints?: { out: VectorStrokePoint[][] },
): VectorStrokePoint[][] {
  const outside: VectorStrokePoint[][] = []
  const inside: VectorStrokePoint[][] = []
  let curOut: VectorStrokePoint[] = []
  let curIn: VectorStrokePoint[] = []
  for (const p of points) {
    if (isCovered(p.x, p.y)) {
      if (curOut.length) { outside.push(curOut); curOut = [] }
      curIn.push(p)
    } else {
      if (curIn.length) { inside.push(curIn); curIn = [] }
      curOut.push(p)
    }
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
 * `density` controls samples per segment — higher = more accurate cuts but
 * more anchors. Default 24 matches our hit-test density (20) with overhead.
 */
export function splitPathAnchors(
  anchors: BezierAnchor[],
  closed: boolean,
  isCovered: CoveragePredicate,
  density = 24,
  keepInsideAnchors?: { out: BezierAnchor[][] },
): BezierAnchor[][] {
  if (anchors.length < 2) {
    if (anchors.length === 1) {
      const a = anchors[0]!
      return isCovered(a.x, a.y) ? [] : [[a]]
    }
    return []
  }

  // Flatten to (x, y) samples first; track segment boundaries so we can
  // re-emit anchors at the sample positions (corner type). For each segment
  // from anchor i-1 → i, we sample at j/density for j = 0..density.
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

  // Group samples into runs of NOT-covered. Each run becomes a polyline path.
  const outsideRuns: Sample[][] = []
  const insideRuns: Sample[][] = []
  let curOut: Sample[] = []
  let curIn: Sample[] = []
  for (const s of samples) {
    if (isCovered(s.x, s.y)) {
      if (curOut.length) { outsideRuns.push(curOut); curOut = [] }
      curIn.push(s)
    } else {
      if (curIn.length) { insideRuns.push(curIn); curIn = [] }
      curOut.push(s)
    }
  }
  if (curOut.length) outsideRuns.push(curOut)
  if (curIn.length) insideRuns.push(curIn)

  const toAnchors = (run: Sample[]): BezierAnchor[] => {
    // Drop overly-dense runs by keeping at most ~density/2 anchors per
    // original segment — avoids blowing up node count on big paths.
    const stride = Math.max(1, Math.floor(density / 4))
    const result: BezierAnchor[] = []
    for (let i = 0; i < run.length; i += stride) {
      const s = run[i]!
      result.push({ x: s.x, y: s.y, handleIn: null, handleOut: null, type: 'corner' })
    }
    // Always include the last sample so we don't lose the run's end.
    const last = run[run.length - 1]!
    if (result.length === 0 || result[result.length - 1]!.x !== last.x || result[result.length - 1]!.y !== last.y) {
      result.push({ x: last.x, y: last.y, handleIn: null, handleOut: null, type: 'corner' })
    }
    return result
  }

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
  // Quick reject: sample only anchors as a cheap pre-test. False negatives
  // (curve dips into coverage between anchors) get caught by the full sample
  // pass — which still runs after this test passes. False positives are fine
  // (we just do extra work; result is correct).
  let any = false
  for (const a of path.anchors) { if (isCovered(a.x, a.y)) { any = true; break } }
  if (!any) {
    // Anchors are all outside. Curve might still cross; do the full pass.
    const insideBucket: { out: BezierAnchor[][] } = { out: [] }
    const keep = splitPathAnchors(path.anchors, path.closed, isCovered, 24, insideBucket)
    if (insideBucket.out.length === 0 && keep.length === 0) return null
    if (insideBucket.out.length === 0 && keep.length === 1 && keep[0]!.length === path.anchors.length) return null
    return { keep, cut: insideBucket.out, changed: insideBucket.out.length > 0 }
  }
  const insideBucket: { out: BezierAnchor[][] } = { out: [] }
  const keep = splitPathAnchors(path.anchors, path.closed, isCovered, 24, insideBucket)
  return { keep, cut: insideBucket.out, changed: true }
}
