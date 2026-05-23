import type { Color } from '../math/Color'

type Listener<T> = (payload: T) => void

class Hook<T = void> {
  private listeners: Array<Listener<T>> = []

  tap(_name: string, listener: Listener<T>): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  call(payload: T): void {
    for (const listener of this.listeners) listener(payload)
  }
}

export type DrawBlockedReason = 'layer-hidden' | 'wrong-layer-type' | 'no-active-layer'

/** Typed event hooks exposed by Board to plugins and tools */
export class BoardHooks {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly beforeRender = new Hook<any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly afterRender = new Hook<any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly layerAdded = new Hook<any>()
  readonly layerRemoved = new Hook<{ id: string }>()
  readonly toolChanged = new Hook<{ name: string }>()
  readonly activeLayerChanged = new Hook<{ id: string | null }>()
  /** Fired by EyedropperTool (or any plugin) when a color is sampled */
  readonly colorPicked = new Hook<{ color: Color }>()
  /** Fired when a tool attempts to draw but is blocked (e.g. hidden/wrong layer) */
  readonly drawBlocked = new Hook<{ reason: DrawBlockedReason }>()
  /**
   * Generic tool preview hook — fired by tools that have transient state
   * worth showing in the UI (e.g. FillTool drag-to-adjust tolerance).
   * `tool` is the registered tool name, `data` is tool-specific.
   * Use `kind` to discriminate. UI listeners filter on it.
   */
  readonly toolPreview = new Hook<{ tool: string; kind: string; data: Record<string, number | string | boolean> }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly destroy = new Hook<any>()
}
