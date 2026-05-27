'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Board } from '@sketchboard/core'
import {
  PenTool, BrushTool, EraserTool,
  PanTool, EyedropperTool, KeyboardPlugin,
  RasterLayer, VectorLayer, VectorBrushTool, VectorPenTool, SelectTool,
  FillTool, LassoSelectTool, ShapeTool,
} from '@sketchboard/core'
import { useBoard } from '@sketchboard/react'
import { useFreeformStore, resolveBaseTool } from './store'
import { buildToolShortcuts } from './toolDefs'
import { TopBar } from './components/TopBar'
import { Toolbar } from './components/Toolbar'
import { ColorPickerPopup } from './components/ColorPickerPopup'
import { LayerPanel } from './components/LayerPanel'
import { BrushCursor } from './components/BrushCursor'
import { CanvasBackground } from './components/Background'
import { LayerMismatchPrompt } from './components/LayerMismatchPrompt'
import { DrawBlockedToast } from './components/DrawBlockedToast'
import { EyedropperMagnifier } from './components/EyedropperMagnifier'
import { FillToleranceHud } from './components/FillToleranceHud'
import { CanvasContextMenu } from './components/CanvasContextMenu'
import { ColorDropOverlay } from './components/ColorDropOverlay'
import { StickyModifierDock } from './components/StickyModifierDock'
import { VectorStylePanel } from './components/VectorStylePanel'
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
    board.registerTool('lasso',      new LassoSelectTool())
    board.registerTool('pen',        new PenTool())
    board.registerTool('brush',      new BrushTool())
    board.registerTool('eraser',     new EraserTool())
    board.registerTool('fill',       new FillTool())
    board.registerTool('shape',      new ShapeTool())
    board.registerTool('vector',     new VectorBrushTool())
    board.registerTool('vectorpen',  new VectorPenTool())
    board.registerTool('pan',        new PanTool())
    board.registerTool('eyedropper', new EyedropperTool())
    board.setActiveTool('brush')

    // 2. Keyboard shortcuts via plugin (guard against hot-reload double-registration)
    // Tool slot shortcuts are AUTO-GENERATED from TOOLBAR_SLOTS via
    // `buildToolShortcuts` — single source of truth lives in toolDefs.tsx.
    // Special non-tool actions (Delete, Copy, Group, etc.) are spelled out
    // inline below.
    const autoShortcuts = buildToolShortcuts({
      activate: (id) => useFreeformStore.getState().setActiveToolId(id),
      getActive: () => useFreeformStore.getState().activeToolId,
    })
    if (!board.plugins.has('keyboard')) board.use(new KeyboardPlugin({
      pencil:      null,
      pen:         null,
      brush:       null,
      ...autoShortcuts,
      deleteEl:    { key: 'Delete',    description: 'Delete selected', handler: (b) => b.getTool<SelectTool>('select')?.deleteSelected() },
      deleteElBS:  { key: 'Backspace', description: 'Delete selected', handler: (b) => b.getTool<SelectTool>('select')?.deleteSelected() },
      finishPath:  { key: 'Enter',  description: 'Finish vector path', handler: (b) => b.getTool<VectorPenTool>('vectorpen')?.finishPath() },
      cancelPath:  { key: 'Escape', description: 'Cancel path / exit edit', handler: (b) => {
        b.getTool<VectorPenTool>('vectorpen')?.cancelPath()
        b.getTool<SelectTool>('select')?.exitEditMode()
      }},
      // Copy / cut / paste (vector objects)
      copy:  { key: 'c', cmdOrCtrl: true, description: 'Copy selected',  handler: (b) => b.getTool<SelectTool>('select')?.copySelected() },
      cut:   { key: 'x', cmdOrCtrl: true, description: 'Cut selected',   handler: (b) => b.getTool<SelectTool>('select')?.cutSelected() },
      paste: { key: 'v', cmdOrCtrl: true, description: 'Paste',          handler: (b) => b.getTool<SelectTool>('select')?.pasteClipboard() },
      // Cmd/Ctrl+A — select all elements on the active vector layer (otherwise no-op)
      selectAll: { key: 'a', cmdOrCtrl: true, description: 'Select all on vector layer', handler: (b) => {
        const layer = b.getActiveLayer()
        if (!(layer instanceof VectorLayer)) return
        const ids = [...layer.strokes.map((s) => s.id), ...layer.paths.map((p) => p.id)]
        if (ids.length === 0) return
        b.setActiveTool('select')
        b.getTool<SelectTool>('select')?.setSelectedIds(ids)
      }},
      // Cmd/Ctrl+G — group currently-selected layers
      groupLayers: { key: 'g', cmdOrCtrl: true, description: 'Group selected layers', handler: () => {
        useFreeformStore.getState().groupSelectedLayers()
      }},
      // Cmd/Ctrl+Shift+G — ungroup active group
      ungroupLayer: { key: 'g', cmdOrCtrl: true, shift: true, description: 'Ungroup', handler: () => {
        const id = useFreeformStore.getState().activeLayerId
        if (id) useFreeformStore.getState().ungroupLayer(id)
      }},
    }))

    // 3. Store hooks — subscribe BEFORE creating layers so events fire correctly
    const unsubColor = board.hooks.colorPicked.tap('freeform', ({ color }) => {
      setBrushColor(color.toHex())
    })
    const unsubTool = board.hooks.toolChanged.tap('freeform', ({ name }) => {
      // Don't clobber a virtual toolbar id when the underlying tool is the
      // same. e.g. when user picks "Rectangle" we set activeToolId='shape-rect'
      // and the board fires toolChanged('shape') — we want to KEEP the
      // virtual id so the toolbar shows the right icon.
      const current = useFreeformStore.getState().activeToolId
      if (resolveBaseTool(current) === name) return
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

      {/* Checkerboard behind the canvas — shows through transparent areas when bg layer is hidden */}
      {bgHidden && board && <ArtboardCheckerboard board={board} />}

      <div
        ref={containerRef}
        className="absolute inset-0"
        style={
          hideCursor ? { cursor: 'none' } :
          activeToolId === 'fill' ? { cursor: 'crosshair' } :
          undefined
        }
      />

      <BrushCursor />
      <TopBar />
      <Toolbar />

      <LayerMismatchPrompt />
      <DrawBlockedToast />
      <EyedropperMagnifier />
      <FillToleranceHud />
      <CanvasContextMenu />
      <ColorDropOverlay />
      <StickyModifierDock />
      <VectorStylePanel />
      {showColorPicker && <ColorPickerPopup />}
      {showLayerPanel && <LayerPanel />}
    </div>
  )
}
