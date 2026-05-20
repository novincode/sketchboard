'use client'

import { useEffect, useRef, useState } from 'react'
import { Board, RasterLayer, BrushTool, EraserTool, Color } from '@sketchboard/core'

type ActiveTool = 'brush' | 'eraser'

export default function CanvasDemoPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<Board | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>('brush')
  const [brushSize, setBrushSize] = useState(16)
  const [brushColor, setBrushColor] = useState('#000000')

  useEffect(() => {
    const container = containerRef.current
    if (!container || boardRef.current) return

    const board = new Board(container, { background: '#ffffff' })
    boardRef.current = board

    const layer = new RasterLayer(1920, 1080, 'Layer 1')
    board.addLayer(layer)
    board.setActiveLayer(layer.id)

    const brush = new BrushTool()
    const eraser = new EraserTool()
    board.registerTool('brush', brush)
    board.registerTool('eraser', eraser)
    board.setActiveTool('brush')

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) board.history.redo()
        else board.history.undo()
      }
      if (e.key === 'b') board.setActiveTool('brush')
      if (e.key === 'e') board.setActiveTool('eraser')
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      board.destroy()
      boardRef.current = null
    }
  }, [])

  const handleToolChange = (tool: ActiveTool) => {
    boardRef.current?.setActiveTool(tool)
    setActiveTool(tool)
  }

  const handleBrushSizeChange = (size: number) => {
    setBrushSize(size)
    const brush = boardRef.current?.getTool<BrushTool>('brush')
    const eraser = boardRef.current?.getTool<EraserTool>('eraser')
    if (brush) brush.settings.size = size
    if (eraser) eraser.settings.size = size * 1.5
  }

  const handleColorChange = (hex: string) => {
    setBrushColor(hex)
    const brush = boardRef.current?.getTool<BrushTool>('brush')
    if (brush) brush.settings.color = Color.fromHex(hex)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          background: '#1a1a1a',
          borderBottom: '1px solid #333',
          flexShrink: 0,
        }}
      >
        <ToolButton active={activeTool === 'brush'} onClick={() => handleToolChange('brush')} label="Brush (B)" />
        <ToolButton active={activeTool === 'eraser'} onClick={() => handleToolChange('eraser')} label="Eraser (E)" />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#aaa', fontSize: 13 }}>
          Size
          <input
            type="range"
            min={2}
            max={80}
            value={brushSize}
            onChange={(e) => handleBrushSizeChange(Number(e.target.value))}
            style={{ width: 100 }}
          />
          <span style={{ minWidth: 24 }}>{brushSize}</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#aaa', fontSize: 13 }}>
          Color
          <input
            type="color"
            value={brushColor}
            onChange={(e) => handleColorChange(e.target.value)}
            style={{ width: 32, height: 28, border: 'none', background: 'none', cursor: 'pointer' }}
          />
        </label>

        <span style={{ color: '#555', fontSize: 12, marginLeft: 'auto' }}>
          ⌘Z undo · ⌘⇧Z redo · Scroll/Pinch to zoom · Two-finger drag to pan
        </span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', cursor: 'crosshair' }} />
    </div>
  )
}

function ToolButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 6,
        border: active ? '1px solid #4f8ef7' : '1px solid #444',
        background: active ? '#1a3a6e' : '#2a2a2a',
        color: active ? '#90b8ff' : '#ccc',
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      {label}
    </button>
  )
}
