import type { Board } from '../Board'
import type { Plugin } from './Plugin'

export class PluginManager {
  private plugins = new Map<string, Plugin>()

  constructor(private board: Board) {}

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered.`)
    }
    this.plugins.set(plugin.name, plugin)
    plugin.onInstall(this.board)
  }

  unregister(name: string): void {
    const plugin = this.plugins.get(name)
    if (!plugin) return
    plugin.onUninstall?.(this.board)
    this.plugins.delete(name)
  }

  get<T extends Plugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined
  }

  has(name: string): boolean {
    return this.plugins.has(name)
  }

  destroyAll(): void {
    for (const name of [...this.plugins.keys()]) {
      this.unregister(name)
    }
  }
}
