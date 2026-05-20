import type { Board, Plugin } from '@sketchboard/core'
import { Timeline } from './Timeline'

export interface AnimationPluginOptions {
  duration?: number
  fps?: number
  loop?: boolean
}

export class AnimationPlugin implements Plugin {
  readonly name = 'animation'
  timeline!: Timeline

  constructor(private readonly options: AnimationPluginOptions = {}) {}

  onInstall(board: Board): void {
    this.timeline = new Timeline(board, this.options)
  }

  onUninstall(_board: Board): void {
    this.timeline.destroy()
  }
}
