import { Tool } from './Tool'
import type { PointerData } from '../types'
import { VectorLayer } from '../layers/VectorLayer'
import type { BezierAnchor } from '../layers/VectorLayer'
import { Color } from '../math/Color'

export interface VectorPenSettings {
  strokeColor: string
  strokeWidth: number
  fillColor: string | null
  opacity: number
}

const CLOSE_RADIUS_SCREEN = 12   // px — how close to first anchor to auto-close

export class VectorPenTool extends Tool {
  settings: VectorPenSettings = {
    strokeColor: '#1a1a1a',
    strokeWidth: 2,
    fillColor: null,
    opacity: 1,
  }

  // In-progress path state
  private anchors: BezierAnchor[] = []
  private mouseWorld = { x: 0, y: 0 }   // current mouse in layer-local world coords
  private mouseScreen = { x: 0, y: 0 }  // current mouse in screen coords
  private _isDragging = false            // dragging a handle right now
  private _pendingAnchor: { x: number; y: number } | null = null
  private _overlayPending = false
  private _afterRenderUnsub: (() => void) | null = null

  onActivate(): void {
    this._afterRenderUnsub = this.board?.hooks.afterRender.tap('vectorpen', () => {
      if (this.anchors.length > 0) this.scheduleOverlayRedraw()
    }) ?? null
  }

  onDeactivate(): void {
    this._afterRenderUnsub?.()
    this._afterRenderUnsub = null
    this.board?.clearStrokeCanvas()
    this.anchors = []
  }

  onPointerDown(e: PointerData): void {
    if (!this.board) return
    const layer = this.board.getActiveLayer() as VectorLayer | undefined
    if (!layer || layer.type !== 'vector') {
      this.board.hooks.drawBlocked.call({ reason: 'wrong-layer-type' })
      return
    }
    if (!layer.visible) {
      this.board.hooks.drawBlocked.call({ reason: 'layer-hidden' })
      return
    }

    const world = this.toLayerCoords(e.x, e.y, layer)

    // Check close-path: click near first anchor
    if (this.anchors.length >= 2) {
      const first = this.anchors[0]!
      const fs = this.board.camera.worldToScreen(
        first.x + layer.transform.x, first.y + layer.transform.y,
        this.board.logicalWidth, this.board.logicalHeight,
      )
      const dx = e.x - fs.x, dy = e.y - fs.y
      if (dx * dx + dy * dy <= CLOSE_RADIUS_SCREEN * CLOSE_RADIUS_SCREEN) {
        this.commitPath(layer, true)
        return
      }
    }

    this._pendingAnchor = { x: world.x, y: world.y }
    this._isDragging = false
    this.scheduleOverlayRedraw()
  }

  onPointerMove(e: PointerData): void {
    if (!this.board) return
    const layer = this.board.getActiveLayer() as VectorLayer | undefined
    if (!layer || layer.type !== 'vector') return

    const world = this.toLayerCoords(e.x, e.y, layer)
    this.mouseWorld = world
    this.mouseScreen = { x: e.x, y: e.y }

    if (this._pendingAnchor) {
      const dx = world.x - this._pendingAnchor.x
      const dy = world.y - this._pendingAnchor.y
      if (dx * dx + dy * dy > (3 / this.board.camera.zoom) ** 2) {
        this._isDragging = true
      }
    }

    this.scheduleOverlayRedraw()
  }

  onPointerUp(e: PointerData): void {
    if (!this.board || !this._pendingAnchor) return
    const layer = this.board.getActiveLayer() as VectorLayer | undefined
    if (!layer || layer.type !== 'vector') return

    const world = this.toLayerCoords(e.x, e.y, layer)
    const anchor: BezierAnchor = {
      x: this._pendingAnchor.x,
      y: this._pendingAnchor.y,
      handleIn: null,
      handleOut: null,
      type: 'smooth',
    }

    if (this._isDragging) {
      // Set handles based on drag delta from anchor
      const dx = world.x - this._pendingAnchor.x
      const dy = world.y - this._pendingAnchor.y
      anchor.handleOut = { x: this._pendingAnchor.x + dx, y: this._pendingAnchor.y + dy }
      anchor.handleIn = { x: this._pendingAnchor.x - dx, y: this._pendingAnchor.y - dy }
    } else {
      anchor.type = 'corner'
    }

    this.anchors.push(anchor)
    this._pendingAnchor = null
    this._isDragging = false
    this.scheduleOverlayRedraw()
  }

  onPointerCancel(_e: PointerData): void {
    this._pendingAnchor = null
    this._isDragging = false
    this.scheduleOverlayRedraw()
  }

  /** Finish path without closing (e.g., on Enter key). */
  finishPath(): void {
    const layer = this.board?.getActiveLayer() as VectorLayer | undefined
    if (!layer || layer.type !== 'vector' || this.anchors.length < 2) {
      this.anchors = []
      this.board?.clearStrokeCanvas()
      return
    }
    this.commitPath(layer, false)
  }

  /** Cancel and discard current path (e.g., on Escape). */
  cancelPath(): void {
    this.anchors = []
    this.board?.clearStrokeCanvas()
  }

  private commitPath(layer: VectorLayer, closed: boolean): void {
    if (this.anchors.length < 2) { this.cancelPath(); return }
    const beforePaths = layer.paths.slice()
    const path = layer.createPath(
      [...this.anchors],
      closed,
      this.settings.strokeColor,
      this.settings.strokeWidth,
      this.settings.fillColor,
      this.settings.opacity,
    )
    layer.addPath(path)

    const board = this.board!
    board.history.push({
      undo: () => { layer.paths = [...beforePaths]; board.markDirty() },
      redo: () => { layer.paths = [...beforePaths, path]; board.markDirty() },
    })

    this.anchors = []
    board.clearStrokeCanvas()
    board.markDirty()
  }

  // ── Overlay (in-progress path preview) ───────────────────────────────────

  private scheduleOverlayRedraw(): void {
    if (this._overlayPending) return
    this._overlayPending = true
    requestAnimationFrame(() => {
      this._overlayPending = false
      this.redrawOverlay()
    })
  }

  private redrawOverlay(): void {
    const board = this.board
    if (!board?.strokeCtx) return
    const { strokeCtx } = board
    const dpr = window.devicePixelRatio ?? 1
    const W = board.logicalWidth, H = board.logicalHeight
    const layer = board.getActiveLayer() as VectorLayer | undefined

    strokeCtx.clearRect(0, 0, strokeCtx.canvas.width, strokeCtx.canvas.height)
    if (this.anchors.length === 0 && !this._pendingAnchor) return

    strokeCtx.save()
    strokeCtx.scale(dpr, dpr)

    const toScreen = (lx: number, ly: number) =>
      board.camera.worldToScreen(lx + (layer?.transform.x ?? 0), ly + (layer?.transform.y ?? 0), W, H)

    // Draw path so far
    if (this.anchors.length >= 1) {
      const allAnchors = [...this.anchors]
      // Add a "cursor anchor" (no handles, just position) as preview end
      const cursorAnchor: BezierAnchor = {
        x: this.mouseWorld.x, y: this.mouseWorld.y,
        handleIn: null, handleOut: null, type: 'corner',
      }
      if (this._pendingAnchor && this._isDragging) {
        // Show dragging handle preview
        const world = this.mouseWorld
        const pa = this._pendingAnchor
        const dx = world.x - pa.x, dy = world.y - pa.y
        cursorAnchor.x = pa.x; cursorAnchor.y = pa.y
        cursorAnchor.handleIn = { x: pa.x - dx, y: pa.y - dy }
        cursorAnchor.handleOut = { x: pa.x + dx, y: pa.y + dy }
        cursorAnchor.type = 'smooth'
      }

      strokeCtx.strokeStyle = this.settings.strokeColor
      strokeCtx.lineWidth = Math.max(1, this.settings.strokeWidth * board.camera.zoom)
      strokeCtx.lineCap = 'round'
      strokeCtx.setLineDash([])
      strokeCtx.globalAlpha = this.settings.opacity

      const tempAnchors = [...allAnchors, cursorAnchor]
      strokeCtx.beginPath()
      const first = toScreen(tempAnchors[0]!.x, tempAnchors[0]!.y)
      strokeCtx.moveTo(first.x, first.y)
      for (let i = 1; i < tempAnchors.length; i++) {
        const prev = tempAnchors[i - 1]!
        const curr = tempAnchors[i]!
        const ps = toScreen(prev.x, prev.y)
        const cs = toScreen(curr.x, curr.y)
        const cp1 = prev.handleOut ? toScreen(prev.handleOut.x, prev.handleOut.y) : ps
        const cp2 = curr.handleIn ? toScreen(curr.handleIn.x, curr.handleIn.y) : cs
        strokeCtx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, cs.x, cs.y)
      }
      strokeCtx.stroke()
    }

    // Draw handles for committed anchors
    strokeCtx.globalAlpha = 1
    for (const a of this.anchors) {
      const as = toScreen(a.x, a.y)
      if (a.handleIn) {
        const hs = toScreen(a.handleIn.x, a.handleIn.y)
        strokeCtx.strokeStyle = 'rgba(99,179,237,0.5)'
        strokeCtx.lineWidth = 1
        strokeCtx.setLineDash([3, 3])
        strokeCtx.beginPath(); strokeCtx.moveTo(as.x, as.y); strokeCtx.lineTo(hs.x, hs.y); strokeCtx.stroke()
        strokeCtx.fillStyle = '#fff'
        strokeCtx.strokeStyle = '#63b3ed'
        strokeCtx.lineWidth = 1.5
        strokeCtx.setLineDash([])
        strokeCtx.fillRect(hs.x - 3.5, hs.y - 3.5, 7, 7)
        strokeCtx.strokeRect(hs.x - 3.5, hs.y - 3.5, 7, 7)
      }
      if (a.handleOut) {
        const hs = toScreen(a.handleOut.x, a.handleOut.y)
        strokeCtx.strokeStyle = 'rgba(99,179,237,0.5)'
        strokeCtx.lineWidth = 1
        strokeCtx.setLineDash([3, 3])
        strokeCtx.beginPath(); strokeCtx.moveTo(as.x, as.y); strokeCtx.lineTo(hs.x, hs.y); strokeCtx.stroke()
        strokeCtx.fillStyle = '#fff'
        strokeCtx.strokeStyle = '#63b3ed'
        strokeCtx.lineWidth = 1.5
        strokeCtx.setLineDash([])
        strokeCtx.fillRect(hs.x - 3.5, hs.y - 3.5, 7, 7)
        strokeCtx.strokeRect(hs.x - 3.5, hs.y - 3.5, 7, 7)
      }
      // Anchor circle
      strokeCtx.setLineDash([])
      strokeCtx.beginPath()
      strokeCtx.arc(as.x, as.y, 5, 0, Math.PI * 2)
      strokeCtx.fillStyle = '#fff'
      strokeCtx.strokeStyle = '#63b3ed'
      strokeCtx.lineWidth = 2
      strokeCtx.fill(); strokeCtx.stroke()
    }

    // Close-path indicator: highlight first anchor when mouse is near it
    if (this.anchors.length >= 2) {
      const first = this.anchors[0]!
      const fs = toScreen(first.x, first.y)
      const dx = this.mouseScreen.x - fs.x, dy = this.mouseScreen.y - fs.y
      if (dx * dx + dy * dy <= CLOSE_RADIUS_SCREEN * CLOSE_RADIUS_SCREEN) {
        strokeCtx.beginPath()
        strokeCtx.arc(fs.x, fs.y, 9, 0, Math.PI * 2)
        strokeCtx.strokeStyle = 'rgba(99,179,237,0.9)'
        strokeCtx.lineWidth = 2
        strokeCtx.stroke()
      }
    }

    strokeCtx.restore()
  }

  private toLayerCoords(sx: number, sy: number, layer: VectorLayer) {
    const board = this.board!
    const w = board.camera.screenToWorld(sx, sy, board.logicalWidth, board.logicalHeight)
    return { x: w.x - layer.transform.x, y: w.y - layer.transform.y }
  }
}
