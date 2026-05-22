/**
 * Headless brush data model.
 *
 * A BrushDefinition describes HOW a brush paints — its shape, dynamics, spacing,
 * and grain. Rendering engines (raster stamp engine, vector path engine) read
 * these values and produce the actual pixels. This separation lets the same brush
 * definition work across different render backends.
 */

// ─── Raster brush ─────────────────────────────────────────────────────────────

export interface PressureCurvePoint {
  input: number    // 0–1  (input pressure)
  output: number   // 0–1  (mapped value)
}

export interface RasterBrushDefinition {
  id: string
  name: string
  /** UI grouping, e.g. "Inking", "Painting", "Texture", "Artistic" */
  category: string
  /** Short description shown in the brush picker */
  description?: string

  // ── Shape ──────────────────────────────────────────────────────────────
  /** 0 = soft gaussian edge, 1 = crisp hard edge */
  hardness: number
  /**
   * Distance between stamp centers as a fraction of the brush diameter.
   * 0.01 = stamps touching (very smooth), 0.5 = half-width gap.
   */
  spacing: number
  /**
   * Random positional scatter as a fraction of the brush size.
   * 0 = no scatter (precise), 1 = stamps can move up to 1× size away.
   */
  scatter: number
  /** Random angle variation per stamp in radians. 0 = no rotation. */
  angleJitter: number
  /** Random size variation factor. 0 = none, 0.5 = ±50% size variation. */
  sizeJitter: number

  // ── Dynamics ───────────────────────────────────────────────────────────
  pressureAffectsSize: boolean
  pressureAffectsOpacity: boolean
  velocityAffectsOpacity: boolean
  /** Optional custom pressure → size curve. null = linear. */
  pressureSizeCurve: PressureCurvePoint[] | null
  /** Optional custom pressure → opacity curve. null = linear. */
  pressureOpacityCurve: PressureCurvePoint[] | null

  // ── Rendering ──────────────────────────────────────────────────────────
  compositeOperation: GlobalCompositeOperation
  /** 0 = normal flow, 1 = airbrush-like (continuous deposition while held) */
  flowRate: number

  // ── Grain / Texture ────────────────────────────────────────────────────
  /** URL or data-URL to a greyscale grain texture. null = solid. */
  grainUrl: string | null
  grainScale: number
  grainOpacity: number
  /** Rotate grain with stroke direction */
  grainFollowsStroke: boolean
}

// ─── Vector brush ─────────────────────────────────────────────────────────────

export interface VectorBrushDefinition {
  id: string
  name: string
  category: string
  description?: string

  /** Taper at the start of the stroke (0 = blunt, 1 = pointed) */
  taperStart: number
  /** Taper at the end of the stroke */
  taperEnd: number
  pressureAffectsWidth: boolean
  /** Simulate a calligraphy nib by flattening the stroke */
  flatAngle: number | null   // radians, null = round

  compositeOperation: GlobalCompositeOperation
}

// ─── Built-in defaults ────────────────────────────────────────────────────────

export const DEFAULT_RASTER_BRUSH: RasterBrushDefinition = {
  id: 'builtin-round',
  name: 'Round Brush',
  category: 'Painting',
  description: 'Smooth round brush with pressure-sensitive size.',
  hardness: 0.85,
  spacing: 0.05,
  scatter: 0,
  angleJitter: 0,
  sizeJitter: 0,
  pressureAffectsSize: true,
  pressureAffectsOpacity: false,
  velocityAffectsOpacity: false,
  pressureSizeCurve: null,
  pressureOpacityCurve: null,
  compositeOperation: 'source-over',
  flowRate: 1,
  grainUrl: null,
  grainScale: 1,
  grainOpacity: 0,
  grainFollowsStroke: false,
}

export const DEFAULT_INK_BRUSH: RasterBrushDefinition = {
  id: 'builtin-ink',
  name: 'Ink Pen',
  category: 'Inking',
  description: 'Hard-edged ink pen. Clean lines with pressure-sensitive width.',
  hardness: 1,
  spacing: 0.02,
  scatter: 0,
  angleJitter: 0,
  sizeJitter: 0,
  pressureAffectsSize: true,
  pressureAffectsOpacity: false,
  velocityAffectsOpacity: false,
  pressureSizeCurve: null,
  pressureOpacityCurve: null,
  compositeOperation: 'source-over',
  flowRate: 1,
  grainUrl: null,
  grainScale: 1,
  grainOpacity: 0,
  grainFollowsStroke: false,
}

export const DEFAULT_SOFT_BRUSH: RasterBrushDefinition = {
  id: 'builtin-soft',
  name: 'Soft Brush',
  category: 'Painting',
  description: 'Very soft airbrush-style brush.',
  hardness: 0,
  spacing: 0.05,
  scatter: 0,
  angleJitter: 0,
  sizeJitter: 0,
  pressureAffectsSize: false,
  pressureAffectsOpacity: true,
  velocityAffectsOpacity: false,
  pressureSizeCurve: null,
  pressureOpacityCurve: null,
  compositeOperation: 'source-over',
  flowRate: 0.3,
  grainUrl: null,
  grainScale: 1,
  grainOpacity: 0,
  grainFollowsStroke: false,
}

export const DEFAULT_VECTOR_BRUSH: VectorBrushDefinition = {
  id: 'builtin-vector-round',
  name: 'Vector Round',
  category: 'Vector',
  description: 'Smooth vector brush with tapered ends.',
  taperStart: 0.15,
  taperEnd: 0.15,
  pressureAffectsWidth: true,
  flatAngle: null,
  compositeOperation: 'source-over',
}

export const DEFAULT_VECTOR_CALLIGRAPHY: VectorBrushDefinition = {
  id: 'builtin-vector-calli',
  name: 'Calligraphy',
  category: 'Vector',
  description: 'Flat nib calligraphy brush.',
  taperStart: 0.1,
  taperEnd: 0.1,
  pressureAffectsWidth: true,
  flatAngle: Math.PI / 4,  // 45° nib angle
  compositeOperation: 'source-over',
}
