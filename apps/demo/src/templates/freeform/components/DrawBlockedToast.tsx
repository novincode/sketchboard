'use client'

import React, { useEffect, useState } from 'react'
import { EyeOff, AlertCircle } from 'lucide-react'
import { useFreeformStore } from '../store'
import type { DrawBlockedReason } from '@sketchboard/core'

const MESSAGES: Record<DrawBlockedReason, { icon: React.ReactNode; text: string }> = {
  'layer-hidden':     { icon: <EyeOff size={14} />,    text: "Can't draw on a hidden layer" },
  'wrong-layer-type': { icon: <AlertCircle size={14} />, text: 'Wrong layer type for this tool' },
  'no-active-layer':  { icon: <AlertCircle size={14} />, text: 'No active layer selected' },
}

export function DrawBlockedToast() {
  const board = useFreeformStore((s) => s.board)
  const [reason, setReason] = useState<DrawBlockedReason | null>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!board) return
    return board.hooks.drawBlocked.tap('toast', ({ reason: r }) => {
      setReason(r)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setReason(null), 2400)
    })
  }, [board])

  if (!reason) return null
  const { icon, text } = MESSAGES[reason]

  return (
    <div className="pointer-events-none fixed top-14 left-1/2 z-50 -translate-x-1/2 transition-all">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/80 px-4 py-2 text-xs text-white/70 shadow-xl backdrop-blur-xl">
        <span className="text-white/40">{icon}</span>
        {text}
      </div>
    </div>
  )
}
