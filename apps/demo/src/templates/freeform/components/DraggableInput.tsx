'use client'

import React, { useRef, useState, useCallback } from 'react'

interface DraggableInputProps {
  label: string
  value: number
  min?: number
  max?: number
  /** Px of drag travel = full range. Default 160. */
  sensitivity?: number
  decimals?: number
  unit?: string
  onChange: (value: number) => void
}

export function DraggableInput({
  label,
  value,
  min = 0,
  max = 100,
  sensitivity = 160,
  decimals = 0,
  unit = '',
  onChange,
}: DraggableInputProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const startX = useRef(0)
  const startValue = useRef(0)
  const didDrag = useRef(false)

  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  const snap = (v: number) => Number(v.toFixed(decimals))

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (editing) return
      e.currentTarget.setPointerCapture(e.pointerId)
      startX.current = e.clientX
      startValue.current = value
      didDrag.current = false
      e.preventDefault()
    },
    [editing, value],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      const dx = e.clientX - startX.current
      if (Math.abs(dx) > 3) didDrag.current = true
      if (!didDrag.current) return
      const newVal = clamp(snap(startValue.current + (dx / sensitivity) * (max - min)))
      onChange(newVal)
    },
    [clamp, snap, sensitivity, max, min, onChange],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      e.currentTarget.releasePointerCapture(e.pointerId)
      if (!didDrag.current) {
        setDraft(decimals > 0 ? value.toFixed(decimals) : String(Math.round(value)))
        setEditing(true)
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          inputRef.current?.select()
        })
      }
    },
    [value, decimals],
  )

  const commit = useCallback(() => {
    const num = parseFloat(draft)
    if (!isNaN(num)) onChange(clamp(snap(num)))
    setEditing(false)
  }, [draft, clamp, snap, onChange])

  const displayValue = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value))

  return (
    <div className="flex flex-col items-center gap-1 select-none min-w-[52px]">
      <span className="text-[9px] uppercase tracking-widest text-white/30 font-semibold">
        {label}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          className="w-full text-center rounded-lg bg-white/10 text-xs text-white outline-none px-2 py-1 font-mono"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
            e.stopPropagation()
          }}
        />
      ) : (
        <div
          className="cursor-ew-resize rounded-lg bg-white/8 px-2.5 py-1 text-xs font-mono text-white/80 hover:bg-white/15 active:bg-white/20 transition-colors w-full text-center"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title={`Drag to adjust ${label.toLowerCase()}, click to type`}
        >
          {displayValue}{unit}
        </div>
      )}
    </div>
  )
}
