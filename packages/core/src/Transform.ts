export class Transform {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public rotation: number = 0, // radians
    public scaleX: number = 1,
    public scaleY: number = 1,
    public zDepth: number = 0,   // reserved for future 3D layer depth
  ) {}

  static identity(): Transform {
    return new Transform()
  }

  applyToContext(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.scale(this.scaleX, this.scaleY)
  }

  clone(): Transform {
    return new Transform(this.x, this.y, this.rotation, this.scaleX, this.scaleY, this.zDepth)
  }
}
