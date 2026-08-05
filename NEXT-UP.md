# Next Up

> **What this file is for:** Session handoff state — what was most recently
> built, what to do next, and known blockers. Read at the start of a session,
> update at the end. Previous sessions stay as a rolling log. Not a spec — see
> [`CLAUDE.md`](CLAUDE.md) for conventions and [`PROJECT_MAP.md`](PROJECT_MAP.md)
> for the file inventory.

## Current state

**Scaffolded, not built.** The shared layer is synced from Ramps Studio and the
page shell renders in light and dark. `pnpm build`, `pnpm test` and
`pnpm sync:check` are clean. `src/App.tsx` is a placeholder.

## Next

1. **Write `SPEC.md`** — curve editor (bezier + spring), duration scale,
   semantic enter/exit pairs, the preview surface, reduced motion, and the
   export panel. This is the gate; nothing else starts until it's approved.
2. Build against the spec, small commits.

## Blockers / open questions

- **No domain.** `motion.studio` isn't registered, so `index.html` carries no
  canonical and is `noindex`, and the manifest entry in Ramps Studio has no
  `domain` and renders as "soon". All of those flip together when it exists.
- **No `api/` yet.** The family standard is `middleware.ts` + `api/render` +
  `api/palette` + `api/og` so agents that don't run JavaScript can read a share
  link. Port them once there's a token set worth serving.
- **No repo or Vercel project yet.** Local git only.

## Session log

### 2026-08-05 — Scaffolded on the shared layer

Created as the pilot consumer for `src/shared`, extracted from Ramps Studio the
same day. Copying the directory in immediately found two defects that were
invisible from one repo:

- `shared/` relied on the host's `src/vite-env.d.ts` for asset module types, so
  the build failed the moment it landed somewhere without one. Fixed upstream
  with `src/shared/env.d.ts`.
- `ToolShell` reserved the control band's spacing even for a tool with no
  controls, leaving a large empty gap; and `ToolDirectory` rendered both "you
  are here" and "soon" on the current tool. Both fixed upstream and re-synced.

That is the sharing mechanism working as intended — the second consumer is what
proves the first extraction was wrong.
