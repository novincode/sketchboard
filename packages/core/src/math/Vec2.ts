export class Vec2 {
  constructor(public x: number = 0, public y: number = 0) {}

  static zero(): Vec2 {
    return new Vec2(0, 0)
  }

  static from(x: number, y: number): Vec2 {
    return new Vec2(x, y)
  }

  add(other: Vec2): Vec2 {
    return new Vec2(this.x + other.x, this.y + other.y)
  }

  sub(other: Vec2): Vec2 {
    return new Vec2(this.x - other.x, this.y - other.y)
  }

  scale(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s)
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  normalize(): Vec2 {
    const l = this.length()
    return l === 0 ? Vec2.zero() : this.scale(1 / l)
  }

  dot(other: Vec2): number {
    return this.x * other.x + this.y * other.y
  }

  lerp(other: Vec2, t: number): Vec2 {
    return new Vec2(this.x + (other.x - this.x) * t, this.y + (other.y - this.y) * t)
  }

  distanceTo(other: Vec2): number {
    return this.sub(other).length()
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y)
  }

  toArray(): [number, number] {
    return [this.x, this.y]
  }
}
