import type { VectorLayer, BezierAnchor } from '../layers/VectorLayer'

/**
 * Vector-layer "smart" bucket fill.
 *
 * Problem: a VectorLayer holds independent strokes/paths. Even when several
 * strokes visually enclose a region, no single closed path contains the click
 * point — so the naive point-in-polygon fill misses it.
 *
 * Solution: rasterize the layer to a binary mask, optionally morphologically
 * dilate to close hairline gaps (Blender-style `gap` setting), flood-fill
 * from the click in the negative space, erode the filled region back, trace
 * its boundary with marching squares, simplify with Ramer–Douglas–Peucker,
 * and return the polygon as `BezierAnchor[]` (corner type, no handles) ready
 * to be inserted as a new closed `VectorPath` on the layer.
 *
 * Output coordinates are in layer-local space (i.e. matching the layer's
 * strokes/paths/anchors), independent of the temporary mask resolution.
 *
 * Returns null when:
 *   - the layer has no ink
 *   - the click point is on top of inked pixels (no region to fill)
 *   - the flood fill reaches the bitmap edge (open region; would fill forever)
 *   - the traced polygon has fewer than 3 points
 */
export function vectorRegionFill(
  layer: VectorLayer,
  clickX: number,
  clickY: number,
  options: {
    /** Extra pixels around the inked bounding box, in layer-local px. Default 64. */
    padding?: number
    /** Mask resolution cap on the longest side. Default 2048. */
    maxResolution?: number
    /** Gap-close radius in layer-local pixels. Strokes within 2*gap close together. */
    gap?: number
    /** Polygon simplification tolerance in layer-local pixels. Default 1.5. */
    simplifyTolerance?: number
  } = {},
): BezierAnchor[] | null {
  if (typeof document === 'undefined') return null
  if (layer.strokes.length === 0 && layer.paths.length === 0) return null

  const padding = options.padding ?? 64
  const maxRes = options.maxResolution ?? 2048
  const gap = Math.max(0, options.gap ?? 0)
  const simplifyTolerance = options.simplifyTolerance ?? 1.5

  // 1. Determine the working bounding box (layer-local), expanded by gap+padding.
  const bbox = computeInkBounds(layer)
  if (!bbox) return null

  // Click must be near the inked area for fill to make sense.
  const slack = padding + gap + 4
  if (clickX < bbox.minX - slack || clickX > bbox.maxX + slack ||
      clickY < bbox.minY - slack || clickY > bbox.maxY + slack) return null

  const expand = padding + gap
  const wx0 = Math.floor(bbox.minX - expand)
  const wy0 = Math.floor(bbox.minY - expand)
  const wx1 = Math.ceil(bbox.maxX + expand)
  const wy1 = Math.ceil(bbox.maxY + expand)
  const ww = wx1 - wx0, wh = wy1 - wy0
  if (ww <= 0 || wh <= 0) return null

  // 2. Pick a resolution that keeps the longest side ≤ maxRes.
  const scale = Math.min(1, maxRes / Math.max(ww, wh))
  const W = Math.max(8, Math.round(ww * scale))
  const H = Math.max(8, Math.round(wh * scale))

  // 3. Rasterize the layer into a binary alpha mask.
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Map layer-local (lx,ly) → mask px: (lx - wx0) * scale
  ctx.scale(scale, scale)
  ctx.translate(-wx0, -wy0)
  // Layer.render uses its own transform; we apply none here. Layer.render currently
  // ignores camera and uses transform.applyToContext. transform.x/y is preserved.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer.render(ctx, null as any)

  const imageData = ctx.getImageData(0, 0, W, H)
  const inkMask = alphaToBinary(imageData.data, W, H)

  // 4. Gap-close: dilate ink (set pixel if any neighbor within gap is set).
  //    Then we'll erode the FILLED region by gap pixels at the end so we
  //    don't visibly inflate strokes.
  const gapPx = Math.round(gap * scale)
  const wallMask = gapPx > 0 ? morphDilate(inkMask, W, H, gapPx) : inkMask

  // 5. Convert click to mask coordinates.
  const cx = Math.round((clickX - wx0) * scale)
  const cy = Math.round((clickY - wy0) * scale)
  if (cx < 0 || cx >= W || cy < 0 || cy >= H) return null
  if (wallMask[cy * W + cx]) return null // clicked on (closed) ink

  // 6. Flood-fill into the negative space. Bail out if it touches the bitmap
  //    edge — that means the region is open (would "leak" infinitely).
  const filled = floodFillBoundedRegion(wallMask, W, H, cx, cy)
  if (!filled) return null

  // 7. Erode the filled region back by the same gap so the visible polygon
  //    snaps tight to the strokes rather than the dilated mask.
  const tightFilled = gapPx > 0 ? morphErode(filled, W, H, gapPx) : filled

  // 8. Trace the polygon boundary with marching squares.
  const contour = traceBoundary(tightFilled, W, H)
  if (contour.length < 4) return null

  // 9. Simplify with Ramer–Douglas–Peucker (in mask-px), then map back to
  //    layer-local coordinates.
  const simplified = simplifyRDP(contour, Math.max(0.5, simplifyTolerance * scale))
  if (simplified.length < 3) return null

  return simplified.map<BezierAnchor>(({ x, y }) => ({
    x: x / scale + wx0,
    y: y / scale + wy0,
    handleIn: null,
    handleOut: null,
    type: 'corner',
  }))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeInkBounds(layer: VectorLayer): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const s of layer.strokes) {
    const r = s.lineWidth / 2
    for (const p of s.points) {
      if (p.x - r < minX) minX = p.x - r
      if (p.y - r < minY) minY = p.y - r
      if (p.x + r > maxX) maxX = p.x + r
      if (p.y + r > maxY) maxY = p.y + r
    }
  }
  for (const p of layer.paths) {
    const r = p.strokeWidth / 2
    for (const a of p.anchors) {
      if (a.x - r < minX) minX = a.x - r
      if (a.y - r < minY) minY = a.y - r
      if (a.x + r > maxX) maxX = a.x + r
      if (a.y + r > maxY) maxY = a.y + r
    }
  }
  if (minX === Infinity) return null
  return { minX, minY, maxX, maxY }
}

/** Binary mask of ink presence (alpha > 16). */
function alphaToBinary(rgba: Uint8ClampedArray, W: number, H: number): Uint8Array {
  const mask = new Uint8Array(W * H)
  for (let i = 0; i < mask.length; i++) {
    if (rgba[i * 4 + 3]! > 16) mask[i] = 1
  }
  return mask
}

/**
 * Morphological dilation by `radius` using separable max-filter passes
 * (horizontal then vertical). The neighborhood is a square (Chebyshev) — a
 * close-enough proxy for circular dilation given typical small gap values.
 */
function morphDilate(src: Uint8Array, W: number, H: number, radius: number): Uint8Array {
  if (radius <= 0) return src
  const a = maxRows(src, W, H, radius)
  return maxCols(a, W, H, radius)
}

/** Morphological erosion = dilation of the complement. */
function morphErode(src: Uint8Array, W: number, H: number, radius: number): Uint8Array {
  if (radius <= 0) return src
  const inv = new Uint8Array(src.length)
  for (let i = 0; i < src.length; i++) inv[i] = src[i] ? 0 : 1
  const dilatedInv = morphDilate(inv, W, H, radius)
  const out = new Uint8Array(src.length)
  for (let i = 0; i < src.length; i++) out[i] = dilatedInv[i] ? 0 : 1
  return out
}

function maxRows(src: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const dst = new Uint8Array(src.length)
  for (let y = 0; y < H; y++) {
    const row = y * W
    for (let x = 0; x < W; x++) {
      const lo = Math.max(0, x - r)
      const hi = Math.min(W - 1, x + r)
      let v = 0
      for (let k = lo; k <= hi; k++) {
        if (src[row + k]) { v = 1; break }
      }
      dst[row + x] = v
    }
  }
  return dst
}

function maxCols(src: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const dst = new Uint8Array(src.length)
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const lo = Math.max(0, y - r)
      const hi = Math.min(H - 1, y + r)
      let v = 0
      for (let k = lo; k <= hi; k++) {
        if (src[k * W + x]) { v = 1; break }
      }
      dst[y * W + x] = v
    }
  }
  return dst
}

/**
 * Scanline flood-fill into negative-space (wall = 1, empty = 0).
 * Aborts and returns null if the region touches the bitmap edge — that's
 * the user's gap setting being too small for an open region.
 */
function floodFillBoundedRegion(wall: Uint8Array, W: number, H: number, sx: number, sy: number): Uint8Array | null {
  const filled = new Uint8Array(W * H)
  const stack: number[] = [sx, sy]
  while (stack.length) {
    const y = stack.pop()!
    const x = stack.pop()!
    if (x < 0 || x >= W || y < 0 || y >= H) continue
    if (filled[y * W + x] || wall[y * W + x]) continue
    let lx = x
    while (lx > 0 && !wall[y * W + (lx - 1)] && !filled[y * W + (lx - 1)]) lx--
    let rx = x
    while (rx < W - 1 && !wall[y * W + (rx + 1)] && !filled[y * W + (rx + 1)]) rx++

    // If we touched the bitmap edge, the region is open — abort.
    if (lx === 0 || rx === W - 1) return null
    if (y === 0 || y === H - 1) return null

    for (let cx = lx; cx <= rx; cx++) {
      filled[y * W + cx] = 1
      if (y > 0     && !wall[(y - 1) * W + cx] && !filled[(y - 1) * W + cx]) stack.push(cx, y - 1)
      if (y < H - 1 && !wall[(y + 1) * W + cx] && !filled[(y + 1) * W + cx]) stack.push(cx, y + 1)
    }
  }
  return filled
}

/**
 * Trace the outer boundary of a binary region using Moore-neighbor tracing.
 * Returns the boundary polygon (pixel-centered points) in order.
 *
 * Marching squares is the textbook alternative; Moore tracing is simpler and
 * gives us a single closed loop that we can immediately RDP-simplify.
 */
function traceBoundary(mask: Uint8Array, W: number, H: number): Array<{ x: number; y: number }> {
  // Find a starting pixel — leftmost-then-topmost set cell.
  let sx = -1, sy = -1
  outer: for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x]) { sx = x; sy = y; break outer }
    }
  }
  if (sx === -1) return []

  // Moore neighborhood offsets, clockwise starting at "west" (so we begin
  // searching from outside-coming-back-in for left-edge starts).
  const dx = [-1, -1, 0, 1, 1, 1, 0, -1]
  const dy = [ 0, -1, -1, -1, 0, 1, 1, 1]

  const contour: Array<{ x: number; y: number }> = []
  let cx = sx, cy = sy
  // backtrack direction = "came from the west"
  let backDir = 0
  const MAX_STEPS = W * H * 4
  let steps = 0

  do {
    contour.push({ x: cx, y: cy })
    // Search neighbors starting one step CCW from backDir
    let found = false
    for (let i = 1; i <= 8; i++) {
      const d = (backDir + i) & 7
      const nx = cx + dx[d]!, ny = cy + dy[d]!
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && mask[ny * W + nx]) {
        // backtrack direction for the next step is "where we came from"
        backDir = (d + 4) & 7
        cx = nx; cy = ny
        found = true
        break
      }
    }
    if (!found) break // isolated pixel
    steps++
  } while (!(cx === sx && cy === sy) && steps < MAX_STEPS)

  return contour
}

/**
 * Ramer–Douglas–Peucker polyline simplification.
 * Closed-polygon-aware: splits at the two extreme points so the algorithm
 * doesn't trivially keep only the start and end.
 */
function simplifyRDP(points: Array<{ x: number; y: number }>, epsilon: number): Array<{ x: number; y: number }> {
  if (points.length < 4) return points
  // For a closed polygon, split at the two most distant points to seed.
  let iMax = 0, jMax = 0, dMax = -1
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i]!.x - points[j]!.x
      const dy = points[i]!.y - points[j]!.y
      const d = dx * dx + dy * dy
      if (d > dMax) { dMax = d; iMax = i; jMax = j }
    }
    // Quadratic; bail at ~512 points for safety. RDP itself handles longer.
    if (points.length > 512) break
  }
  const a = rdpSegment(points.slice(iMax, jMax + 1), epsilon)
  const b = rdpSegment(points.slice(jMax).concat(points.slice(0, iMax + 1)), epsilon)
  // Drop the duplicate shared endpoints
  return a.slice(0, -1).concat(b.slice(0, -1))
}

function rdpSegment(pts: Array<{ x: number; y: number }>, epsilon: number): Array<{ x: number; y: number }> {
  if (pts.length < 3) return pts.slice()
  let maxDist = 0, idx = 0
  const a = pts[0]!, b = pts[pts.length - 1]!
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDistance(pts[i]!, a, b)
    if (d > maxDist) { maxDist = d; idx = i }
  }
  if (maxDist > epsilon) {
    const left = rdpSegment(pts.slice(0, idx + 1), epsilon)
    const right = rdpSegment(pts.slice(idx), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [a, b]
}

function perpDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) {
    const ex = p.x - a.x, ey = p.y - a.y
    return Math.sqrt(ex * ex + ey * ey)
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  const px = a.x + t * dx, py = a.y + t * dy
  const ex = p.x - px, ey = p.y - py
  return Math.sqrt(ex * ex + ey * ey)
}
