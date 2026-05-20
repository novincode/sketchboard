'use client'

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Board, BrushTool } from '@sketchboard/core'
import { Color } from '@sketchboard/core'
import type { ToolId, Background } from './types'

// ─── State shape ────────────────────────────────────────────────────────────

interface FreeformState {
  // Board reference — set once mounted, null before/after
  board: Board | null

  // Tool
  activeToolId: ToolId

  // Brush settings (shared across pen / brush / pencil)
  brushSize: number
  brushOpacity: number
  brushHardness: number
  brushColor: string // hex e.g. "#1a1a1a"

  // Canvas background
  background: Background

  // UI panels
  showColorPicker: boolean
  showBrushPanel: boolean
}

interface FreeformActions {
  _setBoard(board: Board | null): void

  setActiveToolId(id: ToolId): void
  setBrushSize(size: number): void
  setBrushOpacity(opacity: number): void
  setBrushHardness(hardness: number): void
  setBrushColor(hex: string): void

  setBackground(bg: Background): void
  toggleColorPicker(): void
  closePanels(): void
  toggleBrushPanel(): void

  /** Export the visible canvas as a PNG download */
  exportPng(filename?: string): void
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function applyBrushColor(board: Board, hex: string) {
  const color = Color.fromHex(hex)
  for (const name of ['pen', 'brush', 'pencil'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) tool.settings.color = color
  }
}

function applyBrushSize(board: Board, size: number) {
  for (const name of ['pen', 'brush', 'pencil', 'eraser'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) tool.settings.size = size
  }
}

function applyBrushOpacity(board: Board, opacity: number) {
  for (const name of ['pen', 'brush', 'pencil'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) tool.settings.opacity = opacity
  }
}

function applyBrushHardness(board: Board, hardness: number) {
  for (const name of ['pen', 'brush', 'pencil'] as const) {
    const tool = board.getTool<BrushTool>(name)
    if (tool) tool.settings.hardness = hardness
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useFreeformStore = create<FreeformState & FreeformActions>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    board: null,
    activeToolId: 'pen',
    brushSize: 8,
    brushOpacity: 1,
    brushHardness: 0.9,
    brushColor: '#1a1a1a',
    background: 'dots',
    showColorPicker: false,
    showBrushPanel: false,

    // ── Board ──────────────────────────────────────────────────────────────
    _setBoard(board) {
      set({ board })
      if (!board) return
      // Sync initial settings to newly mounted board
      const s = get()
      applyBrushColor(board, s.brushColor)
      applyBrushSize(board, s.brushSize)
      applyBrushOpacity(board, s.brushOpacity)
      applyBrushHardness(board, s.brushHardness)
    },

    // ── Tool ──────────────────────────────────────────────────────────────
    setActiveToolId(id) {
      const { board } = get()
      board?.setActiveTool(id)
      set({ activeToolId: id })
    },

    // ── Brush ─────────────────────────────────────────────────────────────
    setBrushSize(size) {
      const { board } = get()
      if (board) applyBrushSize(board, size)
      set({ brushSize: size })
    },

    setBrushOpacity(opacity) {
      const { board } = get()
      if (board) applyBrushOpacity(board, opacity)
      set({ brushOpacity: opacity })
    },

    setBrushHardness(hardness) {
      const { board } = get()
      if (board) applyBrushHardness(board, hardness)
      set({ brushHardness: hardness })
    },

    setBrushColor(hex) {
      const { board } = get()
      if (board) applyBrushColor(board, hex)
      set({ brushColor: hex })
    },

    // ── UI ────────────────────────────────────────────────────────────────
    setBackground(bg) {
      set({ background: bg })
    },

    toggleColorPicker() {
      set((s) => ({ showColorPicker: !s.showColorPicker, showBrushPanel: false }))
    },

    closePanels() {
      set({ showColorPicker: false, showBrushPanel: false })
    },

    toggleBrushPanel() {
      set((s) => ({ showBrushPanel: !s.showBrushPanel, showColorPicker: false }))
    },

    // ── Export ────────────────────────────────────────────────────────────
    exportPng(filename = 'sketchboard-export.png') {
      const { board } = get()
      if (!board) return
      const link = document.createElement('a')
      link.download = filename
      link.href = board.canvas.toDataURL('image/png')
      link.click()
    },
  })),
)
