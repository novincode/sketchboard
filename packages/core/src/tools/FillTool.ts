import { Tool } from './Tool'
import type { PointerData } from '../types'
import { RasterLayer } from '../layers/RasterLayer'
import { VectorLayer } from '../layers/VectorLayer'
import type { BezierAnchor, VectorPath } from '../layers/VectorLayer'

export type FillPlacement = 'front' | 'back'

export interface FillSettings {
  color: string        // hex, e.g. '#ff0000'
  tolerance: number    // 0–255 per channel
  placement: FillPlacement  // vector only: add fill in front or behind stroke
}

export class FillTool extends Tool {
  settings: FillSettings = {
    color: '#1a1a1a',
    tolerance: 32,
    placement: 'back',
  }

  onPointerDown(e: PointerData): void {
    if (!this.board) return
    const layer = this.board.getActiveLayer()
    if (!layer) return
    if (!layer.visible) { this.board.hooks.drawBlocked.call({ reason: 'layer-hidden' }); return }

    if (layer instanceof RasterLayer) {
      this._fillRaster(e, layer)
    } else if (layer instanceof VectorLayer) {
      this._fillVector(e, layer)
    }
  }

  onPointerMove(_e: PointerData): void {}
  onPointerUp(_e: PointerData): void {}
  onPointerCancel(_e: PointerData): void {}

  // ── Raster flood fill ────────────────────────────────────────────────────

  private _fillRaster(e: PointerData, layer: RasterLayer): void {
    const board = this.board!
    const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
    const px = Math.floor(world.x - layer.transform.x)
    const py = Math.floor(world.y - layer.transform.y)

    if (px < 0 || px >= layer.width || py < 0 || py >= layer.height) return

    const imageData = layer.getImageData()
    const beforeBytes = imageData.data.slice()  // one GPU read, JS copy for undo

    const hex = this.settings.color.replace('#', '')
    const fillR = parseInt(hex.substring(0, 2), 16)
    const fillG = parseInt(hex.substring(2, 4), 16)
    const fillB = parseInt(hex.substring(4, 6), 16)
    const fillA = 255

    floodFill(imageData.data, layer.width, layer.height, px, py, fillR, fillG, fillB, fillA, this.settings.tolerance)
    layer.putImageData(imageData)
    board.markDirty()

    const afterBytes = imageData.data.slice()
    const w = layer.width, h = layer.height
    board.history.push({
      undo: () => { layer.putImageData(new ImageData(new Uint8ClampedArray(beforeBytes), w, h)); board.markDirty() },
      redo: () => { layer.putImageData(new ImageData(new Uint8ClampedArray(afterBytes), w, h)); board.markDirty() },
    })
  }

  // ── Vector fill ───────────────────────────────────────────────────────────

  private _fillVector(e: PointerData, layer: VectorLayer): void {
    const board = this.board!
    const world = board.camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
    const lx = world.x - layer.transform.x
    const ly = world.y - layer.transform.y

    // Find the topmost closed path that contains the click point
    let targetPath: VectorPath | null = null
    for (let i = layer.paths.length - 1; i >= 0; i--) {
      const p = layer.paths[i]!
      if (p.closed && pathContainsPoint(p, lx, ly)) {
        targetPath = p
        break
      }
    }

    if (!targetPath) return

    const beforePaths = layer.paths.slice()
    const fillPath = layer.createPath(
      targetPath.anchors.map((a) => ({
        ...a,
        handleIn: a.handleIn ? { ...a.handleIn } : null,
        handleOut: a.handleOut ? { ...a.handleOut } : null,
      })),
      true,
      null,            // no stroke
      0,
      this.settings.color,  // fill color
      targetPath.opacity,
      targetPath.compositeOperation,
    )

    if (this.settings.placement === 'back') {
      // Insert before the target path
      const idx = layer.paths.indexOf(targetPath)
      layer.paths.splice(idx, 0, fillPath)
    } else {
      // Insert after the target path
      const idx = layer.paths.indexOf(targetPath)
      layer.paths.splice(idx + 1, 0, fillPath)
    }

    board.markDirty()
    board.history.push({
      undo: () => { layer.paths = [...beforePaths]; board.markDirty() },
      redo: () => {
        if (this.settings.placement === 'back') {
          const i = layer.paths.indexOf(targetPath!)
          if (i >= 0) layer.paths.splice(i, 0, fillPath)
        } else {
          const i = layer.paths.indexOf(targetPath!)
          if (i >= 0) layer.paths.splice(i + 1, 0, fillPath)
        }
        board.markDirty()
      },
    })
  }
}

// ── Flood fill (scanline) ──────────────────────────────────────────────────────

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

  // Already the fill color
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

    // Scanline: go left and right from this x
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

// ── Point-in-path (ray casting on sampled bezier segments) ────────────────────

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
