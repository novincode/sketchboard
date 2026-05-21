import type { Camera } from '../Camera'
import type { Board } from '../Board'

export class GestureManager {
  private activePointers = new Map<number, PointerEvent>()
  private lastPinchDist = 0
  private lastTwoFingerCenter = { x: 0, y: 0 }
  private isSpaceHeld = false
  private isMiddleDown = false

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: Camera,
    private readonly board: Board,
  ) {
    element.addEventListener('pointerdown', this.onPointerDown)
    element.addEventListener('pointermove', this.onPointerMove)
    element.addEventListener('pointerup', this.onPointerUp)
    element.addEventListener('pointercancel', this.onPointerCancel)
    element.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    element.style.touchAction = 'none'
  }

  // ─── Pointer helpers ──────────────────────────────────────────────────────

  private toPointerData(e: PointerEvent) {
    const rect = this.element.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      pointerId: e.pointerId,
      pointerType: e.pointerType as 'mouse' | 'pen' | 'touch',
      timeStamp: e.timeStamp,
    }
  }

  // ─── Pointer events ───────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    this.element.setPointerCapture(e.pointerId)
    this.activePointers.set(e.pointerId, e)

    // Middle mouse button → temporary pan (same as Space)
    if (e.button === 1) {
      this.isMiddleDown = true
      this.board.setTempTool('pan')
      // Forward down to pan tool so it enters drag mode
      this.board.activeTool?.onPointerDown(this.toPointerData(e))
      e.preventDefault()
      return
    }

    if (this.activePointers.size === 2) {
      const [a, b] = [...this.activePointers.values()] as [PointerEvent, PointerEvent]
      this.lastPinchDist = this.distance(a, b)
      this.lastTwoFingerCenter = this.midpoint(a, b)
      return
    }

    if (this.activePointers.size === 1) {
      this.board.activeTool?.onPointerDown(this.toPointerData(e))
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.activePointers.set(e.pointerId, e)

    // Two-finger gesture: pinch-zoom + pan
    if (this.activePointers.size >= 2) {
      // Don't process coalesced events for two-finger gestures

      const [a, b] = [...this.activePointers.values()] as [PointerEvent, PointerEvent]
      const dist = this.distance(a, b)
      const center = this.midpoint(a, b)
      const rect = this.element.getBoundingClientRect()
      const cx = center.x - rect.left
      const cy = center.y - rect.top
      const prevCx = this.lastTwoFingerCenter.x - rect.left
      const prevCy = this.lastTwoFingerCenter.y - rect.top

      if (this.lastPinchDist > 0) {
        const zoomFactor = dist / this.lastPinchDist
        this.camera.zoomAt(zoomFactor, cx, cy, this.board.logicalWidth, this.board.logicalHeight)
        // Pan: midpoint moved right → camera looks further right → content moves right
        this.camera.pan(cx - prevCx, cy - prevCy)
        this.board.markDirty()
      }

      this.lastPinchDist = dist
      this.lastTwoFingerCenter = center
      return
    }

    // Use coalesced events to capture all intermediate pointer positions between frames.
    // This is the single biggest factor for smooth, non-jagged strokes on high-Hz devices.
    const coalesced = e.getCoalescedEvents?.() ?? [e]
    for (const ce of coalesced) {
      this.board.activeTool?.onPointerMove(this.toPointerData(ce))
    }
    // Predicted events give sub-frame latency — pass the final one only
    const predicted = e.getPredictedEvents?.()
    if (predicted?.length) {
      this.board.activeTool?.onPointerMove(this.toPointerData(predicted[predicted.length - 1]!))
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId)
    if (this.activePointers.size < 2) this.lastPinchDist = 0

    if (e.button === 1 && this.isMiddleDown) {
      this.isMiddleDown = false
      this.board.clearTempTool()
      return
    }

    this.board.activeTool?.onPointerUp(this.toPointerData(e))
  }

  private onPointerCancel = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId)
    if (this.activePointers.size < 2) this.lastPinchDist = 0
    this.board.activeTool?.onPointerCancel(this.toPointerData(e))
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const rect = this.element.getBoundingClientRect()
    // Use logarithmic zoom for trackpad (deltaY can be fractional)
    const delta = e.ctrlKey ? e.deltaY : e.deltaY * 0.5
    const factor = Math.pow(0.999, delta)
    this.camera.zoomAt(
      factor,
      e.clientX - rect.left,
      e.clientY - rect.top,
      this.board.logicalWidth,
      this.board.logicalHeight,
    )
    this.board.markDirty()
  }

  // ─── Keyboard (spacebar → temp pan) ──────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || e.repeat || this.isSpaceHeld) return
    const tag = (e.target as HTMLElement | null)?.tagName ?? ''
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    this.isSpaceHeld = true
    this.board.setTempTool('pan')
    e.preventDefault()
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return
    this.isSpaceHeld = false
    this.board.clearTempTool()
  }

  // ─── Math helpers ─────────────────────────────────────────────────────────

  private distance(a: PointerEvent, b: PointerEvent): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  private midpoint(a: PointerEvent, b: PointerEvent): { x: number; y: number } {
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown)
    this.element.removeEventListener('pointermove', this.onPointerMove)
    this.element.removeEventListener('pointerup', this.onPointerUp)
    this.element.removeEventListener('pointercancel', this.onPointerCancel)
    this.element.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }
}
