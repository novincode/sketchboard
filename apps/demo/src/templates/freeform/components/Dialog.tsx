'use client'

import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Reusable shadcn-style centered modal.
 *
 *   - Backdrop click closes (configurable via `dismissOnBackdrop`)
 *   - Escape closes (always)
 *   - Body scroll locked while open
 *   - Sized responsively via `width` (default 560px) — falls back to 92vw on narrow screens
 *   - Footer / header / body slots for layout flexibility
 *
 * Mounts via portal to document.body so z-index ordering "just works"
 * regardless of where it's called from in the tree.
 */
export function Dialog({
  open, onClose, title, description, children, footer,
  width = 560, dismissOnBackdrop = true,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  width?: number
  dismissOnBackdrop?: boolean
}) {
  const contentRef = useRef<HTMLDivElement>(null)

  // Lock body scroll while open + Escape to close.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10500] flex items-center justify-center px-4"
      onMouseDown={(e) => {
        if (!dismissOnBackdrop) return
        if (contentRef.current && contentRef.current.contains(e.target as Node)) return
        onClose()
      }}
    >
      <DialogStyles />
      {/* Backdrop */}
      <div className="dialog-backdrop absolute inset-0 bg-black/65 backdrop-blur-sm" />

      {/* Content */}
      <div
        ref={contentRef}
        className="dialog-content relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101010]/97 shadow-2xl backdrop-blur-2xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <header className="flex items-start justify-between border-b border-white/8 px-5 py-4 shrink-0">
            <div className="flex flex-col gap-0.5">
              {title && <h2 className="text-sm font-semibold text-white/90">{title}</h2>}
              {description && <p className="text-xs text-white/45 leading-relaxed">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="ml-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/40 hover:bg-white/8 hover:text-white/80 transition"
              aria-label="Close dialog"
            >
              <X size={14} />
            </button>
          </header>
        )}

        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          {children}
        </div>

        {footer && (
          <footer className="border-t border-white/8 px-5 py-3 shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Reusable scroll container with a modern overlay scrollbar. Designed to be
 * dropped inside Dialog children when the content might exceed the viewport.
 */
export function ScrollArea({ children, className = '' }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={['dialog-scroll flex-1 overflow-y-auto overflow-x-hidden', className].join(' ')}>
      {children}
    </div>
  )
}

function DialogStyles() {
  return (
    <style>{`
      .dialog-backdrop { animation: dialogBackdropIn 160ms ease-out; }
      .dialog-content  { animation: dialogContentIn 180ms cubic-bezier(0.22, 1, 0.36, 1); }
      @keyframes dialogBackdropIn { from { opacity: 0 } to { opacity: 1 } }
      @keyframes dialogContentIn {
        from { opacity: 0; transform: translateY(8px) scale(0.985); }
        to   { opacity: 1; transform: translateY(0)  scale(1); }
      }
      .dialog-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
      .dialog-scroll::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.10);
        border: 2px solid transparent;
        background-clip: padding-box;
        border-radius: 999px;
      }
      .dialog-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.18);
        background-clip: padding-box;
      }
      .dialog-scroll::-webkit-scrollbar-track { background: transparent; }
    `}</style>
  )
}
