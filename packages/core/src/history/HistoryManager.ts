export interface HistoryEntry {
  undo(): void
  redo(): void
}

export class HistoryManager {
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []

  constructor(
    private readonly markDirty: () => void,
    private readonly maxSize = 64,
  ) {}

  push(entry: HistoryEntry): void {
    this.past.push(entry)
    this.future = []
    if (this.past.length > this.maxSize) {
      this.past.shift()
    }
  }

  undo(): boolean {
    const entry = this.past.pop()
    if (!entry) return false
    entry.undo()
    this.future.push(entry)
    this.markDirty()
    return true
  }

  redo(): boolean {
    const entry = this.future.pop()
    if (!entry) return false
    entry.redo()
    this.past.push(entry)
    this.markDirty()
    return true
  }

  canUndo(): boolean {
    return this.past.length > 0
  }

  canRedo(): boolean {
    return this.future.length > 0
  }

  clear(): void {
    this.past = []
    this.future = []
  }
}
