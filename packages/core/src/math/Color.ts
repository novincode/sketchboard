export class Color {
  constructor(
    public r: number = 0,   // 0–255
    public g: number = 0,
    public b: number = 0,
    public a: number = 255, // 0–255
  ) {}

  static black(): Color {
    return new Color(0, 0, 0, 255)
  }

  static white(): Color {
    return new Color(255, 255, 255, 255)
  }

  static transparent(): Color {
    return new Color(0, 0, 0, 0)
  }

  static fromHex(hex: string): Color {
    const n = parseInt(hex.replace('#', ''), 16)
    return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, 255)
  }

  static fromHSL(h: number, s: number, l: number, a = 1): Color {
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2
    let r = 0, g = 0, b = 0
    if (h < 60)       { r = c; g = x }
    else if (h < 120) { r = x; g = c }
    else if (h < 180) { g = c; b = x }
    else if (h < 240) { g = x; b = c }
    else if (h < 300) { r = x; b = c }
    else              { r = c; b = x }
    return new Color(
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
      Math.round(a * 255),
    )
  }

  toCSSRgba(): string {
    return `rgba(${this.r},${this.g},${this.b},${(this.a / 255).toFixed(3)})`
  }

  toHex(): string {
    return '#' + [this.r, this.g, this.b].map((v) => v.toString(16).padStart(2, '0')).join('')
  }

  withAlpha(a: number): Color {
    return new Color(this.r, this.g, this.b, Math.round(a * 255))
  }

  clone(): Color {
    return new Color(this.r, this.g, this.b, this.a)
  }
}
