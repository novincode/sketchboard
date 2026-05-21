'use client'

import React, { useCallback, useEffect, useState } from 'react'
import type { Board } from '@sketchboard/core'
import {
  PenTool,
  PencilTool,
  PanTool,
  EyedropperTool,
  RasterLayer,
  KeyboardPlugin,
} from '@sketchboard/core'
import { useBoard } from '@sketchboard/react'
import { useFreeformStore } from './store'
import { TopBar } from './components/TopBar'
import { Toolbar } from './components/Toolbar'
import { SideControls } from './components/SideControls'
import { ColorPickerPopup } from './components/ColorPickerPopup'
import { LayerPanel } from './components/LayerPanel'
import { BrushCursor } from './components/BrushCursor'
import { CanvasBackground } from './components/Background'
import type { ToolId } from './types'

const LAYER_W = 3840
const LAYER_H = 2160

// ─── Board setup ─────────────────────────────────────────────────────────────

function useFreeformSetup(board: Board | null) {
  const { _setBoard, setBrushColor } = useFreeformStore()

  useEffect(() => {
    if (!board || board.destroyed) return

    board.registerTool('pen', new PenTool())
    board.registerTool('pencil', new PencilTool())
    board.registerTool('pan', new PanTool())
    board.registerTool('eyedropper', new EyedropperTool())
    board.setActiveTool('pen')

    board.use(new KeyboardPlugin())

    // CRITICAL: use setState directly — calling setActiveToolId would loop back through board
    const unsubColor = board.hooks.colorPicked.tap('freeform', ({ color }) => {
      setBrushColor(color.toHex())
    })
    const unsubTool = board.hooks.toolChanged.tap('freeform', ({ name }) => {
      useFreeformStore.setState({ activeToolId: name as ToolId })
    })

    // White-background drawing layer centered in viewport
    const layer = new RasterLayer(LAYER_W, LAYER_H, 'Layer 1')
    layer.backgroundColor = '#ffffff'
    board.addLayer(layer)
    board.setActiveLayer(layer.id)
    board.camera.position.x = LAYER_W / 2
    board.camera.position.y = LAYER_H / 2

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
  const { background, showColorPicker, showLayerPanel } = useFreeformStore()
  const [board, setBoard] = useState<Board | null>(null)

  const handleReady = useCallback((b: Board) => setBoard(b), [])
  const handleDestroy = useCallback(() => setBoard(null), [])

  const { containerRef } = useBoard({
    autoLayer: false,
    background: 'transparent',
    onReady: handleReady,
    onDestroy: handleDestroy,
  })

  useFreeformSetup(board)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0d0d0d]">
      <CanvasBackground type={background} />

      {/* Board canvas + stroke overlay — both injected by Board into this div */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ cursor: 'none' }}
      />

      {/* Custom brush cursor */}
      <BrushCursor />

      {/* UI chrome */}
      <TopBar />
      <SideControls />
      <Toolbar />

      {/* Panels */}
      {showColorPicker && <ColorPickerPopup />}
      {showLayerPanel && <LayerPanel />}
    </div>
  )
}
