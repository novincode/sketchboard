'use client'

import React, { useCallback, useEffect, useState } from 'react'
import type { Board } from '@sketchboard/core'
import {
  PenTool, BrushTool, EraserTool,
  PanTool, EyedropperTool, KeyboardPlugin,
  RasterLayer, VectorBrushTool, VectorPenTool, SelectTool,
} from '@sketchboard/core'
import { useBoard } from '@sketchboard/react'
import { useFreeformStore } from './store'
import { TopBar } from './components/TopBar'
import { Toolbar } from './components/Toolbar'
import { ToolOptionsPanel } from './components/ToolOptionsPanel'
import { ColorPickerPopup } from './components/ColorPickerPopup'
import { LayerPanel } from './components/LayerPanel'
import { BrushCursor } from './components/BrushCursor'
import { CanvasBackground } from './components/Background'
import { LayerMismatchPrompt } from './components/LayerMismatchPrompt'
import type { ToolId } from './types'

const LAYER_W = 3840
const LAYER_H = 2160

/** Tools that hide the OS cursor and show the custom BrushCursor instead */
const HIDE_CURSOR_TOOLS = new Set<ToolId>(['pen', 'brush', 'eraser', 'vector', 'vectorpen'])

function useFreeformSetup(board: Board | null) {
  const { _setBoard, setBrushColor } = useFreeformStore()

  useEffect(() => {
    if (!board || board.destroyed) return

    // Register all tools
    board.registerTool('select',     new SelectTool())
    board.registerTool('pen',        new PenTool())
    board.registerTool('brush',      new BrushTool())
    board.registerTool('eraser',     new EraserTool())
    board.registerTool('vector',     new VectorBrushTool())
    board.registerTool('vectorpen',  new VectorPenTool())
    board.registerTool('pan',        new PanTool())
    board.registerTool('eyedropper', new EyedropperTool())
    board.setActiveTool('pen')

    // Single keyboard plugin handles ALL shortcuts
    board.use(new KeyboardPlugin({
      // Disable pencil (not registered)
      pencil: null,
      // New tools
      selectTool:  { key: 'v', description: 'Select',       handler: (b) => b.setActiveTool('select') },
      vectorBrush: { key: 'w', description: 'Vector brush', handler: (b) => b.setActiveTool('vector') },
      vectorPen:   { key: 'q', description: 'Vector pen',   handler: (b) => b.setActiveTool('vectorpen') },
      // Delete selected vector elements
      deleteEl:    { key: 'Delete',    description: 'Delete selected', handler: (b) => b.getTool<SelectTool>('select')?.deleteSelected() },
      deleteElBS:  { key: 'Backspace', description: 'Delete selected', handler: (b) => b.getTool<SelectTool>('select')?.deleteSelected() },
      // Pen path control
      finishPath:  { key: 'Enter',  description: 'Finish path',  handler: (b) => b.getTool<VectorPenTool>('vectorpen')?.finishPath() },
      cancelPath:  { key: 'Escape', description: 'Cancel path',  handler: (b) => b.getTool<VectorPenTool>('vectorpen')?.cancelPath() },
    }))

    // CRITICAL: use setState directly — calling setActiveToolId loops back through board
    const unsubColor = board.hooks.colorPicked.tap('freeform', ({ color }) => {
      setBrushColor(color.toHex())
    })
    const unsubTool = board.hooks.toolChanged.tap('freeform', ({ name }) => {
      useFreeformStore.setState({ activeToolId: name as ToolId })
    })

    // White background raster layer, centered in viewport
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

export function FreeformTemplate() {
  const { background, showColorPicker, showLayerPanel, activeToolId } = useFreeformStore()
  const [board, setBoard] = useState<Board | null>(null)

  const handleReady  = useCallback((b: Board) => setBoard(b), [])
  const handleDestroy = useCallback(() => setBoard(null), [])

  const { containerRef } = useBoard({
    autoLayer: false,
    background: 'transparent',
    onReady: handleReady,
    onDestroy: handleDestroy,
  })

  useFreeformSetup(board)

  // Only hide OS cursor for drawing tools so Select/Pan/Eyedropper work normally
  const hideCursor = HIDE_CURSOR_TOOLS.has(activeToolId)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0d0d0d]">
      <CanvasBackground type={background} />

      {/* Board canvas + stroke overlay injected by Board into this div */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={hideCursor ? { cursor: 'none' } : undefined}
      />

      <BrushCursor />

      {/* UI chrome */}
      <TopBar />
      <ToolOptionsPanel />
      <Toolbar />

      {/* Prompts & panels */}
      <LayerMismatchPrompt />
      {showColorPicker && <ColorPickerPopup />}
      {showLayerPanel && <LayerPanel />}
    </div>
  )
}
