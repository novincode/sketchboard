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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly destroy = new Hook<any>()
}
