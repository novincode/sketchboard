import type { Board } from '../Board'
import type { Plugin } from '../plugins/Plugin'
import { KeyboardManager } from './KeyboardManager'
import type { ShortcutOverrides } from './KeyboardManager'

export class KeyboardPlugin implements Plugin {
  readonly name = 'keyboard'
  private manager!: KeyboardManager

  constructor(private readonly overrides: ShortcutOverrides = {}) {}

  onInstall(board: Board): void {
    this.manager = new KeyboardManager(board, this.overrides)
  }

  onUninstall(_board: Board): void {
    this.manager.destroy()
  }

  /** Access the manager to register custom shortcuts at runtime */
  get keyboard(): KeyboardManager {
    return this.manager
  }
}
