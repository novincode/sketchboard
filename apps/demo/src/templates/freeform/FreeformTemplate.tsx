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
import { Toolbar } from './components/Toolbar'
import { ToolSettingsPanel } from './components/ToolSettingsPanel'
import { ColorPickerPopup } from './components/ColorPickerPopup'
import { LayerPanel } from './components/LayerPanel'
import { BrushCursor } from './components/BrushCursor'
import { CanvasBackground } from './components/Background'
import { StatusBar } from './components/StatusBar'
import type { ToolId } from './types'

// Layer size in world pixels — large enough for any viewport
const LAYER_W = 3840
const LAYER_H = 2160

// ─── Board setup hook ────────────────────────────────────────────────────────

function useFreeformSetup(board: Board | null) {
  const { _setBoard, setBrushColor } = useFreeformStore()

  useEffect(() => {
    if (!board || board.destroyed) return

    // Register all drawing tools (brush + eraser pre-registered by useBoard)
    board.registerTool('pen', new PenTool())
    board.registerTool('pencil', new PencilTool())
    board.registerTool('pan', new PanTool())
    board.registerTool('eyedropper', new EyedropperTool())
    board.setActiveTool('pen')

    // Install keyboard shortcuts (defaults cover all tools + undo/redo/[ ] size)
    board.use(new KeyboardPlugin())

    // Sync board events → store (for UI reactivity)
    // CRITICAL: use setState directly, never call setActiveToolId() here — that would
    // call board.setActiveTool() → hook fires → setActiveToolId() → infinite loop
    const unsubColor = board.hooks.colorPicked.tap('freeform', ({ color }) => {
      setBrushColor(color.toHex())
    })
    const unsubTool = board.hooks.toolChanged.tap('freeform', ({ name }) => {
      useFreeformStore.setState({ activeToolId: name as ToolId })
    })

    // Create the main drawing layer with a white background so it's visible
    const layer = new RasterLayer(LAYER_W, LAYER_H, 'Layer 1')
    layer.backgroundColor = '#ffffff'
    board.addLayer(layer)
    board.setActiveLayer(layer.id)

    // Center camera so the artboard is in the middle of the viewport
    board.camera.position.x = LAYER_W / 2
    board.camera.position.y = LAYER_H / 2

    // Hand off board reference → triggers brush settings sync
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
    autoLayer: false,     // we create our own layer in useFreeformSetup
    background: 'transparent',
    onReady: handleReady,
    onDestroy: handleDestroy,
  })

  useFreeformSetup(board)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0d0d0d]">
      {/* Dot / grid background pattern */}
      <CanvasBackground type={background} />

      {/* Board canvas */}
      <div ref={containerRef} className="absolute inset-0" style={{ cursor: 'none' }} />

      {/* Custom brush size cursor */}
      <BrushCursor />

      {/* Left floating toolbar */}
      <Toolbar />

      {/* Tool settings panel — slides out to the right of the toolbar */}
      <ToolSettingsPanel />

      {/* Color picker popup — anchored to color swatch */}
      {showColorPicker && <ColorPickerPopup />}

      {/* Layer panel — right side */}
      {showLayerPanel && <LayerPanel />}

      {/* Keyboard hint strip */}
      <StatusBar />
    </div>
  )
}
