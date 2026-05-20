import type { Board } from '../Board'
import type { BrushTool } from '../tools/BrushTool'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ShortcutDef {
  /** Single key (case-insensitive). E.g. 'b', 'z', '[', 'ArrowLeft' */
  key: string
  /** Match Cmd on macOS, Ctrl on Windows/Linux */
  cmdOrCtrl?: boolean
  shift?: boolean
  alt?: boolean
  /** Human-readable description shown in keyboard shortcut help panels */
  description: string
  handler: (board: Board, event: KeyboardEvent) => void
}

/** Well-known shortcut IDs that ship as defaults */
export type DefaultShortcutId =
  | 'pen'
  | 'brush'
  | 'pencil'
  | 'eraser'
  | 'panTool'
  | 'eyedropper'
  | 'undo'
  | 'redo'
  | 'increaseBrushSize'
  | 'decreaseBrushSize'

// ─── Helpers ────────────────────────────────────────────────────────────────

function adjustActiveBrushSize(board: Board, delta: number): void {
  const tool = board.activeTool as unknown as { settings?: { size?: number } } | null
  if (tool?.settings?.size !== undefined) {
    tool.settings.size = Math.max(1, Math.min(200, tool.settings.size + delta))
    board.markDirty()
  }
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_SHORTCUTS: Record<DefaultShortcutId, ShortcutDef> = {
  pen: { key: 'p', description: 'Pen tool', handler: (b) => b.setActiveTool('pen') },
  brush: { key: 'b', description: 'Brush tool', handler: (b) => b.setActiveTool('brush') },
  pencil: { key: 'n', description: 'Pencil tool', handler: (b) => b.setActiveTool('pencil') },
  eraser: { key: 'e', description: 'Eraser tool', handler: (b) => b.setActiveTool('eraser') },
  panTool: { key: 'h', description: 'Hand / Pan tool', handler: (b) => b.setActiveTool('pan') },
  eyedropper: { key: 'i', description: 'Eyedropper', handler: (b) => b.setActiveTool('eyedropper') },
  undo: { key: 'z', cmdOrCtrl: true, description: 'Undo', handler: (b) => b.history.undo() },
  redo: {
    key: 'z',
    cmdOrCtrl: true,
    shift: true,
    description: 'Redo',
    handler: (b) => b.history.redo(),
  },
  increaseBrushSize: {
    key: ']',
    description: 'Increase brush size',
    handler: (b) => adjustActiveBrushSize(b, 2),
  },
  decreaseBrushSize: {
    key: '[',
    description: 'Decrease brush size',
    handler: (b) => adjustActiveBrushSize(b, -2),
  },
}

// ─── KeyboardManager ────────────────────────────────────────────────────────

export type ShortcutOverrides = Partial<Record<DefaultShortcutId, ShortcutDef | null>> &
  Record<string, ShortcutDef | null | undefined>

export class KeyboardManager {
  private readonly shortcuts = new Map<string, ShortcutDef>()
  private _enabled = true

  constructor(
    private readonly board: Board,
    overrides: ShortcutOverrides = {},
  ) {
    // Load defaults, then apply overrides (null = remove)
    for (const [id, def] of Object.entries(DEFAULT_SHORTCUTS)) {
      const override = overrides[id as DefaultShortcutId]
      if (override === null) continue
      this.shortcuts.set(id, override ?? def)
    }
    // Add custom shortcuts not in defaults
    for (const [id, def] of Object.entries(overrides)) {
      if (!(id in DEFAULT_SHORTCUTS) && def != null) {
        this.shortcuts.set(id, def)
      }
    }
    window.addEventListener('keydown', this.onKeyDown)
  }

  get enabled(): boolean {
    return this._enabled
  }

  enable(): void {
    this._enabled = true
  }

  disable(): void {
    this._enabled = false
  }

  register(id: string, def: ShortcutDef): void {
    this.shortcuts.set(id, def)
  }

  remove(id: string): void {
    this.shortcuts.delete(id)
  }

  getAll(): ReadonlyMap<string, ShortcutDef> {
    return this.shortcuts
  }

  private buildCombo(def: ShortcutDef): string {
    const parts: string[] = []
    if (def.cmdOrCtrl) parts.push('cmd')
    if (def.shift) parts.push('shift')
    if (def.alt) parts.push('alt')
    parts.push(def.key.toLowerCase())
    return parts.join('+')
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this._enabled) return
    // Don't fire when focus is inside a form field
    const tag = (e.target as HTMLElement | null)?.tagName ?? ''
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const pressed: string[] = []
    if (e.metaKey || e.ctrlKey) pressed.push('cmd')
    if (e.shiftKey) pressed.push('shift')
    if (e.altKey) pressed.push('alt')
    pressed.push(e.key.toLowerCase())
    const combo = pressed.join('+')

    for (const def of this.shortcuts.values()) {
      if (this.buildCombo(def) === combo) {
        e.preventDefault()
        def.handler(this.board, e)
        return
      }
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    this.shortcuts.clear()
  }
}
