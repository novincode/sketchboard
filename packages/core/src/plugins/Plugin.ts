import type { Board } from '../Board'

export interface Plugin {
  readonly name: string
  onInstall(board: Board): void
  onUninstall?(board: Board): void
}
