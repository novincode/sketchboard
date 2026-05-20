import type { Camera } from '../Camera'
import type { Board } from '../Board'

export class GestureManager {
  private activePointers = new Map<number, PointerEvent>()
  private lastPinchDist = 0
  private lastTwoFingerCenter = { x: 0, y: 0 }

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
    element.style.touchAction = 'none'
  }

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

  private onPointerDown = (e: PointerEvent): void => {
    this.element.setPointerCapture(e.pointerId)
    this.activePointers.set(e.pointerId, e)

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

    if (this.activePointers.size >= 2) {
      const [a, b] = [...this.activePointers.values()] as [PointerEvent, PointerEvent]
      const dist = this.distance(a, b)
      const center = this.midpoint(a, b)
      const rect = this.element.getBoundingClientRect()
      const cx = center.x - rect.left
      const cy = center.y - rect.top
      const lc = this.lastTwoFingerCenter

      if (this.lastPinchDist > 0) {
        const zoomFactor = dist / this.lastPinchDist
        this.camera.zoomAt(zoomFactor, cx, cy, this.element.clientWidth, this.element.clientHeight)
        const panX = cx - (lc.x - rect.left)
        const panY = cy - (lc.y - rect.top)
        this.camera.pan(-panX, -panY)
        this.board.markDirty()
      }

      this.lastPinchDist = dist
      this.lastTwoFingerCenter = center
      return
    }

    this.board.activeTool?.onPointerMove(this.toPointerData(e))
  }

  private onPointerUp = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId)
    if (this.activePointers.size < 2) {
      this.lastPinchDist = 0
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
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    this.camera.zoomAt(
      factor,
      e.clientX - rect.left,
      e.clientY - rect.top,
      this.element.clientWidth,
      this.element.clientHeight,
    )
    this.board.markDirty()
  }

  private distance(a: PointerEvent, b: PointerEvent): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  private midpoint(a: PointerEvent, b: PointerEvent): { x: number; y: number } {
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
  }

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown)
    this.element.removeEventListener('pointermove', this.onPointerMove)
    this.element.removeEventListener('pointerup', this.onPointerUp)
    this.element.removeEventListener('pointercancel', this.onPointerCancel)
    this.element.removeEventListener('wheel', this.onWheel)
  }
}
