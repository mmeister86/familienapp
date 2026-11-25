# Scene Builder Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the react-grid-layout work surface of the scene builder with an own canvas where widgets are placed freely on the visible 12 x 24 grid and tiles split, push and fill automatically.

**Architecture:** All layout behaviour lives in one pure module, `src/lib/canvas-ops.ts`, that takes and returns plain widget lists and is unit-tested exhaustively. The React canvas only turns pointer and key events into calls of those functions and draws tiles and previews with CSS grid. An undo history wraps the existing form state. A dev-only playground page mounts the canvas without Convex so it can be exercised in a browser.

**Tech Stack:** TypeScript strict, React 19, Tailwind 4, Vitest (node environment, pure functions only).

**Spec:** `docs/superpowers/specs/2026-11-25-builder-canvas.md`

## Global Constraints

- Read `.docs/AGENTS.md` first; its conventions bind (English code, German UI strings, strict TS without `any`, pnpm only).
- No new dependencies. `react-grid-layout` is removed in Task 4, not before.
- The saved scene format does not change: `SceneWidget` (`id`, `type`, `x`, `y`, `w`, `h`, `props?`, `fallback?`) on a 12 x 24 grid; no file under `convex/` is modified.
- Every function in `canvas-ops.ts` is pure, never mutates its input, and returns widget lists in which no two tiles overlap, every tile is inside the grid and no tile is below its catalog minimum. When an operation is impossible it returns `null`, never a partial result.
- Gates before every commit: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- NEVER run `npx convex dev`, `npx convex deploy` or `convex codegen`, and never open the app's real pages in a browser: `.env.local` points at production. Browser checks use only `/canvas-playground.html` (Task 3), which does not load Convex.
- The builder is laptop-only (>= 1024 px); pointer handling uses Pointer Events, sidebar drags stay HTML5 drag and drop.
- Conventional Commits; do not push.

## Review Focus

- A split or push that would leave a tile one cell below its minimum: must be refused, not clamped into an overlap.
- Dropping at the grid's right or bottom border: the placed rectangle is pulled inside, never cut off.
- Resizing a tile whose neighbours are only partly alongside the moving edge: those neighbours must not follow on shrink, and on grow they are pushed only if they are actually in the way.
- Removing the only tile, or a tile whose neighbours do not line up: the gap stays and nothing else moves.
- Undo after an autosave round trip (the server echoing the saved draft) must still restore the previous layout and must not be wiped by the echo.

---

### Task 1: Placement and split operations

**Files:**
- Create: `src/lib/canvas-ops.ts`, `tests/unit/canvas-ops.test.ts`

**Interfaces:**
- Produces (all exported from `src/lib/canvas-ops.ts`):
  - `GRID = { cols: 12, rows: 24 } as const`
  - `type Rect = { x: number; y: number; w: number; h: number }`
  - `type Cell = { col: number; row: number }`
  - `type Side = "left" | "right" | "top" | "bottom"`
  - `type Minimum = { minW: number; minH: number }`
  - `type Minima = (type: string) => Minimum` (unknown types give `{ minW: 1, minH: 1 }`)
  - `minimaFrom(catalog: readonly CatalogEntry[]): Minima`
  - `isValidLayout(widgets: readonly SceneWidget[], minima: Minima): boolean`
  - `tileAt(widgets: readonly SceneWidget[], cell: Cell): SceneWidget | undefined`
  - `placeFree(widgets: readonly SceneWidget[], size: Minimum, cell: Cell): Rect | null`
  - `splitTile(target: SceneWidget, side: Side, added: Minimum, targetMin: Minimum): { target: Rect; added: Rect } | null`
  - `type DropPlan = { kind: "place"; added: Rect } | { kind: "split"; targetId: string; side: Side; target: Rect; added: Rect } | { kind: "blocked" }`
  - `planDrop(widgets: readonly SceneWidget[], type: string, point: { x: number; y: number }, minima: Minima): DropPlan` — `point` is in grid units with fractions (`x` in 0..12, `y` in 0..24)
  - `planClickAdd(widgets: readonly SceneWidget[], type: string, minima: Minima): DropPlan`
  - `applyDrop(widgets: readonly SceneWidget[], plan: DropPlan, widget: Pick<SceneWidget, "id" | "type" | "props">): SceneWidget[] | null` (`null` for a blocked plan)

- [ ] **Step 1: Write the failing tests** in `tests/unit/canvas-ops.test.ts`. Helper `w(id, type, x, y, w, h)` builds a widget; `minima` gives clock 4x3, shopping 4x2, news 4x3, school 6x4, dayband 8x4, week 6x5, everything else 1x1. Cases:
  - `isValidLayout`: true for the built-in afternoon scene (clock 0,0,12,3; dayband 0,3,12,4; school 0,7,12,8; week 0,15,12,7; shopping 0,22,12,2); false for two overlapping tiles, a tile ending at x 13, a clock of 3x3.
  - `tileAt`: finds the tile covering a cell; `undefined` on a free cell.
  - `placeFree` on an empty grid with size 4x3 at cell (5,10) → `{x:5,y:10,w:4,h:3}`; at cell (11,23) → `{x:8,y:21,w:4,h:3}` (pulled inside); with a tile at (0,0,12,10) and cell (2,10) → `{x:2,y:10,w:4,h:3}`; with free space only a 3-wide column → `null`; when the anchored rectangle is blocked but shifting left by one is free and still contains the cell → the shifted rectangle (nearest shift wins, horizontal before vertical on ties).
  - `splitTile` of a 12x8 school tile (0,7): side `right`, added min 4x3 → target `{x:0,y:7,w:6,h:8}`, added `{x:6,y:7,w:6,h:8}`; side `bottom`, added min 4x3 → target `{0,7,12,4}`, added `{0,11,12,4}`; side `left` → added at x 0 and target shifted right; side `top` likewise. A 6x5 tile split `right` with added min 4x3 and target min 4x3 → `null` (6 cannot give 4 + 4). A 9x4 tile, added min 6x4, target min 3x1, side `right` → added gets 6 (its minimum, more than half), target keeps 3. Added min higher than the tile across the axis (tile 12x3, added 4x4, side `right`) → `null`.
  - `planDrop` on the afternoon scene, type `news` (4x3): point (10.5, 9.0) inside school near its right edge → `{kind:"split", targetId:"school", side:"right", …}`; point (6.0, 14.6) near school's bottom edge → side `bottom`; point inside the 12x2 shopping strip → the nearest side is impossible, falls through the other sides, all impossible → `{kind:"blocked"}`; on an empty grid → `{kind:"place"}` with the `placeFree` rectangle; type `dayband` (8x4) over a 6x11 tile near its left edge → left/right impossible (6 < 8) → splits `top` or `bottom`, whichever edge is nearer to the point.
  - `planClickAdd`: with free space → place at the first free spot scanning rows then columns; on the full afternoon scene, type `news` → splits the tile with the largest area that can be split (`school`), on `bottom` or `right`, whichever leaves the smaller of the two resulting areas larger; nothing splittable → blocked.
  - `applyDrop`: result contains the new widget with the given id/type/props at `added`, the target at its reduced rectangle with id, type, props and fallback preserved, input array and objects unchanged (`toEqual` against a deep copy taken before), and `isValidLayout` true; blocked plan → `null`.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/canvas-ops.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the functions. `planDrop` picks the tile under `tileAt(floor(point))`; side order is by distance from the point to each of the tile's four edges in grid units, nearest first.
- [ ] **Step 4: Run** the test file, then the gates — Expected: PASS.
- [ ] **Step 5: Commit** `feat: canvas placement and split operations`.

---

### Task 2: Move, resize, remove operations and undo history

**Files:**
- Modify: `src/lib/canvas-ops.ts`, `tests/unit/canvas-ops.test.ts`
- Create: `src/lib/history.ts`, `tests/unit/history.test.ts`

**Interfaces:**
- Consumes: Task 1's types and `isValidLayout`.
- Produces in `canvas-ops.ts`:
  - `type Edge = "n" | "e" | "s" | "w"`
  - `moveTile(widgets: readonly SceneWidget[], id: string, to: Cell): SceneWidget[] | null` — `to` is the tile's new top-left cell before clamping
  - `resizeTile(widgets: readonly SceneWidget[], id: string, edges: readonly Edge[], delta: { dx: number; dy: number }, minima: Minima): SceneWidget[]` — `delta` in cells from the drag start; always computed from the layout at drag start; returns the layout unchanged when nothing can move
  - `removeTile(widgets: readonly SceneWidget[], id: string): SceneWidget[]`
- Produces in `history.ts`:
  - `type History<T> = { past: readonly T[]; future: readonly T[] }`
  - `emptyHistory<T>(): History<T>`
  - `record<T>(history: History<T>, before: T, limit?: number): History<T>` (default limit 20; clears `future`)
  - `undo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null`
  - `redo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null`

- [ ] **Step 1: Write the failing tests.**
  - `moveTile`: to a free cell → moved; partly outside the grid → clamped inside; onto another tile → `null`; onto its own current area shifted by one where that is free → moved (a tile does not block itself).
  - `resizeTile` growing: tile A (0,0,6,5) with free space to the right, edge `e`, dx +3 → A is 9 wide. A (0,0,6,5) and B (6,0,6,5) with B's minimum width 4: edge `e` dx +1 → A 7 wide, B (7,0,5,5); dx +5 → stops at A 8 wide, B (8,0,4,5). B only partly in the way (B at (6,3,6,5)): pushed the same way. A tile further right but not adjacent with a free gap of 2: dx +5 takes the gap, then pushes it to its minimum. Edge `s` and `n`/`w` mirrored (one case each; for `w` and `n` the tile's x/y move and its far edge stays).
  - `resizeTile` shrinking: A (0,0,6,5) and B (6,0,6,5), edge `e` dx -2 → A 4 wide, B (4,0,8,5) (flush and within A's extent → follows). B taller than A (B at (6,0,6,8)) → B stays, gap opens. Two tiles C (6,0,6,2) and D (6,2,6,3) both flush and within → both follow. A never below its minimum: clock 4x3 minimum, dx -10 on a 6-wide clock → 4 wide.
  - `resizeTile` corner: edges `["s","e"]` with delta (+1,+1) applies both.
  - Every `resizeTile` and `moveTile` result passes `isValidLayout`; inputs are not mutated.
  - `removeTile`: A (0,0,6,5), B (6,0,6,5), remove A → B (0,0,12,5). Removed tile with two flush tiles on its right that together cover its side exactly → both grow. Left side has one qualifying tile and top side has two → the left one fills. Neighbour longer than the removed side → no fill, others unchanged. Removing the only tile → `[]`. Unknown id → same list content.
  - `history`: `record` then `undo` returns the recorded value and puts the current one into `future`; `redo` reverses it; `record` after `undo` clears `future`; the 21st `record` drops the oldest; `undo` on empty history → `null`.
- [ ] **Step 2: Run** the two test files — Expected: FAIL.
- [ ] **Step 3: Implement.** For `resizeTile`, handle one edge at a time: find the largest feasible signed step for that edge (0 if none), apply it, then the next edge.
- [ ] **Step 4: Run** the test files, then the gates — Expected: PASS.
- [ ] **Step 5: Commit** `feat: canvas move, resize, remove and undo history`.

---

### Task 3: The canvas component and its playground

**Files:**
- Create: `src/components/layouts/free-canvas.tsx`, `src/components/layouts/canvas-pointer.ts`, `tests/unit/canvas-pointer.test.ts`, `canvas-playground.html`, `src/dev/canvas-playground.tsx`
- Modify: `eslint.config.js` or `tsconfig.app.json` only if the new files are not picked up by lint/typecheck

**Interfaces:**
- Consumes: `canvas-ops.ts` (Tasks 1, 2), `widgetIcon`, `TileSettings`, `CatalogEntry`.
- Produces:
  - `canvas-pointer.ts`: `pointToGrid(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }): { x: number; y: number }` (grid units with fractions, clamped to 0..12 / 0..24, `box` is the grid area without the status strip); `deltaCells(startPx: number, nowPx: number, cellPx: number): number` (rounded, half a cell switches).
  - `FreeCanvas` props: `{ widgets: SceneWidget[]; catalog: readonly CatalogEntry[]; draggedTypeRef: RefObject<string | null>; onChange: (widgets: SceneWidget[]) => void; onAddWidget: (type: string, plan: DropPlan) => void; onUpdateWidget: (id: string, patch: Partial<SceneWidget>) => void; onRemoveWidget: (id: string) => void }`. `onChange` fires once per completed move or resize (on release or key press), never during a drag.

- [ ] **Step 1: Write the failing tests** for `canvas-pointer.ts`: a 600x1066 box at (100,50): its top-left pixel → (0,0); its centre → (6,12); a point left of and above the box → (0,0); beyond bottom right → (12,24); `deltaCells(0, 24, 50)` → 0, `deltaCells(0, 26, 50)` → 1, `deltaCells(0, -76, 50)` → -2.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/canvas-pointer.test.ts` — Expected: FAIL. Implement, run again — Expected: PASS.
- [ ] **Step 3: Build `FreeCanvas`** per the spec sections "The surface", "Adding a widget", "Moving a tile", "Resizing a tile", "Keyboard":
  - Sheet `mx-auto w-full max-w-[600px]` with aspect ratio 9:16; inside it a CSS grid of 12 columns and 24 rows for the tiles (gap 6px), a dashed cell grid behind them, and the status strip (height 2.5% of the sheet) below the grid.
  - Tiles are absolutely laid out by `grid-column` / `grid-row`; content as in the current `scene-canvas.tsx` (icon, name, `w x h`, fallback mark, `TileSettings`).
  - Sidebar drag: `onDragOver` computes `planDrop` from `pointToGrid` and `draggedTypeRef.current` and renders the preview (green outline for `added`, the split target drawn at its reduced rectangle, red outline plus "Kein Platz" when blocked); `onDrop` calls `onAddWidget(type, plan)` unless blocked; `onDragLeave` clears the preview.
  - Tile move and the eight resize handles use pointer capture; during a drag the component renders the result of `moveTile` / `resizeTile` computed from the layout at drag start (so tiles and pushed neighbours move live), red outline when `moveTile` gives `null`; on release it calls `onChange` once if the layout changed. Escape cancels a drag.
  - Keyboard as specified; tiles have `tabIndex={0}`, a visible focus ring, and `aria-label` `"<Name>, Spalte <x+1>, Zeile <y+1>, <w> × <h>"`.
  - The gear button (`.tile-gear`) and resize handles must not start a move.
- [ ] **Step 4: Playground.** `canvas-playground.html` (project root, German `lang`, loads `/src/dev/canvas-playground.tsx`) mounts `WidgetSidebar` and `FreeCanvas` with a static copy of the nine-entry catalog and local state starting from the built-in afternoon scene (`?empty=1` starts empty), applying `applyDrop`, `removeTile`, and prop patches locally, with "Rückgängig" wired to `history.ts`. It imports nothing from `convex/_generated` and no Convex client. It is served by `pnpm dev` at `/canvas-playground.html` and is not part of the production build (verify: after `pnpm build`, `dist/` contains no `canvas-playground`).
- [ ] **Step 5: Browser check** at `http://localhost:5173/canvas-playground.html` only, window at least 1280 px wide, light and dark scheme: take screenshots of (a) the afternoon scene at rest, (b) the empty canvas, and with a browser automation tool if one is available to you exercise: drag "Nachrichten" onto the school tile's right side (split preview, then drop), resize the new tile's left edge both ways (neighbour pushed and following), move a tile into a gap, remove a tile (gap filled), keyboard move and resize, undo each. If no automation tool is available, say so in the report and list exactly which interactions were not exercised.
- [ ] **Step 6: Run the gates** — Expected: PASS. **Commit** `feat: free canvas component with playground`.

---

### Task 4: Wire the canvas into the builder and remove react-grid-layout

**Files:**
- Modify: `src/pages/layouts.tsx`, `src/components/layouts/use-scene-form.ts`, `src/components/layouts/scene-toolbar.tsx`, `src/lib/scene-layout.ts`, `tests/unit/scene-layout.test.ts`, `package.json`, `pnpm-lock.yaml`, `.docs/PLAN.md`
- Delete: `src/components/layouts/scene-canvas.tsx`

**Interfaces:**
- Consumes: `FreeCanvas`, `canvas-ops.ts`, `history.ts`.
- Produces: `useSceneForm` additionally returns `undo: () => void`, `redo: () => void`, `canUndo: boolean`, `canRedo: boolean`, and `updateLayout: (next: SceneWidget[]) => void` (records the current widgets in the history, then updates the form).

- [ ] **Step 1: Write failing tests** in `tests/unit/scene-layout.test.ts` for what stays in `scene-layout.ts` after the cleanup (`firstFreeSpot`, `samePlacements`, `defaultPropsFor`, `headerPalette` keep their existing tests) and remove the tests of `widgetsToLayout` / `applyLayoutChange`, which are deleted with react-grid-layout. Add a test for a new pure helper `clearScene(): SceneWidget[]` only if you introduce one; otherwise none.
- [ ] **Step 2: History in the form hook.** Layout changes (add, move, resize, remove, clear, tile settings) go through `updateLayout`; name, start time and palette edits do not touch the history. The history resets where the form re-snaps to another scene or to server state after discard, reset or restore; it does NOT reset when the server echoes the draft the hook itself just saved (the existing `session.scene !== scene && !dirty` re-snap must not clear it when the incoming widgets equal the form's, compare with `samePlacements` plus props/fallback equality). Undo and redo mark the form dirty so the result autosaves.
- [ ] **Step 3: Page wiring.** Replace `SceneCanvas` with `FreeCanvas`; `handleDropWidget` and `handleAddWidget` become `applyDrop` with `planDrop` / `planClickAdd` (toast "Kein Platz frei — erst eine Kachel verkleinern oder entfernen." when blocked); remove uses `removeTile`. Toolbar gains "Rückgängig" (disabled without history) and "Szene leeren" (existing `ConfirmDialog`, text "Alle Kacheln dieser Szene entfernen?"). Ctrl/Cmd+Z triggers undo and Ctrl/Cmd+Shift+Z redo, except while focus is in an input, select or textarea.
- [ ] **Step 4: Remove react-grid-layout:** delete `scene-canvas.tsx`, the RGL-typed helpers and imports, the stylesheet import, then `pnpm remove react-grid-layout`. `grep -rn "react-grid-layout" src tests` must print nothing.
- [ ] **Step 5: Docs.** Update the Phase 8 builder description in `.docs/PLAN.md` (free canvas, split on drop, divider resize, fill on remove, undo, clear, playground URL).
- [ ] **Step 6: Run the gates** — Expected: PASS. Re-check the playground in the browser (it must still work after the cleanup). **Commit** `feat: scene builder on the free canvas, react-grid-layout removed`.
