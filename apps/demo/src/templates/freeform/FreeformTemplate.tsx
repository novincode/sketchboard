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

    board.use(new KeyboardPlugin())

    // Keyboard shortcuts for new tools
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const map: Record<string, string> = {
        v: 'select', p: 'pen', b: 'brush', e: 'eraser',
        w: 'vector', q: 'vectorpen', h: 'pan', i: 'eyedropper',
      }
      const toolId = map[e.key.toLowerCase()]
      if (toolId && !e.metaKey && !e.ctrlKey) {
        board.setActiveTool(toolId)
      }
      // Delete selected (when SelectTool is active)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey) {
        const selectTool = board.getTool<SelectTool>('select')
        selectTool?.deleteSelected()
      }
      // Finish vectorpen path on Enter, cancel on Escape
      if (e.key === 'Enter') board.getTool<VectorPenTool>('vectorpen')?.finishPath()
      if (e.key === 'Escape') board.getTool<VectorPenTool>('vectorpen')?.cancelPath()
    }
    window.addEventListener('keydown', onKeyDown)

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
      window.removeEventListener('keydown', onKeyDown)
      _setBoard(null)
    }
  }, [board, _setBoard, setBrushColor])
}

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

      {/* Board canvas + stroke overlay injected into this div */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ cursor: 'none' }}
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
