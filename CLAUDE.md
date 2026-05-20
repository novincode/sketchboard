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

## Roadmap

- [ ] `FrameLayer` — RasterLayer with multiple frames (frame-by-frame animation)
- [ ] `VectorLayer` — SVG path-based layer
- [ ] `CompositionLayer` — nested Board instance as a layer
- [ ] WebGL renderer (`@sketchboard/renderer-webgl`)
- [ ] Brush texture stamps / wet paint simulation
- [ ] 3D layer depth + camera orbit mode (z-axis)
- [ ] `@sketchboard/vue` — Vue 3 bindings
- [ ] `@sketchboard/svelte` — Svelte bindings
