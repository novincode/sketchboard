import { Tool } from './Tool'
import { Color } from '../math/Color'
import type { PointerData } from '../types'

export class EyedropperTool extends Tool {
  onActivate(): void {
    if (this.board) this.board.canvas.style.cursor = 'crosshair'
  }

  onDeactivate(): void {
    if (this.board) this.board.canvas.style.cursor = ''
  }

  onPointerDown(e: PointerData): void {
    if (!this.board) return
    const { canvas } = this.board
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // canvas dimensions are in physical pixels; pointer data is in logical CSS pixels
    const dpr = window.devicePixelRatio ?? 1
    const px = Math.round(e.x * dpr)
    const py = Math.round(e.y * dpr)

    const { data } = ctx.getImageData(px, py, 1, 1)
    const color = new Color(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 255)

    this.board.hooks.colorPicked.call({ color })
  }

  onPointerMove(_e: PointerData): void {}
  onPointerUp(_e: PointerData): void {}
  onPointerCancel(_e: PointerData): void {}
}
