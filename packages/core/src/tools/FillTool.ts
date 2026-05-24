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

/**
 * Downscale RGBA8 by integer factor `ds`. Alpha uses MAX over each block so
 * thin walls / strokes survive the downsample (averaging would blend them
 * out and the flood would leak right through). RGB samples the block center
 * — cheaper than averaging and good enough for color-tolerance matching.
 */
function downsampleRgba(
  src: Uint8ClampedArray,
  W: number, H: number,
  ds: number,
  outW: number, outH: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(outW * outH * 4)
  const half = ds >> 1
  for (let y = 0; y < outH; y++) {
    const y0 = y * ds
    const yEnd = Math.min(H, y0 + ds)
    const sy = Math.min(H - 1, y0 + half)
    for (let x = 0; x < outW; x++) {
      const x0 = x * ds
      const xEnd = Math.min(W, x0 + ds)
      const sx = Math.min(W - 1, x0 + half)

      // Max-pool alpha across the block (preserves walls).
      let maxA = 0
      for (let yy = y0; yy < yEnd; yy++) {
        const row = yy * W * 4 + 3
        for (let xx = x0; xx < xEnd; xx++) {
          const a = src[row + (xx - 0) * 4]!
          if (a > maxA) { maxA = a; if (a === 255) break }
        }
        if (maxA === 255) break
      }
      // Sample-center RGB.
      const si = (sy * W + sx) * 4
      const di = (y * outW + x) * 4
      dst[di]     = src[si]!
      dst[di + 1] = src[si + 1]!
      dst[di + 2] = src[si + 2]!
      dst[di + 3] = maxA
    }
  }
  return dst
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

  /**
   * Tolerance quantize step during scrub. 256/2 = 128 distinct preview values
   * is plenty for feel, and cuts reflood frequency in half.
   */
  scrubToleranceStep: number = 2

  /**
   * Downsample factor used for the in-flight scrub preview. A 4× downscale
   * means the flood touches 1/16 the pixels — turns an 800ms flood on a 4K
   * canvas into ~50ms. Only used during the drag; final commit is full-res.
   * Set to 1 to disable downsampling.
   */
  scrubPreviewDownscale: number = 4

  // rAF coalescing for drag-scrub: pointermove fires far more often than we
  // can re-flood. We record the latest desired tolerance and run exactly one
  // reflood per animation frame.
  private _refloodRaf: number | null = null
  private _pendingTolerance: number | null = null
  private _lastFloodedTolerance: number = -1

  // Active raster scrub session (null when idle or running on a vector layer).
  //
  // Key invariant: the LAYER CANVAS is never the source of truth during a
  // scrub. We snapshot the pre-scrub state into `backupCanvas` once at begin,
  // and every reflood / cancel restores from it via a single drawImage call —
  // so accumulation between tolerance values is impossible by construction.
  // `before` (raw bytes) is kept around just for the history entry at commit.
  //
  // `low` is a precomputed downscaled grid (built once at begin) that drives
  // the snappy in-flight tolerance preview. The final commit always runs a
  // full-resolution flood from `backupCanvas`, so what you see on release is
  // the real fill, not the blocky low-res approximation.
  private _scrub: {
    layer: RasterLayer
    px: number
    py: number
    fillR: number; fillG: number; fillB: number; fillA: number
    width: number
    height: number
    /** Pristine layer pixels at scrub-start. Restored on every reflood. */
    backupCanvas: HTMLCanvasElement
    /** Same pixels as bytes — kept once so the history entry doesn't need a getImageData at commit. */
    before: Uint8ClampedArray
    refData: ImageData | null
    startX: number
    startTolerance: number
    lastTolerance: number
    low: {
      scale: number
      w: number; h: number
      px: number; py: number
      beforeBytes: Uint8ClampedArray
      refBytes: Uint8ClampedArray | null
      previewCanvas: HTMLCanvasElement
      previewCtx: CanvasRenderingContext2D
    } | null
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

  /**
   * One-shot fill at a screen-space point with the given color, using the
   * tool's current tolerance/gap/placement settings. No drag scrub. Used by
   * the demo's "drag color onto canvas" gesture so callers don't have to
   * switch the active tool — Procreate ColorDrop in core form.
   */
  fillAtScreenPoint(screenX: number, screenY: number, hexColor: string): boolean {
    if (!this.board) return false
    const layer = this.board.getActiveLayer()
    if (!layer || !layer.visible) return false

    const savedColor = this.settings.color
    this.settings.color = hexColor
    try {
      const fakeEvt: PointerData = {
        x: screenX, y: screenY, pressure: 1, tiltX: 0, tiltY: 0,
        pointerId: -1, pointerType: 'mouse', timeStamp: performance.now(),
      }
      if (layer instanceof RasterLayer) {
        // Skip the scrub setup; do a single fill + history entry directly.
        return this._oneShotRasterFill(fakeEvt, layer, hexColor)
      } else if (layer instanceof VectorLayer) {
        this._fillVector(fakeEvt, layer)
        return true
      }
      return false
    } finally {
      this.settings.color = savedColor
    }
  }

  private _oneShotRasterFill(e: PointerData, layer: RasterLayer, hexColor: string): boolean {
    const board = this.board!
    const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
    const px = Math.floor(world.x - layer.transform.x)
    const py = Math.floor(world.y - layer.transform.y)
    if (px < 0 || px >= layer.width || py < 0 || py >= layer.height) return false

    const hex = hexColor.replace('#', '')
    const fillR = parseInt(hex.substring(0, 2), 16)
    const fillG = parseInt(hex.substring(2, 4), 16)
    const fillB = parseInt(hex.substring(4, 6), 16)
    const fillA = 255

    const imageData = layer.getImageData()
    const before = imageData.data.slice()

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

    if (refData) {
      floodFillWithRef(imageData.data, refData.data, layer.width, layer.height, px, py, fillR, fillG, fillB, fillA, this.settings.tolerance)
    } else {
      floodFill(imageData.data, layer.width, layer.height, px, py, fillR, fillG, fillB, fillA, this.settings.tolerance)
    }
    layer.putImageData(imageData)
    board.markDirty()

    const after = imageData.data.slice()
    const W = layer.width, H = layer.height
    board.history.push({
      undo: () => { layer.putImageData(new ImageData(new Uint8ClampedArray(before), W, H)); board.markDirty() },
      redo: () => { layer.putImageData(new ImageData(new Uint8ClampedArray(after),  W, H)); board.markDirty() },
    })
    return true
  }

  onPointerMove(e: PointerData): void {
    this.scrubMove(e.x, e.y)
  }

  onPointerUp(_e: PointerData): void {
    if (!this._scrub) return
    this.scrubEnd()
  }

  onPointerCancel(_e: PointerData): void {
    if (!this._scrub) return
    this.scrubCancel()
  }

  onDeactivate(): void {
    if (this._scrub) this.scrubEnd()
  }

  private _scheduleReflood(tolerance: number): void {
    this._pendingTolerance = tolerance
    if (this._refloodRaf !== null) return
    this._refloodRaf = requestAnimationFrame(() => {
      this._refloodRaf = null
      const t = this._pendingTolerance
      this._pendingTolerance = null
      if (this._scrub && t !== null) this._reflood(t)
    })
  }

  private _cancelPendingReflood(): void {
    if (this._refloodRaf !== null) {
      cancelAnimationFrame(this._refloodRaf)
      this._refloodRaf = null
    }
    this._pendingTolerance = null
  }

  // ── Raster scrub session ─────────────────────────────────────────────────

  /**
   * Begin a raster scrub at the given SCREEN coords with an optional color
   * override. Used by both onPointerDown (FillTool active) and by the demo's
   * ColorDrop overlay (which keeps the swatch gesture going past the drop and
   * scrubs tolerance horizontally — same code path, no duplicate flood logic).
   *
   * Returns true if a scrub started, false if the click missed the layer or
   * the active layer isn't a raster.
   */
  scrubBeginAtScreen(screenX: number, screenY: number, hexColor?: string): boolean {
    if (!this.board) return false
    const layer = this.board.getActiveLayer()
    if (!(layer instanceof RasterLayer) || !layer.visible) return false
    if (hexColor) this.settings.color = hexColor
    return this._beginRasterScrub({
      x: screenX, y: screenY, pressure: 1, tiltX: 0, tiltY: 0,
      pointerId: -1, pointerType: 'mouse', timeStamp: performance.now(),
    }, layer)
  }

  /** Update the scrub cursor position (only horizontal delta drives tolerance). */
  scrubMove(screenX: number, screenY: number): void {
    if (!this._scrub) return
    const dx = screenX - this._scrub.startX
    const raw = this._scrub.startTolerance + dx / this.dragSensitivity
    const q = this.scrubToleranceStep
    const next = Math.max(0, Math.min(255, Math.round(raw / q) * q))
    if (next === this._scrub.lastTolerance && this._pendingTolerance === null) return
    this._scrub.lastTolerance = next
    this.settings.tolerance = next
    this.board!.hooks.toolPreview.call({
      tool: 'fill', kind: 'tolerance',
      data: { tolerance: next, x: screenX, y: screenY },
    })
    this._scheduleReflood(next)
  }

  /** Commit the scrub (full-res final flood + single history entry). */
  scrubEnd(): void {
    if (!this._scrub) return
    this._cancelPendingReflood()
    this._commitScrub()
    this.board?.hooks.toolPreview.call({ tool: 'fill', kind: 'end', data: {} })
  }

  /** Abort the scrub, restoring the pre-scrub pixels. */
  scrubCancel(): void {
    if (!this._scrub) return
    this._cancelPendingReflood()
    this._restoreFromBackup()
    this.board?.markDirty()
    this._scrub = null
    this.board?.hooks.toolPreview.call({ tool: 'fill', kind: 'end', data: {} })
  }

  /** True while a scrub session is in progress. */
  isScrubbing(): boolean { return this._scrub !== null }

  private _beginRasterScrub(e: PointerData, layer: RasterLayer): boolean {
    const board = this.board!
    const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
    const px = Math.floor(world.x - layer.transform.x)
    const py = Math.floor(world.y - layer.transform.y)
    if (px < 0 || px >= layer.width || py < 0 || py >= layer.height) return false

    const hex = this.settings.color.replace('#', '')
    const fillR = parseInt(hex.substring(0, 2), 16)
    const fillG = parseInt(hex.substring(2, 4), 16)
    const fillB = parseInt(hex.substring(4, 6), 16)
    const fillA = 255

    // Read pristine pixel bytes ONCE — used for the low-res downsample input
    // AND for the undo history entry at commit. No further getImageData calls
    // happen during the scrub.
    const beforeImg = layer.getImageData()
    const before = beforeImg.data.slice()

    // Snapshot the LAYER CANVAS into a backup canvas so every reflood can
    // restore via a single GPU-accelerated drawImage call — much cheaper
    // than the previous putImageData(33MB) approach, and accumulation across
    // tolerance changes becomes mathematically impossible.
    const backupCanvas = document.createElement('canvas')
    backupCanvas.width = layer.width
    backupCanvas.height = layer.height
    const backupCtx = backupCanvas.getContext('2d')
    if (!backupCtx) return false
    backupCtx.drawImage(layer.canvas, 0, 0)

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

    const ds = this.scrubPreviewDownscale | 0
    const useLow = ds > 1 && (layer.width > 1024 || layer.height > 1024)
    const low = useLow ? this._buildLowResScratch(before, refData, layer.width, layer.height, px, py, ds) : null

    this._scrub = {
      layer, px, py,
      fillR, fillG, fillB, fillA,
      width: layer.width, height: layer.height,
      backupCanvas,
      before,
      refData,
      startX: e.x,
      startTolerance: this.settings.tolerance,
      lastTolerance: this.settings.tolerance,
      low,
    }
    this._lastFloodedTolerance = -1
    // Initial fill is ALWAYS full-resolution so what you see on click matches
    // what would commit on release. Subsequent scrub motion uses the cheaper
    // low-res preview.
    this._restoreFromBackup()
    this._stampFullFill(this.settings.tolerance)
    this.board?.markDirty()
    return true
  }

  /** Single source of truth for "put the layer back to its pristine state". */
  private _restoreFromBackup(): void {
    const s = this._scrub!
    const ctx = s.layer.ctx
    ctx.clearRect(0, 0, s.width, s.height)
    ctx.drawImage(s.backupCanvas, 0, 0)
  }

  private _reflood(tolerance: number): void {
    // ALWAYS restore from backup first — guarantees the previous reflood's
    // pixels can't bleed into the next one.
    this._restoreFromBackup()
    const s = this._scrub!
    if (s.low) this._stampLowOverlay(tolerance)
    else this._stampFullFill(tolerance)
    this._lastFloodedTolerance = tolerance
    this.board?.markDirty()
  }

  /**
   * Low-resolution preview: flood at 1/ds², extract the fill region as a
   * transparent-elsewhere overlay, drawImage it onto the (just-restored)
   * layer scaled up. Smoothing OFF so the preview looks blocky-but-honest
   * about the fill region rather than feathered.
   */
  private _stampLowOverlay(tolerance: number): void {
    const s = this._scrub!
    const low = s.low!
    const fresh = new Uint8ClampedArray(low.beforeBytes)
    if (low.refBytes) {
      floodFillWithRef(fresh, low.refBytes, low.w, low.h, low.px, low.py, s.fillR, s.fillG, s.fillB, s.fillA, tolerance)
    } else {
      floodFill(fresh, low.w, low.h, low.px, low.py, s.fillR, s.fillG, s.fillB, s.fillA, tolerance)
    }

    const overlay = new Uint8ClampedArray(fresh.length)
    const beforeLo = low.beforeBytes
    for (let i = 0; i < fresh.length; i += 4) {
      if (fresh[i] !== beforeLo[i] || fresh[i + 1] !== beforeLo[i + 1]
          || fresh[i + 2] !== beforeLo[i + 2] || fresh[i + 3] !== beforeLo[i + 3]) {
        overlay[i]     = s.fillR
        overlay[i + 1] = s.fillG
        overlay[i + 2] = s.fillB
        overlay[i + 3] = s.fillA
      }
    }
    low.previewCtx.putImageData(new ImageData(overlay, low.w, low.h), 0, 0)

    const dst = s.layer.ctx
    dst.save()
    dst.imageSmoothingEnabled = false
    dst.drawImage(low.previewCanvas, 0, 0, s.width, s.height)
    dst.restore()
  }

  /**
   * Full-resolution fill stamped onto the (just-restored) layer pixels.
   * Reads the layer's current bytes for flood input — assumes the caller
   * already called _restoreFromBackup() this frame.
   */
  private _stampFullFill(tolerance: number): void {
    const s = this._scrub!
    const data = s.layer.getImageData()
    if (s.refData) {
      floodFillWithRef(data.data, s.refData.data, s.width, s.height, s.px, s.py, s.fillR, s.fillG, s.fillB, s.fillA, tolerance)
    } else {
      floodFill(data.data, s.width, s.height, s.px, s.py, s.fillR, s.fillG, s.fillB, s.fillA, tolerance)
    }
    s.layer.putImageData(data)
  }

  private _buildLowResScratch(
    before: Uint8ClampedArray,
    refData: ImageData | null,
    W: number, H: number,
    px: number, py: number,
    ds: number,
  ): NonNullable<typeof this._scrub>['low'] {
    const w = Math.max(1, Math.ceil(W / ds))
    const h = Math.max(1, Math.ceil(H / ds))
    const beforeBytes = downsampleRgba(before, W, H, ds, w, h)
    const refBytes = refData ? downsampleRgba(refData.data, W, H, ds, w, h) : null
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    return {
      scale: ds,
      w, h,
      px: Math.min(w - 1, Math.floor(px / ds)),
      py: Math.min(h - 1, Math.floor(py / ds)),
      beforeBytes,
      refBytes,
      previewCanvas: canvas,
      previewCtx: ctx,
    }
  }

  private _commitScrub(): void {
    const s = this._scrub!
    // Ensure the LAYER holds the full-resolution final fill before snapshotting
    // "after" bytes — previews during scrub may have been low-res.
    this._restoreFromBackup()
    this._stampFullFill(s.lastTolerance)

    const after = s.layer.getImageData().data.slice()
    const before = s.before
    const { layer, width, height } = s
    const board = this.board!
    board.markDirty()
    board.history.push({
      undo: () => { layer.putImageData(new ImageData(new Uint8ClampedArray(before), width, height)); board.markDirty() },
      redo: () => { layer.putImageData(new ImageData(new Uint8ClampedArray(after),  width, height)); board.markDirty() },
    })
    this._scrub = null
    // 'end' is emitted by scrubEnd/scrubCancel so the HUD only fades once.
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
