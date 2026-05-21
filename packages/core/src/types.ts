export type BlendMode =
  | 'source-over'
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export interface BoardOptions {
  /** Background fill of the main canvas — CSS color or 'transparent'. Default: transparent */
  background?: string
  /** Pixel ratio override — defaults to window.devicePixelRatio */
  pixelRatio?: number
  /**
   * Maximum number of undo steps kept in memory.
   * Each step stores one ImageData snapshot per affected layer.
   * Default: 64
   */
  historySize?: number
}

export interface PointerData {
  /** Canvas-relative X in logical CSS pixels */
  x: number
  /** Canvas-relative Y in logical CSS pixels */
  y: number
  /** Normalized pressure 0–1. Mouse always 0.5 when pressed */
  pressure: number
  tiltX: number
  tiltY: number
  pointerId: number
  pointerType: 'mouse' | 'pen' | 'touch'
  timeStamp: number
}
