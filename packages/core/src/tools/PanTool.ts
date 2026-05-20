import { Tool } from './Tool'
import type { PointerData } from '../types'

export class PanTool extends Tool {
  private isDragging = false
  private lastX = 0
  private lastY = 0

  onActivate(): void {
    if (this.board) this.board.canvas.style.cursor = 'grab'
  }

  onDeactivate(): void {
    if (this.board) this.board.canvas.style.cursor = ''
  }

  onPointerDown(e: PointerData): void {
    this.isDragging = true
    this.lastX = e.x
    this.lastY = e.y
    if (this.board) this.board.canvas.style.cursor = 'grabbing'
  }

  onPointerMove(e: PointerData): void {
    if (!this.isDragging || !this.board) return
    const dx = e.x - this.lastX
    const dy = e.y - this.lastY
    this.board.camera.pan(dx, dy)
    this.board.markDirty()
    this.lastX = e.x
    this.lastY = e.y
  }

  onPointerUp(_e: PointerData): void {
    this.isDragging = false
    if (this.board) this.board.canvas.style.cursor = 'grab'
  }

  onPointerCancel(_e: PointerData): void {
    this.isDragging = false
    if (this.board) this.board.canvas.style.cursor = 'grab'
  }
}
