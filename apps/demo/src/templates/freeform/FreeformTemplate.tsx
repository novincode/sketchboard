'use client'

import React, { useEffect, useState } from 'react'
import {
  Board,
  PenTool,
  PencilTool,
  PanTool,
  EyedropperTool,
  RasterLayer,
  KeyboardPlugin,
} from '@sketchboard/core'
import { useBoard } from '@sketchboard/react'
import { useFreeformStore } from './store'
import { Toolbar } from './components/Toolbar'
import { ColorPickerPopup } from './components/ColorPickerPopup'
import { BrushPanel } from './components/BrushPanel'
import { CanvasBackground } from './components/Background'
import { StatusBar } from './components/StatusBar'
import type { ToolId } from './types'

// ─── Board setup ─────────────────────────────────────────────────────────────

function useFreeformSetup(board: Board | null) {
  const { _setBoard, setBrushColor } = useFreeformStore()

  useEffect(() => {
    if (!board) return

    // Register extra tools on top of the defaults from useBoard
    board.registerTool('pen', new PenTool())
    board.registerTool('pencil', new PencilTool())
    board.registerTool('pan', new PanTool())
    board.registerTool('eyedropper', new EyedropperTool())
    board.setActiveTool('pen')

    // Keyboard shortcuts — default set covers all tools + undo/redo/size
    board.use(new KeyboardPlugin())

    // Sync board events → store (for UI reactivity)
    const unsubColor = board.hooks.colorPicked.tap('freeform', ({ color }) => {
      setBrushColor(color.toHex())
    })
    // Sync tool changes FROM board back to store (keyboard shortcuts, etc.)
    // Use setState directly to avoid calling board.setActiveTool() again (infinite loop)
    const unsubTool = board.hooks.toolChanged.tap('freeform', ({ name }) => {
      useFreeformStore.setState({ activeToolId: name as ToolId })
    })

    // Large world-space drawing layer
    const layer = new RasterLayer(3840, 2160, 'Drawing')
    board.addLayer(layer)
    board.setActiveLayer(layer.id)

    // Hand off to store — triggers initial brush settings sync
    _setBoard(board)

    return () => {
      unsubColor()
      unsubTool()
      _setBoard(null)
    }
  }, [board, _setBoard, setBrushColor])
}

// ─── Template ────────────────────────────────────────────────────────────────

export function FreeformTemplate() {
  const { background, showColorPicker, showBrushPanel } = useFreeformStore()
  const [board, setBoard] = useState<Board | null>(null)

  const { containerRef } = useBoard({
    // We register our own layer in useFreeformSetup
    autoLayer: false,
    background: 'transparent',
    onReady: setBoard,
  })

  useFreeformSetup(board)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0d0d0d]">
      {/* Dot / grid background pattern */}
      <CanvasBackground type={background} />

      {/* Drawing canvas — Board mounts a <canvas> inside this div */}
      <div ref={containerRef} className="absolute inset-0" style={{ cursor: 'crosshair' }} />

      {/* Floating toolbar */}
      <Toolbar />

      {/* Pop-over panels */}
      {showColorPicker && <ColorPickerPopup />}
      {showBrushPanel && <BrushPanel />}

      {/* Hint bar */}
      <StatusBar />
    </div>
  )
}
