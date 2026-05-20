import type { EasingFn } from './Easing'
import { Easing } from './Easing'

export interface Keyframe {
  time: number
  value: number
  easing: EasingFn
}

export class KeyframeTrack {
  private keyframes: Keyframe[] = []

  constructor(
    readonly targetId: string,
    readonly property: string,
  ) {}

  setKeyframe(time: number, value: number, easing: EasingFn = Easing.linear): void {
    const idx = this.keyframes.findIndex((k) => k.time === time)
    if (idx >= 0) {
      this.keyframes[idx] = { time, value, easing }
    } else {
      this.keyframes.push({ time, value, easing })
      this.keyframes.sort((a, b) => a.time - b.time)
    }
  }

  removeKeyframe(time: number): boolean {
    const len = this.keyframes.length
    this.keyframes = this.keyframes.filter((k) => k.time !== time)
    return this.keyframes.length < len
  }

  evaluate(time: number): number | undefined {
    if (this.keyframes.length === 0) return undefined

    const first = this.keyframes[0]!
    const last = this.keyframes[this.keyframes.length - 1]!

    if (time <= first.time) return first.value
    if (time >= last.time) return last.value

    let lo = 0
    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (this.keyframes[i]!.time <= time && this.keyframes[i + 1]!.time >= time) {
        lo = i
        break
      }
    }

    const prev = this.keyframes[lo]!
    const next = this.keyframes[lo + 1]!
    const localT = (time - prev.time) / (next.time - prev.time)
    const easedT = prev.easing(localT)

    return prev.value + (next.value - prev.value) * easedT
  }

  getKeyframes(): readonly Keyframe[] {
    return this.keyframes
  }

  clear(): void {
    this.keyframes = []
  }
}
