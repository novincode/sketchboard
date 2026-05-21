# @sketchboard Roadmap

Status key: ✅ Done · 🔨 In progress · 📋 Planned · 💡 Future idea

---

## Core Engine (`@sketchboard/core`)

### Drawing
- ✅ Canvas 2D renderer with proper DPR / high-DPI handling
- ✅ BrushTool — pressure-sensitive, soft/hard edge, opacity
- ✅ PenTool — hard-edge pressure brush
- ✅ PencilTool — jittered stamp texture
- ✅ EraserTool — destination-out composite
- ✅ PanTool — pointer drag panning (also Space-to-pan)
- ✅ EyedropperTool — samples from composited canvas
- ✅ Undo/redo (ImageData snapshots, configurable stack size)
- 📋 Alpha lock (`source-atop` composite when `layer.alphaLock = true`)
- 📋 Smudge / blend tool
- 📋 Fill bucket (flood fill on raster layer)
- 📋 Selection tool (rectangle + lasso) + copy/paste pixels
- 📋 Transform tool (free transform of layer/selection)
- 💡 Brush texture stamps (PNG-based stamps, wet paint blending)
- 💡 Brush studio (import Procreate .brushset)

### Layers
- ✅ RasterLayer — offscreen canvas, per-layer blend mode + opacity
- ✅ GroupLayer — nested layer tree
- ✅ `backgroundColor` for artboard appearance
- 📋 `FrameLayer` — RasterLayer with multiple frames (frame-by-frame animation)
- 📋 Clipping mask (`source-in` composite against layer below)
- 📋 Layer mask (greyscale mask channel)
- 📋 `VectorLayer` — SVG path-based layer (sharp at any zoom)
- 💡 `ImageLayer` — embedded raster image with transform (import PNG/JPG)
- 💡 `TextLayer` — rich text with font, size, color
- 💡 `CompositionLayer` — nested Board with its own timeline

### Camera & Navigation
- ✅ Pan, zoom (scroll/pinch), no zoom limit
- ✅ Space-to-pan (temporary PanTool)
- 📋 Rotate camera (two-finger rotate gesture)
- 📋 Camera keyframing (via AnimationPlugin)
- 💡 3D layer depth — z-axis offset, camera orbit mode

### Architecture
- ✅ Plugin system (microkernel + hooks)
- ✅ Keyboard shortcuts (configurable, overrideable)
- ✅ `Board.logicalWidth/Height` — correct coordinate math at any DPR
- 📋 Node-based compositing pipeline (`NodeGraph` + `RenderNode` interface)
- 📋 WebGL renderer (`@sketchboard/renderer-webgl`) — swap in for 10× perf
- 💡 WebGPU renderer

---

## Animation (`@sketchboard/animation`)

- ✅ Timeline with keyframes + easing curves
- ✅ Keyframe any layer property (x, y, rotation, scaleX, scaleY, opacity)
- ✅ Camera keyframing (`__camera__` target ID)
- ✅ Loop playback
- 📋 Frame-by-frame animation (drive `FrameLayer` frame index via Timeline)
- 📋 Nested compositions (`CompositionLayer` with own Timeline)
- 📋 Onion skin rendering (N frames before/after as ghost)
- 📋 Export frames as GIF / WebM (client-side, using WebCodecs or gif.js)
- 💡 Motion paths (animate position along a bezier curve)
- 💡 Symbol/instance system (reuse animations by reference)

---

## React Bindings (`@sketchboard/react`)

- ✅ `useBoard` hook — mounts Board, registers default tools
- ✅ `onReady` / `onDestroy` callbacks (React Strict Mode safe)
- ✅ `BoardCanvas` component (convenience wrapper)
- 📋 `useTimeline` hook — control AnimationPlugin timeline from React
- 📋 `useLayerList` hook — reactive layer list for UI
- 💡 `@sketchboard/vue` — Vue 3 composables
- 💡 `@sketchboard/svelte` — Svelte stores

---

## Demo / Templates (`apps/demo`)

- ✅ Freeform template — full-screen drawing canvas (Apple Freeform style)
  - ✅ Pen, brush, pencil, eraser, pan, eyedropper tools
  - ✅ Tool settings panel (size, opacity, hardness)
  - ✅ Color picker (react-colorful)
  - ✅ Brush cursor overlay (shows size at zoom level)
  - ✅ Layer panel (visibility, opacity, blend mode)
  - ✅ Keyboard shortcuts
  - ✅ Dot/grid/none background
  - ✅ Export as PNG
  - 📋 Import image (drag & drop → ImageLayer)
  - 📋 Free transform of selected layer
  - 📋 Alpha lock toggle per layer
  - 💡 Collaboration (CRDT / WebSocket)
- 📋 Animation template — timeline editor + frame-by-frame
- 📋 Whiteboard template — infinite canvas for diagrams, sticky notes
- 📋 Minimal template — no Tailwind, plain CSS (reference for other frameworks)

---

## Infrastructure

- ✅ pnpm workspaces + Turborepo
- ✅ tsup library builds (ESM + CJS + types)
- ✅ TypeScript strict mode
- ✅ Next.js 16 + Cloudflare Pages (demo)
- 📋 Vitest unit tests for core math, camera, history
- 📋 Playwright visual regression tests
- 📋 Semantic release automation (changesets)
- 💡 Storybook for component documentation
