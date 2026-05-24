import { Tool } from './Tool'
import type { PointerData } from '../types'
import { RasterLayer } from '../layers/RasterLayer'
import { VectorLayer } from '../layers/VectorLayer'
import type { VectorPath } from '../layers/VectorLayer'
import { rasterizeLayer } from '../renderer/rasterizeLayer'
import { vectorRegionFill } from '../fill/vectorRegionFill'

export type FillPlacement = 'front' | 'back'

export interface FillSettings {
  color: string        // hex, e.g. '#ff0000'
  tolerance: number    // 0–255 per channel (raster flood)
  placement: FillPlacement  // vector only: add fill in front or behind stroke
  /**
   * Blender-style max-gap closure for vector fills, in layer-local pixels.
   * Strokes within ~2*gap of each other will be treated as connected during
   * region detection. 0 = strict (only fully-closed loops fill).
   */
  gapClose: number
}

// ── Flood fill helpers (declared before class so DTS rollup can see them) ────────

function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillR: number,
  fillG: number,
  fillB: number,
  fillA: number,
  tolerance: number,
): void {
  const getIdx = (x: number, y: number) => (y * width + x) * 4
  const si = getIdx(startX, startY)
  const tR = data[si]!, tG = data[si + 1]!, tB = data[si + 2]!, tA = data[si + 3]!

  if (tR === fillR && tG === fillG && tB === fillB && tA === fillA) return

  const match = (x: number, y: number): boolean => {
    const i = getIdx(x, y)
    return (
      Math.abs(data[i]!     - tR) <= tolerance &&
      Math.abs(data[i + 1]! - tG) <= tolerance &&
      Math.abs(data[i + 2]! - tB) <= tolerance &&
      Math.abs(data[i + 3]! - tA) <= tolerance
    )
  }

  const visited = new Uint8Array(width * height)
  const stack: number[] = [startX, startY]

  while (stack.length) {
    const y = stack.pop()!
    const x = stack.pop()!
    if (x < 0 || x >= width || y < 0 || y >= height) continue
    if (visited[y * width + x]) continue
    if (!match(x, y)) continue

    let lx = x
    while (lx > 0 && !visited[y * width + (lx - 1)] && match(lx - 1, y)) lx--
    let rx = x
    while (rx < width - 1 && !visited[y * width + (rx + 1)] && match(rx + 1, y)) rx++

    for (let cx = lx; cx <= rx; cx++) {
      const ci = getIdx(cx, y)
      data[ci] = fillR; data[ci + 1] = fillG; data[ci + 2] = fillB; data[ci + 3] = fillA
      visited[y * width + cx] = 1
      if (y > 0          && !visited[(y - 1) * width + cx] && match(cx, y - 1)) stack.push(cx, y - 1)
      if (y < height - 1 && !visited[(y + 1) * width + cx] && match(cx, y + 1)) stack.push(cx, y + 1)
    }
  }
}

// Reference-aware fill: uses reference alpha as walls; fills active layer in enclosed region.
function floodFillWithRef(
  activeData: Uint8ClampedArray,
  refData: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillR: number,
  fillG: number,
  fillB: number,
  fillA: number,
  tolerance: number,
): void {
  const getIdx = (x: number, y: number) => (y * width + x) * 4
  const isWall = (x: number, y: number): boolean => refData[getIdx(x, y) + 3]! > tolerance
  if (isWall(startX, startY)) return

  const visited = new Uint8Array(width * height)
  const stack: number[] = [startX, startY]

  while (stack.length) {
    const y = stack.pop()!
    const x = stack.pop()!
    if (x < 0 || x >= width || y < 0 || y >= height) continue
    if (visited[y * width + x]) continue
    if (isWall(x, y)) continue

    let lx = x
    while (lx > 0 && !visited[y * width + (lx - 1)] && !isWall(lx - 1, y)) lx--
    let rx = x
    while (rx < width - 1 && !visited[y * width + (rx + 1)] && !isWall(rx + 1, y)) rx++

    for (let cx = lx; cx <= rx; cx++) {
      const ci = getIdx(cx, y)
      activeData[ci] = fillR; activeData[ci + 1] = fillG; activeData[ci + 2] = fillB; activeData[ci + 3] = fillA
      visited[y * width + cx] = 1
      if (y > 0          && !visited[(y - 1) * width + cx] && !isWall(cx, y - 1)) stack.push(cx, y - 1)
      if (y < height - 1 && !visited[(y + 1) * width + cx] && !isWall(cx, y + 1)) stack.push(cx, y + 1)
    }
  }
}


// ─── Point-in-path (ray casting on sampled bezier segments) ──────────────────

function pathContainsPoint(path: VectorPath, px: number, py: number): boolean {
  const points = samplePath(path, 80)
  if (points.length < 3) return false
  return raycastPolygon(points, px, py)
}

function samplePath(path: VectorPath, samplesPerSegment: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = []
  const { anchors, closed } = path
  if (anchors.length < 2) return pts

  const segments = closed ? anchors.length : anchors.length - 1
  for (let i = 0; i < segments; i++) {
    const a = anchors[i]!
    const b = anchors[(i + 1) % anchors.length]!
    const cp1 = a.handleOut ?? { x: a.x, y: a.y }
    const cp2 = b.handleIn ?? { x: b.x, y: b.y }
    for (let j = 0; j < samplesPerSegment; j++) {
      const t = j / samplesPerSegment
      const mt = 1 - t
      pts.push({
        x: mt*mt*mt*a.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*b.x,
        y: mt*mt*mt*a.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*b.y,
      })
    }
  }
  return pts
}

function raycastPolygon(pts: Array<{ x: number; y: number }>, px: number, py: number): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x, yi = pts[i]!.y
    const xj = pts[j]!.x, yj = pts[j]!.y
    if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

// ─── FillTool ─────────────────────────────────────────────────────────────────

/**
 * Procreate-style flood fill:
 *   - tap to fill at current tolerance
 *   - drag horizontally while still pressed to scrub tolerance live
 *     (right = looser fill, left = tighter), the canvas re-floods every move
 *   - pointer up commits a single undo entry from the original pixels
 *
 * Drag scrub is raster-only (vector fills are discrete shapes — nothing to scrub).
 */
export class FillTool extends Tool {
  settings: FillSettings = {
    color: '#1a1a1a',
    tolerance: 32,
    placement: 'back',
    gapClose: 0,
  }

  /** Pixels of horizontal drag that equal one tolerance unit (0-255). Lower = more sensitive. */
  dragSensitivity: number = 1.6

  // Active raster scrub session (null when idle or running on a vector layer)
  private _scrub: {
    layer: RasterLayer
    px: number
    py: number
    fillR: number; fillG: number; fillB: number; fillA: number
    /** Untouched copy of layer pixels captured at pointer-down. */
    before: Uint8ClampedArray
    width: number
    height: number
    refData: ImageData | null
    startX: number
    startTolerance: number
    lastTolerance: number
  } | null = null

  onPointerDown(e: PointerData): void {
    if (!this.board) return
    const layer = this.board.getActiveLayer()
    if (!layer) return
    if (!layer.visible) { this.board.hooks.drawBlocked.call({ reason: 'layer-hidden' }); return }

    if (layer instanceof RasterLayer) {
      this._beginRasterScrub(e, layer)
    } else if (layer instanceof VectorLayer) {
      this._fillVector(e, layer)
    }
  }

  onPointerMove(e: PointerData): void {
    if (!this._scrub) return
    const dx = e.x - this._scrub.startX
    const next = Math.max(0, Math.min(255, Math.round(this._scrub.startTolerance + dx / this.dragSensitivity)))
    if (next === this._scrub.lastTolerance) return
    this._scrub.lastTolerance = next
    this.settings.tolerance = next
    this._reflood(next)
    this.board!.hooks.toolPreview.call({
      tool: 'fill', kind: 'tolerance',
      data: { tolerance: next, x: e.x, y: e.y },
    })
  }

  onPointerUp(_e: PointerData): void {
    if (!this._scrub) return
    this._commitScrub()
  }

  onPointerCancel(_e: PointerData): void {
    if (!this._scrub) return
    // Revert to original pixels — user aborted.
    const { layer, before, width, height } = this._scrub
    layer.putImageData(new ImageData(new Uint8ClampedArray(before), width, height))
    this.board?.markDirty()
    this._scrub = null
  }

  onDeactivate(): void {
    if (this._scrub) this._commitScrub()
  }

  // ── Raster scrub session ─────────────────────────────────────────────────

  private _beginRasterScrub(e: PointerData, layer: RasterLayer): void {
    const board = this.board!
    const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
    const px = Math.floor(world.x - layer.transform.x)
    const py = Math.floor(world.y - layer.transform.y)
    if (px < 0 || px >= layer.width || py < 0 || py >= layer.height) return

    const hex = this.settings.color.replace('#', '')
    const fillR = parseInt(hex.substring(0, 2), 16)
    const fillG = parseInt(hex.substring(2, 4), 16)
    const fillB = parseInt(hex.substring(4, 6), 16)
    const fillA = 255

    const before = layer.getImageData().data.slice()

    const refObj = board.referenceLayerId ? board.getLayerById(board.referenceLayerId) : null
    let refData: ImageData | null = null
    if (refObj && refObj !== layer) {
      if (refObj instanceof RasterLayer && refObj.width === layer.width && refObj.height === layer.height
          && refObj.transform.x === layer.transform.x && refObj.transform.y === layer.transform.y) {
        refData = refObj.getImageData()
      } else {
        refData = rasterizeLayer(refObj, layer.width, layer.height, layer.transform.x, layer.transform.y)
      }
    }

    this._scrub = {
      layer, px, py,
      fillR, fillG, fillB, fillA,
      before,
      width: layer.width, height: layer.height,
      refData,
      startX: e.x,
      startTolerance: this.settings.tolerance,
      lastTolerance: this.settings.tolerance,
    }
    this._reflood(this.settings.tolerance)
  }

  private _reflood(tolerance: number): void {
    const s = this._scrub!
    const fresh = new Uint8ClampedArray(s.before)
    if (s.refData) {
      floodFillWithRef(fresh, s.refData.data, s.width, s.height, s.px, s.py, s.fillR, s.fillG, s.fillB, s.fillA, tolerance)
    } else {
      floodFill(fresh, s.width, s.height, s.px, s.py, s.fillR, s.fillG, s.fillB, s.fillA, tolerance)
    }
    s.layer.putImageData(new ImageData(fresh, s.width, s.height))
    this.board?.markDirty()
  }

  private _commitScrub(): void {
    const s = this._scrub!
    const after = s.layer.getImageData().data.slice()
    const before = s.before
    const { layer, width, height } = s
    const board = this.board!
    board.history.push({
      undo: () => { layer.putImageData(new ImageData(new Uint8ClampedArray(before), width, height)); board.markDirty() },
      redo: () => { layer.putImageData(new ImageData(new Uint8ClampedArray(after),  width, height)); board.markDirty() },
    })
    this._scrub = null
    board.hooks.toolPreview.call({ tool: 'fill', kind: 'end', data: {} })
  }

  // ── Vector fill (no drag; one-shot insert of a fill path) ────────────────

  private _fillVector(e: PointerData, layer: VectorLayer): void {
    const board = this.board!
    const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
    const lx = world.x - layer.transform.x
    const ly = world.y - layer.transform.y

    // Fast path: click inside a true closed VectorPath → exact polygon fill.
    let targetPath: VectorPath | null = null
    for (let i = layer.paths.length - 1; i >= 0; i--) {
      const p = layer.paths[i]!
      if (p.closed && pathContainsPoint(p, lx, ly)) {
        targetPath = p
        break
      }
    }

    if (targetPath) {
      this._insertVectorFill(layer, targetPath.anchors, targetPath)
      return
    }

    // Smart path: rasterize the layer, flood-fill into negative space with
    // optional gap closure, trace the boundary, insert as a closed path.
    const anchors = vectorRegionFill(layer, lx, ly, { gap: this.settings.gapClose })
    if (!anchors) {
      board.hooks.toolPreview.call({ tool: 'fill', kind: 'region-miss', data: { gap: this.settings.gapClose } })
      return
    }
    this._insertVectorFill(layer, anchors, null)
  }

  private _insertVectorFill(layer: VectorLayer, anchors: BezierAnchorForFill[], anchorPath: VectorPath | null): void {
    const board = this.board!
    const beforePaths = layer.paths.slice()
    const fillPath = layer.createPath(
      anchors.map((a) => ({
        x: a.x, y: a.y,
        type: a.type ?? 'corner',
        handleIn: a.handleIn ? { ...a.handleIn } : null,
        handleOut: a.handleOut ? { ...a.handleOut } : null,
      })),
      true,
      null,
      0,
      this.settings.color,
      anchorPath?.opacity ?? 1,
      anchorPath?.compositeOperation ?? 'source-over',
    )

    let insertIdx: number
    if (anchorPath) {
      const idx = layer.paths.indexOf(anchorPath)
      insertIdx = this.settings.placement === 'back' ? idx : idx + 1
    } else {
      // No anchor path → place at the back (behind all strokes/paths) by default,
      // or at the very front for placement='front'.
      insertIdx = this.settings.placement === 'back' ? 0 : layer.paths.length
    }
    layer.paths.splice(insertIdx, 0, fillPath)

    board.markDirty()
    board.history.push({
      undo: () => { layer.paths = [...beforePaths]; board.markDirty() },
      redo: () => {
        // Recompute insertion index in case other ops moved paths around
        const i = anchorPath ? layer.paths.indexOf(anchorPath) : -1
        const at = i >= 0
          ? (this.settings.placement === 'back' ? i : i + 1)
          : (this.settings.placement === 'back' ? 0 : layer.paths.length)
        layer.paths.splice(at, 0, fillPath)
        board.markDirty()
      },
    })
  }
}

// Local structural alias so _insertVectorFill can accept either a real
// BezierAnchor (from a VectorPath) or the simpler corner-only shape returned
// by vectorRegionFill — both share the relevant fields.
interface BezierAnchorForFill {
  x: number; y: number
  type?: 'smooth' | 'corner'
  handleIn?: { x: number; y: number } | null
  handleOut?: { x: number; y: number } | null
}
