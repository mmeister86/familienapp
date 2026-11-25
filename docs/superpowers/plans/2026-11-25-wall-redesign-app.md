# Wall Redesign (Family App Side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scene builder and the two dashboard feeds carry the redesigned wall's contract: two new widget types, a palette per scene, person colours.

**Architecture:** The widget catalog and scene validators in `convex/lib` stay the single source; the builder UI reads the catalog. The palette is one optional field on the shared scene snapshot shape, so it travels through draft, publish, versions and feed the same way `start` does.

**Tech Stack:** TypeScript strict, Convex (self-hosted), React 19 + shadcn/Base UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-wall-redesign-app.md`

## Global Constraints

- Read `.docs/AGENTS.md` first; its conventions bind (English code, German UI strings, strict TS without `any`, pnpm only, validators on every Convex argument, `requireParent` on builder mutations).
- No new dependencies.
- Gates before every commit: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- NEVER run `npx convex dev`, `npx convex deploy` or anything else that talks to the Convex backend: `.env.local` points at production. This overrides the gate list in `.docs/AGENTS.md`.
- Fixtures under `tests/fixtures/` named in the spec are copied from `/home/matthias/code/familie/familydash/.worktrees/wall-redesign/testdata/`, never edited by hand.
- The scene builder is laptop-only (≥ 1024 px).
- Conventional Commits; do not push.

## Review Focus

- A scene saved before this change (no `palette` in draft/published/version documents) must still load, save, publish and appear in the feed without the key.
- Choosing "Automatisch" after "Tafel (dunkel)" must remove the key, not store an empty string or `null`.
- A night scene must never get a palette, including through duplicate/restore paths.
- A 12 x 2 shopping tile must be accepted while 12 x 1 is rejected with the German minimum-size message.
- A user whose stored colour is not `#RRGGBB` must not break the calendar feed.

---

### Task 1: Widget catalog, default afternoon scene, scenes fixture

**Files:**
- Modify: `convex/lib/dashboardWidgets.ts`, `convex/lib/defaultScenes.ts`, `src/components/layouts/widget-icons.ts`, `tests/fixtures/dashboard-scenes-v1.json` (copy), `.docs/FAMILY_APP.md`, `.docs/PLAN.md`
- Test: `tests/unit/scenes.test.ts`, `tests/unit/scene-layout.test.ts`, and whichever existing tests pin the catalog, the defaults or the fixture (find them with grep for `WIDGET_CATALOG`, `DEFAULT_SCENES`, `dashboard-scenes-v1`)

**Interfaces:**
- Produces: `WIDGET_TYPES` = `["clock","shopping","briefing","news","photos","school","calendars","dayband","week"]`; catalog entries `{ type: "dayband", name: "Tagesband", minW: 8, minH: 4 }`, `{ type: "week", name: "Woche", minW: 6, minH: 5 }`; shopping `minW: 4, minH: 2`.

- [ ] **Step 1: Write failing tests:** the catalog has nine entries with the values above in that order; `assertValidWidgets` accepts a scene with `dayband` 12x4 and `week` 12x7, rejects `dayband` 6x4 with the message `„Tagesband" braucht mindestens 8 × 4 Kacheln.`, accepts shopping 12x2 and rejects shopping 12x1 with `„Einkaufsliste (Bring!)" braucht mindestens 4 × 2 Kacheln.`; `dayband` and `week` are accepted as `fallback`; a `dayband` widget with `props: { wide: true }` is rejected with `„Tagesband": unbekannte Einstellung „wide".`; the default afternoon scene equals the spec's five widgets and passes `assertValidWidgets`; `widgetIcon("dayband")` and `widgetIcon("week")` are not the generic fallback icon.
- [ ] **Step 2: Run** `pnpm test` — Expected: the new cases FAIL.
- [ ] **Step 3: Implement** the catalog entries, the icons (`ChartGantt`, `CalendarDays` from `lucide-react`) and the new afternoon scene in `DEFAULT_SCENES`.
- [ ] **Step 4: Copy the scenes fixture** from the wall worktree over `tests/fixtures/dashboard-scenes-v1.json`. If a fixture test now fails because of the `palette` keys, leave that single failure for Task 2 only if the test is the validator-fixture test; otherwise fix it here. Say which in the report.
- [ ] **Step 5: Update docs:** widget catalog table and default scenes in `.docs/FAMILY_APP.md` and the Phase 8 section of `.docs/PLAN.md`.
- [ ] **Step 6: Run the gates** — Expected: PASS (or exactly the one fixture failure named in Step 4).
- [ ] **Step 7: Commit** `feat: dayband and week widgets, shopping strip, new afternoon default`.

---

### Task 2: Palette per scene

**Files:**
- Modify: `convex/lib/validators.ts`, `convex/lib/defaultScenes.ts`, `convex/dashboardScenes.ts`, `src/components/layouts/use-scene-form.ts`, `src/components/layouts/scene-header.tsx`, `src/pages/layouts.tsx`, `.docs/FAMILY_APP.md`, `.docs/PLAN.md`
- Test: `tests/convex/dashboard-scenes.test.ts`, `tests/convex/dashboard-scenes-http.test.ts`, `tests/unit/scenes.test.ts` (and the validator-fixture test)

**Interfaces:**
- Produces: `scenePaletteValidator = v.union(v.literal("paper"), v.literal("board"))`, `type ScenePalette`; `sceneSnapshotFields.palette: v.optional(scenePaletteValidator)`; `scenesFeedSceneValidator` gains `palette: v.optional(scenePaletteValidator)`; `DefaultScene.palette?: ScenePalette`; the builder form state gains `palette: ScenePalette | undefined`; the draft-saving mutation gains the argument `palette: v.optional(scenePaletteValidator)`.

- [ ] **Step 1: Write failing tests** (Convex test harness as used in `tests/convex/dashboard-scenes.test.ts`): saving a draft with `palette: "board"` and publishing puts `palette: "board"` on that scene in the feed; saving again without `palette` and publishing removes the key from the feed scene (`"palette" in scene === false`); a scene document seeded without palette round-trips through save and publish; restoring a version that had `palette: "board"` loads it into the draft; duplicating a scene copies its palette; reset-to-default gives morning/day/afternoon `"paper"` and evening `"board"`; the night scene in the feed has no `palette` key; the copied fixture `tests/fixtures/dashboard-scenes-v1.json` validates against `scenesFeedValidator`; an invalid palette value is rejected by argument validation.
- [ ] **Step 2: Run** `pnpm test` — Expected: FAIL.
- [ ] **Step 3: Implement the backend:** add the validator and field; in `convex/dashboardScenes.ts` every place that builds a layout snapshot from explicit fields (`name`, `start`, `widgets`) also carries `palette`, written with a conditional spread so an unset palette stores no key; the feed builder does the same; night paths never set it. Add palettes to `DEFAULT_SCENES`.
- [ ] **Step 4: Implement the builder:** form state, dirty tracking and save payload in `use-scene-form.ts` include `palette`; `scene-header.tsx` renders the "Farbwelt" select for layout scenes only, using the existing `LabeledSelect` component, with the three options from the spec ("Automatisch" maps to `undefined`); `layouts.tsx` wires it like the start-time change handler.
- [ ] **Step 5: Run the gates** — Expected: PASS. Then start `pnpm dev`, and only if the page renders without a backend session skip the manual look; otherwise state in the report that the select was verified by typecheck and tests only.
- [ ] **Step 6: Update docs** (feed field, builder setting). **Commit** `feat: palette per wall scene`.

---

### Task 3: Person colour in the calendar feed

**Files:**
- Modify: `convex/lib/calendarTypes.ts`, `convex/lib/calendarValidators.ts`, `convex/calendar.ts`, `tests/fixtures/calendar-feed-v1.json` (copy), `.docs/FAMILY_APP.md`
- Test: `tests/convex/calendar-http.test.ts` (and the fixture validator test)

**Interfaces:**
- Produces: `CalendarFeedPerson.color?: string`; `calendarFeedPersonValidator` gains `color: v.optional(v.string())`.

- [ ] **Step 1: Write failing tests:** the feed's people carry each seeded user's colour; a user whose stored colour is `"green"` appears in `people` without a `color` key; the copied fixture validates.
- [ ] **Step 2: Run** `pnpm test` — Expected: FAIL.
- [ ] **Step 3: Implement:** the feed emits `color` only when the stored value matches `/^#[0-9a-fA-F]{6}$/`.
- [ ] **Step 4: Copy the calendar fixture** from the wall worktree; document the field.
- [ ] **Step 5: Run the gates** — Expected: PASS.
- [ ] **Step 6: Commit** `feat: person colour in the calendar feed`.
