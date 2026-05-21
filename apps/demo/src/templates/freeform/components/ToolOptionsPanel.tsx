'use client'

import React from 'react'
import { useFreeformStore } from '../store'
import { DraggableInput } from './DraggableInput'
import type { EraserMode } from '../types'

export function ToolOptionsPanel() {
  const {
    activeToolId,
    brushSize,       setBrushSize,
    brushOpacity,    setBrushOpacity,
    brushHardness,   setBrushHardness,
    eraserSize,      setEraserSize,
    eraserMode,      setEraserMode,
    vectorSize,      setVectorSize,
    vectorOpacity,   setVectorOpacity,
  } = useFreeformStore()

  if (activeToolId === 'pan' || activeToolId === 'eyedropper') return null

  return (
    <div className="fixed bottom-[72px] left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-end gap-3 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 shadow-2xl backdrop-blur-xl">
        {(activeToolId === 'pen' || activeToolId === 'brush') && (
          <>
            <DraggableInput
              label="Size"
              value={brushSize}
              min={1}
              max={200}
              unit="px"
              onChange={setBrushSize}
            />
            <Divider />
            <DraggableInput
              label="Opacity"
              value={Math.round(brushOpacity * 100)}
              min={1}
              max={100}
              unit="%"
              onChange={(v) => setBrushOpacity(v / 100)}
            />
            {activeToolId === 'brush' && (
              <>
                <Divider />
                <DraggableInput
                  label="Hardness"
                  value={Math.round(brushHardness * 100)}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => setBrushHardness(v / 100)}
                />
              </>
            )}
          </>
        )}

        {activeToolId === 'eraser' && (
          <>
            <DraggableInput
              label="Size"
              value={eraserSize}
              min={1}
              max={400}
              unit="px"
              onChange={setEraserSize}
            />
            <Divider />
            <EraserModeToggle mode={eraserMode} onChange={setEraserMode} />
          </>
        )}

        {activeToolId === 'vector' && (
          <>
            <DraggableInput
              label="Size"
              value={vectorSize}
              min={1}
              max={100}
              unit="px"
              onChange={setVectorSize}
            />
            <Divider />
            <DraggableInput
              label="Opacity"
              value={Math.round(vectorOpacity * 100)}
              min={1}
              max={100}
              unit="%"
              onChange={(v) => setVectorOpacity(v / 100)}
            />
          </>
        )}
      </div>
    </div>
  )
}

function Divider() {
  return <div className="h-8 w-px rounded bg-white/10" />
}

function EraserModeToggle({
  mode,
  onChange,
}: {
  mode: EraserMode
  onChange: (m: EraserMode) => void
}) {
  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <span className="text-[9px] uppercase tracking-widest text-white/30 font-semibold">Mode</span>
      <div className="flex rounded-lg overflow-hidden border border-white/10">
        {(['pixel', 'stroke'] as EraserMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={[
              'px-3 py-1 text-xs capitalize transition-colors',
              mode === m
                ? 'bg-white/20 text-white'
                : 'text-white/35 hover:text-white/60 hover:bg-white/5',
            ].join(' ')}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  )
}
