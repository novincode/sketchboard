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
}

export function useBoard(options: UseBoardOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<Board | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || boardRef.current) return

    const { layerWidth = 1920, layerHeight = 1080, autoLayer = true, ...boardOptions } = options
    const board = new Board(container, boardOptions)
    boardRef.current = board

    board.registerTool('brush', new BrushTool())
    board.registerTool('eraser', new EraserTool())
    board.setActiveTool('brush')

    if (autoLayer) {
      const layer = new RasterLayer(layerWidth, layerHeight, 'Layer 1')
      board.addLayer(layer)
      board.setActiveLayer(layer.id)
    }

    return () => {
      board.destroy()
      boardRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getBoard = useCallback((): Board | null => boardRef.current, [])

  return { containerRef, getBoard }
}
