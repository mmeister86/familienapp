# AGENTS.md

Read `PLAN.md` before doing anything. It is the source of truth for scope, data model and phases.

## Workflow
- Work on **one phase** (or one task from `backlog/`) per session. Do not start the next phase unprompted.
- Before finishing: `pnpm typecheck`, `pnpm lint`, and `npx convex dev --once` must pass.
- Small commits, Conventional Commits (`feat:`, `fix:`, `chore:` …).
- Ask before adding dependencies that are not listed in `PLAN.md`.
- If something in `PLAN.md` is unclear or seems wrong, stop and ask instead of guessing.

## Conventions
- Code, identifiers, comments: English. UI strings: German.
- TypeScript strict, no `any`.
- pnpm only.
- All "day" logic uses `Europe/Berlin` via the helpers in `convex/lib/dates.ts`. Never use `new Date().toISOString().slice(0, 10)` for dates.
- Dates stored as `"YYYY-MM-DD"` strings, timestamps as `number` (ms).

## UI
- Components: shadcn/ui (Base UI variant) + UIAble via `npx shadcn add @uiable/<component>`. Check UIAble first before building a component yourself.
- Never use `@uiable-pro`. Replace Next.js imports (`next/link`, `next/image`, `next/navigation`) in pulled components.
- Phone and laptop are both first-class: check every screen at 390 px, 820 px and 1440 px. Everything must work with mouse + keyboard.

## Security (non-negotiable)
- Every public Convex query/mutation takes `token` and calls `requireUser` or `requireParent` first.
- Kids only ever get their own `childSnapshots`; the check lives in the query, not in the UI.
- Never return `pinHash`, `pinSalt` or session tokens of other users.
- Never commit `.env.local`, PINs or admin keys.
- `localStorage` only holds the session token.

## Convex
- Validators (`v.*`) on every function argument.
- Use indexes, no `.filter()` scans on growing tables.
- Internal logic as `internalMutation` / `internalAction`; only expose what the UI needs.
- Recurrence and date logic as pure functions with unit tests (Vitest).
