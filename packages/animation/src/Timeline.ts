import type { Board } from '@sketchboard/core'
import { KeyframeTrack } from './KeyframeTrack'
import type { EasingFn } from './Easing'
import { Easing } from './Easing'

/** Animatable layer properties */
const LAYER_PROPS = new Set(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity', 'zDepth'])
/** Animatable camera properties */
const CAMERA_PROPS = new Set(['zoom', 'rotation', 'positionX', 'positionY'])

export class Timeline {
  private tracks = new Map<string, KeyframeTrack>()
  private _currentTime = 0
  private _duration: number
  private _fps: number
  private _playing = false
  private _loop: boolean
  private rafId: number | null = null
  private lastTimestamp: number | null = null

  readonly onTimeChange?: (time: number) => void

  constructor(
    private readonly board: Board,
    options: { duration?: number; fps?: number; loop?: boolean } = {},
  ) {
    this._duration = options.duration ?? 5
    this._fps = options.fps ?? 24
    this._loop = options.loop ?? true
  }

  // ─── Getters / Setters ─────────────────────────────────────────────────────

  get currentTime(): number {
    return this._currentTime
  }

  get duration(): number {
    return this._duration
  }

  set duration(v: number) {
    this._duration = Math.max(0.1, v)
  }

  get fps(): number {
    return this._fps
  }

  set fps(v: number) {
    this._fps = Math.max(1, Math.min(120, v))
  }

  get isPlaying(): boolean {
    return this._playing
  }

  // ─── Keyframe API ──────────────────────────────────────────────────────────

  setKeyframe(
    targetId: string,
    property: string,
    time: number,
    value: number,
    easing: EasingFn = Easing.linear,
  ): void {
    const key = `${targetId}.${property}`
    if (!this.tracks.has(key)) {
      this.tracks.set(key, new KeyframeTrack(targetId, property))
    }
    this.tracks.get(key)!.setKeyframe(time, value, easing)
  }

  removeKeyframe(targetId: string, property: string, time: number): void {
    this.tracks.get(`${targetId}.${property}`)?.removeKeyframe(time)
  }

  getTracks(): IterableIterator<KeyframeTrack> {
    return this.tracks.values()
  }

  // ─── Playback ──────────────────────────────────────────────────────────────

  play(): void {
    if (this._playing) return
    this._playing = true
    this.lastTimestamp = null
    this.rafId = requestAnimationFrame(this.tick)
  }

  pause(): void {
    if (!this._playing) return
    this._playing = false
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  stop(): void {
    this.pause()
    this.seek(0)
  }

  seek(time: number): void {
    this._currentTime = Math.max(0, Math.min(this._duration, time))
    this.applyAllTracks(this._currentTime)
    this.board.markDirty()
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private tick = (ts: number): void => {
    if (!this._playing) return
    if (this.lastTimestamp === null) this.lastTimestamp = ts
    const delta = (ts - this.lastTimestamp) / 1000
    this.lastTimestamp = ts

    this._currentTime += delta
    if (this._currentTime >= this._duration) {
      this._currentTime = this._loop ? 0 : this._duration
      if (!this._loop) {
        this.pause()
        this.applyAllTracks(this._currentTime)
        this.board.markDirty()
        return
      }
    }

    this.applyAllTracks(this._currentTime)
    this.board.markDirty()
    this.rafId = requestAnimationFrame(this.tick)
  }

  private applyAllTracks(time: number): void {
    for (const track of this.tracks.values()) {
      const value = track.evaluate(time)
      if (value === undefined) continue
      this.applyValue(track.targetId, track.property, value)
    }
  }

  private applyValue(targetId: string, property: string, value: number): void {
    if (targetId === '__camera__') {
      if (!CAMERA_PROPS.has(property)) return
      const cam = this.board.camera
      switch (property) {
        case 'zoom': cam.zoom = value; break
        case 'rotation': cam.rotation = value; break
        case 'positionX': cam.position.x = value; break
        case 'positionY': cam.position.y = value; break
      }
      return
    }

    const layer = this.board.getLayerById(targetId)
    if (!layer || !LAYER_PROPS.has(property)) return
    switch (property) {
      case 'x': layer.transform.x = value; break
      case 'y': layer.transform.y = value; break
      case 'rotation': layer.transform.rotation = value; break
      case 'scaleX': layer.transform.scaleX = value; break
      case 'scaleY': layer.transform.scaleY = value; break
      case 'opacity': layer.opacity = Math.max(0, Math.min(1, value)); break
      case 'zDepth': layer.transform.zDepth = value; break
    }
  }

  destroy(): void {
    this.pause()
    this.tracks.clear()
  }
}
