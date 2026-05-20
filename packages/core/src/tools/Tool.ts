import type { Board } from '../Board'
import type { PointerData } from '../types'

export abstract class Tool {
  protected board: Board | null = null

  /** Called when the tool is registered to a Board */
  attach(board: Board): void {
    this.board = board
  }

  onActivate(): void {}
  onDeactivate(): void {}

  abstract onPointerDown(e: PointerData): void
  abstract onPointerMove(e: PointerData): void
  abstract onPointerUp(e: PointerData): void
  abstract onPointerCancel(e: PointerData): void
}

export type { PointerData }
