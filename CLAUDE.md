# @sketchboard — Open-Source Core AI Instructions

## What This Repo Is

The open-source monorepo for the `@sketchboard/*` family of packages. This is a standalone,
**product-agnostic** drawing and animation engine. It has no knowledge of SketchBoard Studio
(the private product). Anyone can use these packages to build their own drawing apps.

## Packages

| Package | Purpose |
|---------|---------|
| `@sketchboard/core` | Framework-agnostic drawing engine (Board, layers, tools, camera, renderer) |
| `@sketchboard/animation` | Timeline, keyframes, easing, nested compositions |
| `@sketchboard/react` | React bindings (hooks, components) |
| `apps/demo` | Interactive docs/demo site (Next.js + Cloudflare Pages) |

## Absolute Rules

1. `@sketchboard/core` **has zero runtime dependencies.** It cannot import React, Vue, or any UI lib.
2. `@sketchboard/animation` depends only on `@sketchboard/core`.
3. `@sketchboard/react` depends on `@sketchboard/core` and has `react` as a peer dependency.
4. All packages must compile in isolation (`tsup`). Circular deps between packages are forbidden.
5. Public API surfaces must be stable. Breaking changes require a major version bump.
6. **No TODOs left in shipped code.** Design for the future with extension points, not half-finished code.

## Core Architecture

```
Board
├── camera: Camera           ← view transform (pan/zoom/rotate)
├── layers: Layer[]          ← composited in order, each on offscreen canvas
├── activeTool: Tool         ← handles pointer events
├── hooks: BoardHooks        ← plugin extension points (tap/call pattern)
├── history: HistoryManager  ← undo/redo stack
├── plugins: PluginManager   ← registered plugins (e.g., AnimationPlugin)
└── renderer: Renderer       ← composites layers to main canvas
```

### Plugin Pattern

```typescript
import type { Board, Plugin } from '@sketchboard/core'

class MyPlugin implements Plugin {
  readonly name = 'my-plugin'
  
  onInstall(board: Board): void {
    board.hooks.beforeRender.tap('my-plugin', (b) => {
      // runs every frame before layers are composited
    })
  }
  
  onUninstall(board: Board): void {
    // cleanup
  }
}

board.use(new MyPlugin())
```

### Adding a New Tool

```typescript
import { Tool, type PointerData } from '@sketchboard/core'

class MyTool extends Tool {
  onPointerDown(e: PointerData): void { /* ... */ }
  onPointerMove(e: PointerData): void { /* ... */ }
  onPointerUp(e: PointerData): void { /* ... */ }
  onPointerCancel(e: PointerData): void { /* ... */ }
}

board.registerTool('my-tool', new MyTool())
board.setActiveTool('my-tool')
```

## Build & Dev

```bash
# From this folder (open-source/)
pnpm install
pnpm dev          # watch mode for all packages + demo
pnpm build        # build all packages
pnpm typecheck    # type-check everything
```

## Versioning

All packages use synchronized versioning (bump all when any breaking change occurs).
Internal dependencies use `"workspace:*"`.

## Tools Available

| Tool | Class | Key | Notes |
|------|-------|-----|-------|
| Pen | `PenTool` | `P` | Hard edge, pressure → size |
| Brush | `BrushTool` | `B` | Soft edge, configurable |
| Pencil | `PencilTool` | `N` | Jitter texture stamps |
| Eraser | `EraserTool` | `E` | destination-out composite |
| Pan/Hand | `PanTool` | `H` | Also: Space hold = temp pan |
| Eyedropper | `EyedropperTool` | `I` | Fires `hooks.colorPicked` |

## Keyboard System

```typescript
import { KeyboardPlugin, type ShortcutOverrides } from '@sketchboard/core'

// Default shortcuts cover all tools + undo/redo/brush size
board.use(new KeyboardPlugin())

// Override or add shortcuts:
board.use(new KeyboardPlugin({
  brush: null,              // disable
  undo: { key: 'z', cmdOrCtrl: true, description: 'Undo', handler: (b) => b.history.undo() },
  myCustom: { key: 'f', description: 'My action', handler: (b) => { /* ... */ } },
}))
```

**Important:** The `hooks.toolChanged` subscriber must NOT call `store.setActiveToolId()` (which
calls board) — that creates an infinite loop. Instead, use `zustand.setState({ activeToolId })` directly.

## Templates (in apps/demo)

Templates are self-contained UI implementations that demonstrate the headless core:

- `src/templates/freeform/` — full-screen drawing canvas (Apple Freeform style)
  - `FreeformTemplate.tsx` — top-level component
  - `store.ts` — Zustand store (syncs with Board via hooks)
  - `components/` — Toolbar, ColorPickerPopup, BrushPanel, Background, StatusBar

Pattern: UI events → store actions → board methods → hook events → `zustand.setState()`.
Never hook → store action → board → hook (creates loops).

## Roadmap

- [ ] `FrameLayer` — RasterLayer with multiple frames (frame-by-frame animation)
- [ ] Node-based compositing pipeline (see docs/ARCHITECTURE.md)
- [ ] `VectorLayer` — SVG path-based layer
- [ ] `CompositionLayer` — nested Board instance as a layer
- [ ] WebGL renderer (`@sketchboard/renderer-webgl`)
- [ ] Brush texture stamps / wet paint simulation
- [ ] 3D layer depth + camera orbit mode (z-axis)
- [ ] `@sketchboard/vue` — Vue 3 bindings
- [ ] `@sketchboard/svelte` — Svelte bindings
