import type { RasterBrushDefinition, VectorBrushDefinition } from './BrushDefinition'
import {
  DEFAULT_RASTER_BRUSH,
  DEFAULT_INK_BRUSH,
  DEFAULT_SOFT_BRUSH,
  DEFAULT_VECTOR_BRUSH,
  DEFAULT_VECTOR_CALLIGRAPHY,
} from './BrushDefinition'

/**
 * Registry that stores and manages brush definitions.
 *
 * Each Board instance has its own BrushRegistry so brushes can be scoped to a
 * document. Global defaults are pre-registered on construction.
 *
 * All mutation methods return `this` for chaining.
 */
export class BrushRegistry {
  private rasterBrushes = new Map<string, RasterBrushDefinition>()
  private vectorBrushes = new Map<string, VectorBrushDefinition>()

  constructor() {
    // Register built-in brushes
    this.registerRaster(DEFAULT_RASTER_BRUSH)
      .registerRaster(DEFAULT_INK_BRUSH)
      .registerRaster(DEFAULT_SOFT_BRUSH)
      .registerVector(DEFAULT_VECTOR_BRUSH)
      .registerVector(DEFAULT_VECTOR_CALLIGRAPHY)
  }

  // ── Registration ──────────────────────────────────────────────────────────

  registerRaster(def: RasterBrushDefinition): this {
    this.rasterBrushes.set(def.id, { ...def })
    return this
  }

  registerVector(def: VectorBrushDefinition): this {
    this.vectorBrushes.set(def.id, { ...def })
    return this
  }

  unregisterRaster(id: string): boolean { return this.rasterBrushes.delete(id) }
  unregisterVector(id: string): boolean { return this.vectorBrushes.delete(id) }

  // ── Lookup ────────────────────────────────────────────────────────────────

  getRaster(id: string): RasterBrushDefinition | undefined { return this.rasterBrushes.get(id) }
  getVector(id: string): VectorBrushDefinition | undefined { return this.vectorBrushes.get(id) }
  hasRaster(id: string): boolean { return this.rasterBrushes.has(id) }
  hasVector(id: string): boolean { return this.vectorBrushes.has(id) }

  listRaster(): RasterBrushDefinition[] { return [...this.rasterBrushes.values()] }
  listVector(): VectorBrushDefinition[] { return [...this.vectorBrushes.values()] }

  listRasterByCategory(): Map<string, RasterBrushDefinition[]> {
    const map = new Map<string, RasterBrushDefinition[]>()
    for (const b of this.rasterBrushes.values()) {
      const arr = map.get(b.category) ?? []
      arr.push(b)
      map.set(b.category, arr)
    }
    return map
  }

  listVectorByCategory(): Map<string, VectorBrushDefinition[]> {
    const map = new Map<string, VectorBrushDefinition[]>()
    for (const b of this.vectorBrushes.values()) {
      const arr = map.get(b.category) ?? []
      arr.push(b)
      map.set(b.category, arr)
    }
    return map
  }

  // ── Duplication / editing ─────────────────────────────────────────────────

  duplicateRaster(sourceId: string, newId: string, newName: string): RasterBrushDefinition | null {
    const src = this.getRaster(sourceId)
    if (!src) return null
    const dup: RasterBrushDefinition = { ...src, id: newId, name: newName }
    this.registerRaster(dup)
    return dup
  }

  duplicateVector(sourceId: string, newId: string, newName: string): VectorBrushDefinition | null {
    const src = this.getVector(sourceId)
    if (!src) return null
    const dup: VectorBrushDefinition = { ...src, id: newId, name: newName }
    this.registerVector(dup)
    return dup
  }

  updateRaster(id: string, patch: Partial<RasterBrushDefinition>): boolean {
    const existing = this.getRaster(id)
    if (!existing) return false
    this.rasterBrushes.set(id, { ...existing, ...patch, id })
    return true
  }

  updateVector(id: string, patch: Partial<VectorBrushDefinition>): boolean {
    const existing = this.getVector(id)
    if (!existing) return false
    this.vectorBrushes.set(id, { ...existing, ...patch, id })
    return true
  }

  // ── Import / Export ───────────────────────────────────────────────────────

  exportBrush(id: string, type: 'raster' | 'vector'): string | null {
    const brush = type === 'raster' ? this.getRaster(id) : this.getVector(id)
    if (!brush) return null
    return JSON.stringify({ __type: type, ...brush }, null, 2)
  }

  importBrush(json: string): RasterBrushDefinition | VectorBrushDefinition | null {
    try {
      const data = JSON.parse(json) as { __type?: 'raster' | 'vector' }
      const type = data.__type ?? 'raster'
      if (type === 'raster') {
        const { __type: _, ...brush } = data as { __type: string } & RasterBrushDefinition
        this.registerRaster(brush)
        return brush
      } else {
        const { __type: _, ...brush } = data as { __type: string } & VectorBrushDefinition
        this.registerVector(brush)
        return brush
      }
    } catch {
      return null
    }
  }

  exportAll(): string {
    return JSON.stringify({
      raster: this.listRaster(),
      vector: this.listVector(),
    }, null, 2)
  }

  importAll(json: string): void {
    try {
      const data = JSON.parse(json) as {
        raster?: RasterBrushDefinition[]
        vector?: VectorBrushDefinition[]
      }
      for (const b of data.raster ?? []) this.registerRaster(b)
      for (const b of data.vector ?? []) this.registerVector(b)
    } catch { /* ignore malformed */ }
  }
}
