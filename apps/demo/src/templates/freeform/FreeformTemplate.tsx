'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import { ColorPickerPopup } from './components/ColorPickerPopup'
import { LayerPanel } from './components/LayerPanel'
import { BrushCursor } from './components/BrushCursor'
import { CanvasBackground } from './components/Background'
import { LayerMismatchPrompt } from './components/LayerMismatchPrompt'
import { DrawBlockedToast } from './components/DrawBlockedToast'
import { EyedropperMagnifier } from './components/EyedropperMagnifier'
import type { ToolId } from './types'

const LAYER_W = 3840
const LAYER_H = 2160

const HIDE_CURSOR_TOOLS = new Set<ToolId>(['pen', 'brush', 'eraser', 'vector', 'vectorpen'])

function useFreeformSetup(board: Board | null) {
  const { _setBoard, setBrushColor } = useFreeformStore()

  useEffect(() => {
    if (!board || board.destroyed) return

    // 1. Register all tools
    board.registerTool('select',     new SelectTool())
    board.registerTool('pen',        new PenTool())
    board.registerTool('brush',      new BrushTool())
    board.registerTool('eraser',     new EraserTool())
    board.registerTool('vector',     new VectorBrushTool())
    board.registerTool('vectorpen',  new VectorPenTool())
    board.registerTool('pan',        new PanTool())
    board.registerTool('eyedropper', new EyedropperTool())
    board.setActiveTool('brush')

    // 2. Keyboard shortcuts via plugin (guard against hot-reload double-registration)
    if (!board.plugins.has('keyboard')) board.use(new KeyboardPlugin({
      pencil:      null,  // not registered
      pen:         { key: 'p', description: 'Raster pen', handler: (b) => b.setActiveTool('pen') },
      brush:       { key: 'b', description: 'Raster brush', handler: (b) => b.setActiveTool('brush') },
      selectTool:  { key: 'v', description: 'Select',       handler: (b) => b.setActiveTool('select') },
      vectorBrush: { key: 'w', description: 'Vector brush', handler: (b) => b.setActiveTool('vector') },
      vectorPen:   { key: 'q', description: 'Vector pen',   handler: (b) => b.setActiveTool('vectorpen') },
      deleteEl:    { key: 'Delete',    description: 'Delete selected', handler: (b) => b.getTool<SelectTool>('select')?.deleteSelected() },
      deleteElBS:  { key: 'Backspace', description: 'Delete selected', handler: (b) => b.getTool<SelectTool>('select')?.deleteSelected() },
      finishPath:  { key: 'Enter',  description: 'Finish vector path', handler: (b) => b.getTool<VectorPenTool>('vectorpen')?.finishPath() },
      cancelPath:  { key: 'Escape', description: 'Cancel path / exit edit', handler: (b) => {
        b.getTool<VectorPenTool>('vectorpen')?.cancelPath()
        b.getTool<SelectTool>('select')?.exitEditMode()
      }},
    }))

    // 3. Store hooks — subscribe BEFORE creating layers so events fire correctly
    const unsubColor = board.hooks.colorPicked.tap('freeform', ({ color }) => {
      setBrushColor(color.toHex())
    })
    const unsubTool = board.hooks.toolChanged.tap('freeform', ({ name }) => {
      useFreeformStore.setState({ activeToolId: name as ToolId })
    })

    // 4. Wire store with board (hooks registered internally here)
    _setBoard(board)

    // 5. Create layers AFTER _setBoard so hooks fire into the store correctly
    const bgLayer = new RasterLayer(LAYER_W, LAYER_H, 'Background')
    bgLayer.backgroundColor = '#ffffff'
    board.addLayer(bgLayer)

    const drawLayer = new RasterLayer(LAYER_W, LAYER_H, 'Layer 1')
    board.addLayer(drawLayer)
    board.setActiveLayer(drawLayer.id)

    // Store background layer id
    useFreeformStore.setState({ backgroundLayerId: bgLayer.id })

    // 6. Fit canvas to viewport on first mount
    const fitToViewport = () => {
      const vw = board.logicalWidth || window.innerWidth
      const vh = board.logicalHeight || window.innerHeight
      if (vw > 0 && vh > 0) {
        const zoom = Math.min((vw * 0.88) / LAYER_W, (vh * 0.88) / LAYER_H)
        board.camera.zoom = zoom
        board.camera.position.x = LAYER_W / 2
        board.camera.position.y = LAYER_H / 2
        board.markDirty()
      }
    }
    // Try immediately, then again after resize observer fires
    fitToViewport()
    const unsub = board.hooks.afterRender.tap('fit-once', () => {
      fitToViewport()
      unsub()
    })

    return () => {
      unsubColor()
      unsubTool()
      _setBoard(null)
      useFreeformStore.setState({ backgroundLayerId: null })
    }
  }, [board, _setBoard, setBrushColor])
}

// Tracks the artboard screen rect via afterRender — no React re-renders, pure DOM
function ArtboardCheckerboard({ board }: { board: Board }) {
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => {
      const el = divRef.current
      if (!el) return
      const W = board.logicalWidth, H = board.logicalHeight
      const tl = board.camera.worldToScreen(0, 0, W, H)
      const br = board.camera.worldToScreen(LAYER_W, LAYER_H, W, H)
      el.style.left = `${tl.x}px`
      el.style.top = `${tl.y}px`
      el.style.width = `${br.x - tl.x}px`
      el.style.height = `${br.y - tl.y}px`
    }
    const unsub = board.hooks.afterRender.tap('artboard-checker', update)
    update()
    return () => unsub()
  }, [board])

  return (
    <div
      ref={divRef}
      className="absolute pointer-events-none"
      style={{
        backgroundImage: `
          linear-gradient(45deg, #1e1e1e 25%, transparent 25%),
          linear-gradient(-45deg, #1e1e1e 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #1e1e1e 75%),
          linear-gradient(-45deg, transparent 75%, #1e1e1e 75%)
        `,
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
        backgroundColor: '#141414',
      }}
    />
  )
}

export function FreeformTemplate() {
  const { background, showColorPicker, showLayerPanel, activeToolId, backgroundLayerId, layers } = useFreeformStore()
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

  // Prevent Ctrl/Cmd+A from selecting all browser text while canvas is focused
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') e.preventDefault()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const hideCursor = HIDE_CURSOR_TOOLS.has(activeToolId)

  // Show transparent checker only in artboard area when background layer is hidden
  const bgLayer = layers.find((l) => l.id === backgroundLayerId)
  const bgHidden = bgLayer && !bgLayer.visible

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0d0d0d]">
      {/* Canvas background pattern (dots/grid etc.) always shown for the outer area */}
      <CanvasBackground type={background} />

      <div
        ref={containerRef}
        className="absolute inset-0"
        style={hideCursor ? { cursor: 'none' } : undefined}
      />

      {/* Checkerboard overlay clipped to artboard area when bg layer is hidden */}
      {bgHidden && board && <ArtboardCheckerboard board={board} />}

      <BrushCursor />
      <TopBar />
      <Toolbar />

      <LayerMismatchPrompt />
      <DrawBlockedToast />
      <EyedropperMagnifier />
      {showColorPicker && <ColorPickerPopup />}
      {showLayerPanel && <LayerPanel />}
    </div>
  )
}
