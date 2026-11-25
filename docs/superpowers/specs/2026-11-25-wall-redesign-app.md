# Family app: mirror of the wall redesign

The wall dashboard (repo `familydash`, branch `feat/wall-redesign`) gets a new
look and two new tiles. The family app owns the scene builder and the feeds
the wall reads, so it has to carry the same contract. The wall's spec is
`../familydash/.worktrees/wall-redesign/docs/superpowers/specs/2026-11-25-wall-redesign/spec.md`
(sibling checkout); this document lists only what the app must do.

## Widget catalog

- New types, appended after `calendars` in this order:
  `dayband` — name "Tagesband", minimum 8 x 4; `week` — name "Woche", minimum 6 x 5.
- `shopping` minimum drops from 4 x 4 to 4 x 2.
- Neither new type has settings; both may serve as a fallback.
- Builder icons: `dayband` uses lucide `ChartGantt`, `week` uses `CalendarDays`.

## Palette per scene

- A layout scene snapshot (draft, published, version) may carry
  `palette: "paper" | "board"`. Missing means "let the wall decide by time of
  day". Night scenes never carry one.
- The scenes feed (`GET /dashboard/scenes`) passes the published palette
  through on layout scenes and omits the key when unset.
- The builder header shows a select "Farbwelt" for layout scenes with the
  options "Automatisch" (unset), "Papier (hell)" and "Tafel (dunkel)". It is
  part of the draft like the name and start times: saved with the draft,
  published with the scene, restored with a version, copied when a scene is
  duplicated.
- Built-in scenes: morning, day, afternoon `paper`; evening `board`.

## Built-in afternoon scene

clock `{x:0,y:0,w:12,h:3}` props `wide: true, hints: false`; dayband
`{x:0,y:3,w:12,h:4}`; school `{x:0,y:7,w:12,h:8}` props
`mode: "full", mealDay: "today"`; week `{x:0,y:15,w:12,h:7}`; shopping
`{x:0,y:22,w:12,h:2}`. Widget ids equal their types. Existing published
scenes in the database are not migrated; "Auf Standard zurücksetzen" brings
the new layout.

## Person colour in the calendar feed

Each entry of `people` in `GET /dashboard/calendars` carries the user's
`color` (already stored on the user, `#RRGGBB`).

## Contract fixtures

`tests/fixtures/dashboard-scenes-v1.json` and
`tests/fixtures/calendar-feed-v1.json` are byte-identical to
`testdata/dashboard-scenes-v1.json` and `testdata/calendar-feed-v1.json` in
the wall repository's `feat/wall-redesign` worktree.

## Rollout note (for the human)

Deploy the wall first: an older wall rejects a feed that contains `dayband`
or `week`. `npx convex dev --once` deploys to the production backend and is
not part of this work.
