export type BlendMode =
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

export interface BoardOptions {
  /** Background color of the canvas — defaults to transparent */
  background?: string
  /** Pixel ratio override — defaults to window.devicePixelRatio */
  pixelRatio?: number
}

export interface PointerData {
  /** Canvas-relative X in logical (CSS) pixels */
  x: number
  /** Canvas-relative Y in logical (CSS) pixels */
  y: number
  /** Normalized pressure 0–1. Mouse always 0.5 */
  pressure: number
  tiltX: number
  tiltY: number
  pointerId: number
  pointerType: 'mouse' | 'pen' | 'touch'
  timeStamp: number
}
