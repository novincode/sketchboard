import { Tool } from './Tool'
import { Color } from '../math/Color'
import type { PointerData } from '../types'

export class EyedropperTool extends Tool {
  private _sampling = false

  onActivate(): void {
    if (this.board) this.board.canvas.style.cursor = 'crosshair'
  }

  onDeactivate(): void {
    if (this.board) this.board.canvas.style.cursor = ''
    this._sampling = false
  }

  onPointerDown(e: PointerData): void {
    this._sampling = true
    this._sample(e.x, e.y)
  }

  onPointerMove(e: PointerData): void {
    if (!this._sampling) return
    this._sample(e.x, e.y)
  }

  onPointerUp(e: PointerData): void {
    if (this._sampling) this._sample(e.x, e.y)
    this._sampling = false
  }

  onPointerCancel(_e: PointerData): void {
    this._sampling = false
  }

  private _sample(x: number, y: number): void {
    if (!this.board) return
    const { canvas } = this.board
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio ?? 1
    const px = Math.round(x * dpr)
    const py = Math.round(y * dpr)
    const { data } = ctx.getImageData(px, py, 1, 1)
    const color = new Color(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 255)
    this.board.hooks.colorPicked.call({ color })
  }
}
