'use client'

import React, { forwardRef, useCallback, useImperativeHandle } from 'react'
import { useBoard } from '../hooks/useBoard'
import type { Board } from '@sketchboard/core'
import type { UseBoardOptions } from '../hooks/useBoard'

export interface BoardCanvasRef {
  getBoard(): Board | null
}

export interface BoardCanvasProps extends React.HTMLAttributes<HTMLDivElement> {
  boardOptions?: UseBoardOptions
  onReady?: (board: Board) => void
}

export const BoardCanvas = forwardRef<BoardCanvasRef, BoardCanvasProps>(
  ({ boardOptions, onReady, style, ...rest }, ref) => {
    const { containerRef, getBoard } = useBoard(boardOptions)

    useImperativeHandle(ref, () => ({ getBoard }), [getBoard])

    const setRef = useCallback(
      (el: HTMLDivElement | null) => {
        ;(containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
        if (el && onReady) {
          // board is initialized in the useEffect; use a microtask to let it mount
          Promise.resolve().then(() => {
            const board = getBoard()
            if (board) onReady(board)
          })
        }
      },
      [containerRef, getBoard, onReady],
    )

    return (
      <div
        ref={setRef}
        style={{ width: '100%', height: '100%', overflow: 'hidden', ...style }}
        {...rest}
      />
    )
  },
)

BoardCanvas.displayName = 'BoardCanvas'
