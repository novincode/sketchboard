import { useEffect, useRef, useCallback } from 'react'
import { Board, BrushTool, EraserTool, RasterLayer } from '@sketchboard/core'
import type { BoardOptions } from '@sketchboard/core'

export interface UseBoardOptions extends BoardOptions {
  /** Width of the initial raster layer in world pixels */
  layerWidth?: number
  /** Height of the initial raster layer in world pixels */
  layerHeight?: number
  /** Whether to create an initial raster layer automatically */
  autoLayer?: boolean
  /**
   * Called once when the Board is fully mounted and tools/layer are ready.
   * Use this to register additional tools, plugins, and hook listeners.
   */
  onReady?: (board: Board) => void
  /**
   * Called just before the Board is destroyed (e.g., component unmount or
   * React Strict Mode's double-invoke cleanup). Use this to clear any
   * state references to the old Board instance.
   */
  onDestroy?: () => void
}

export function useBoard(options: UseBoardOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<Board | null>(null)
  // Stable refs so effect doesn't re-run when callbacks change identity
  const onReadyRef = useRef(options.onReady)
  const onDestroyRef = useRef(options.onDestroy)
  onReadyRef.current = options.onReady
  onDestroyRef.current = options.onDestroy

  useEffect(() => {
    const container = containerRef.current
    if (!container || boardRef.current) return

    const {
      layerWidth = 1920,
      layerHeight = 1080,
      autoLayer = true,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onReady: _onReady,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onDestroy: _onDestroy,
      ...boardOptions
    } = options

    const board = new Board(container, boardOptions)
    boardRef.current = board

    // Register default tools so keyboard shortcuts resolve them
    board.registerTool('brush', new BrushTool())
    board.registerTool('eraser', new EraserTool())
    board.setActiveTool('brush')

    if (autoLayer) {
      const layer = new RasterLayer(layerWidth, layerHeight, 'Layer 1')
      board.addLayer(layer)
      board.setActiveLayer(layer.id)
    }

    onReadyRef.current?.(board)

    return () => {
      onDestroyRef.current?.()
      board.destroy()
      boardRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getBoard = useCallback((): Board | null => boardRef.current, [])

  return { containerRef, getBoard }
}
