'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Search, KeyRound } from 'lucide-react'
import type { ShortcutDef, KeyboardPlugin } from '@sketchboard/core'
import { useFreeformStore } from '../store'
import { Dialog, ScrollArea } from './Dialog'

/**
 * Cmd+K-style shortcut manager.
 *
 * Reads every registered shortcut from the active KeyboardPlugin, groups them
 * into logical categories (auto-derived from the shortcut id prefix), and
 * provides search + rebind. Rebinding is live — the new combo is written back
 * to the manager so changes apply immediately and persist for the session.
 *
 * Persistence across reloads is intentionally template-level (this file's
 * concern). Core stays unaware. Storage uses localStorage under
 * `sketchboard.shortcuts.v1` as a flat id → combo map.
 */

const STORAGE_KEY = 'sketchboard.shortcuts.v1'

interface ShortcutEntry {
  id: string
  def: ShortcutDef
  /** Pretty-printed combo (e.g. "⌘⇧Z", "B"). */
  combo: string
  category: string
}

function comboString(def: ShortcutDef): string {
  const parts: string[] = []
  if (def.cmdOrCtrl) parts.push(isMac() ? '⌘' : 'Ctrl')
  if (def.shift)     parts.push(isMac() ? '⇧' : 'Shift')
  if (def.alt)       parts.push(isMac() ? '⌥' : 'Alt')
  parts.push(prettyKey(def.key))
  return parts.join(isMac() ? '' : '+')
}

function prettyKey(k: string): string {
  if (k.length === 1) return k.toUpperCase()
  const map: Record<string, string> = {
    'arrowleft': '←', 'arrowright': '→', 'arrowup': '↑', 'arrowdown': '↓',
    'enter': '↵', 'escape': 'Esc', 'backspace': '⌫', 'delete': 'Del',
    'tab': '⇥', ' ': 'Space',
  }
  return map[k.toLowerCase()] ?? k
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toUpperCase().includes('MAC')
}

function categorize(id: string): string {
  if (id.startsWith('slot-')) return 'Tools'
  if (id.startsWith('tool-')) return 'Tools'
  if (id === 'undo' || id === 'redo') return 'History'
  if (id === 'copy' || id === 'cut' || id === 'paste' || id === 'selectAll' || id === 'deleteEl' || id === 'deleteElBS' || id === 'deselect') return 'Edit'
  if (id === 'groupLayers' || id === 'ungroupLayer') return 'Layers'
  if (id === 'finishPath' || id === 'cancelPath') return 'Vector'
  if (id === 'increaseBrushSize' || id === 'decreaseBrushSize') return 'Brush'
  return 'Other'
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const board = useFreeformStore((s) => s.board)
  const [search, setSearch] = useState('')
  const [bindingId, setBindingId] = useState<string | null>(null)
  // Bump on every successful rebind to force a re-read of the manager.
  const [revision, setRevision] = useState(0)

  const keyboard = useMemo(() => {
    const plugin = board?.plugins.get('keyboard') as KeyboardPlugin | undefined
    return plugin?.keyboard ?? null
  }, [board])

  // Load saved overrides once on mount and apply to the manager.
  useEffect(() => {
    if (!keyboard) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Record<string, { key: string; cmdOrCtrl?: boolean; shift?: boolean; alt?: boolean }>
      for (const [id, combo] of Object.entries(saved)) {
        const cur = keyboard.getAll().get(id)
        if (!cur) continue
        keyboard.register(id, { ...cur, ...combo })
      }
      setRevision((r) => r + 1)
    } catch { /* corrupt storage — ignore */ }
  }, [keyboard])

  const entries: ShortcutEntry[] = useMemo(() => {
    if (!keyboard) return []
    const out: ShortcutEntry[] = []
    for (const [id, def] of keyboard.getAll()) {
      out.push({ id, def, combo: comboString(def), category: categorize(id) })
    }
    out.sort((a, b) => a.category.localeCompare(b.category) || a.def.description.localeCompare(b.def.description))
    return out
  }, [keyboard, revision])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      e.def.description.toLowerCase().includes(q) ||
      e.combo.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q))
  }, [entries, search])

  const grouped = useMemo(() => {
    const map = new Map<string, ShortcutEntry[]>()
    for (const e of filtered) {
      const arr = map.get(e.category) ?? []
      arr.push(e)
      map.set(e.category, arr)
    }
    return map
  }, [filtered])

  // Capture rebind keystroke
  useEffect(() => {
    if (!bindingId || !keyboard) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.key === 'Escape') { setBindingId(null); return }
      // Reject modifier-only chords
      if (e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') return
      const cur = keyboard.getAll().get(bindingId)
      if (!cur) { setBindingId(null); return }
      const next: ShortcutDef = {
        ...cur,
        key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
        cmdOrCtrl: e.metaKey || e.ctrlKey || false,
        shift: e.shiftKey || false,
        alt: e.altKey || false,
      }
      keyboard.register(bindingId, next)
      // Persist
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const saved = raw ? JSON.parse(raw) : {}
        saved[bindingId] = { key: next.key, cmdOrCtrl: next.cmdOrCtrl, shift: next.shift, alt: next.alt }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
      } catch { /* storage disabled — silently skip */ }
      setBindingId(null)
      setRevision((r) => r + 1)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [bindingId, keyboard])

  const resetAll = () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* no-op */ }
    // Re-installing the plugin to reset is heavy; simplest path: prompt user to reload.
    if (typeof window !== 'undefined') window.location.reload()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={<span className="flex items-center gap-2"><KeyRound size={14} className="text-blue-300" /> Keyboard shortcuts</span>}
      description="Click any combo to rebind. Esc cancels capture."
      width={620}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/35">{filtered.length} shortcut{filtered.length === 1 ? '' : 's'}</span>
          <button
            onClick={resetAll}
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/55 hover:bg-white/10 hover:text-white/85 transition"
          >Reset to defaults</button>
        </div>
      }
    >
      <div className="px-5 py-3 border-b border-white/6">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
          <Search size={13} className="text-white/35" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shortcuts…"
            className="flex-1 bg-transparent text-[12px] text-white/85 placeholder-white/30 outline-none"
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[10px] text-white/35 hover:text-white/70">
              Clear
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="px-3 py-2">
        {[...grouped.entries()].map(([category, items]) => (
          <section key={category} className="mb-3 last:mb-0">
            <div className="px-2 pb-1.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-white/35">
              {category}
            </div>
            <div className="flex flex-col">
              {items.map((e) => (
                <ShortcutRow
                  key={e.id}
                  entry={e}
                  isBinding={bindingId === e.id}
                  onBind={() => setBindingId(bindingId === e.id ? null : e.id)}
                />
              ))}
            </div>
          </section>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-12 text-center text-[12px] text-white/40">
            No shortcuts match "{search}".
          </div>
        )}
      </ScrollArea>
    </Dialog>
  )
}

function ShortcutRow({
  entry, isBinding, onBind,
}: {
  entry: ShortcutEntry
  isBinding: boolean
  onBind: () => void
}) {
  return (
    <div className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/5">
      <span className="flex-1 text-[12px] text-white/80">{entry.def.description}</span>
      <button
        onClick={onBind}
        className={[
          'rounded-md border px-2 py-1 font-mono text-[11px] transition-all',
          isBinding
            ? 'border-blue-400/70 bg-blue-500/15 text-blue-200 animate-pulse'
            : 'border-white/10 bg-white/5 text-white/65 hover:border-white/30 hover:bg-white/10 hover:text-white/95',
        ].join(' ')}
        title="Click to rebind"
      >
        {isBinding ? 'Press key…' : entry.combo}
      </button>
    </div>
  )
}
