import { Vec2 } from './math/Vec2'

export class Camera {
  /** World-space point shown at the center of the viewport */
  position: Vec2 = Vec2.zero()
  zoom: number = 1       // how many canvas pixels represent 1 world unit
  rotation: number = 0   // radians

  /** Convert screen pixel coords → world coords */
  screenToWorld(sx: number, sy: number, canvasW: number, canvasH: number): Vec2 {
    const cx = sx - canvasW / 2
    const cy = sy - canvasH / 2
    const cos = Math.cos(-this.rotation)
    const sin = Math.sin(-this.rotation)
    return new Vec2(
      (cx * cos - cy * sin) / this.zoom + this.position.x,
      (cx * sin + cy * cos) / this.zoom + this.position.y,
    )
  }

  /** Convert world coords → screen pixel coords */
  worldToScreen(wx: number, wy: number, canvasW: number, canvasH: number): Vec2 {
    const dx = wx - this.position.x
    const dy = wy - this.position.y
    const cos = Math.cos(this.rotation)
    const sin = Math.sin(this.rotation)
    return new Vec2(
      (dx * cos - dy * sin) * this.zoom + canvasW / 2,
      (dx * sin + dy * cos) * this.zoom + canvasH / 2,
    )
  }

  /** Zoom toward a screen-space point (sx, sy) by a multiplicative factor */
  zoomAt(factor: number, sx: number, sy: number, canvasW: number, canvasH: number): void {
    const before = this.screenToWorld(sx, sy, canvasW, canvasH)
    this.zoom = Math.max(0.01, this.zoom * factor)
    const after = this.screenToWorld(sx, sy, canvasW, canvasH)
    this.position.x += before.x - after.x
    this.position.y += before.y - after.y
  }

  /** Pan by screen-space delta (dx, dy) */
  pan(dx: number, dy: number): void {
    this.position.x -= dx / this.zoom
    this.position.y -= dy / this.zoom
  }

  /** Apply this camera's transform to a 2D rendering context */
  applyToContext(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
    ctx.translate(canvasW / 2, canvasH / 2)
    ctx.rotate(this.rotation)
    ctx.scale(this.zoom, this.zoom)
    ctx.translate(-this.position.x, -this.position.y)
  }

  clone(): Camera {
    const c = new Camera()
    c.position = this.position.clone()
    c.zoom = this.zoom
    c.rotation = this.rotation
    return c
  }
}
