# Next Up

> **What this file is for:** Session handoff state — what was most recently
> built, what to do next, and known blockers. Read at the start of a session,
> update at the end. Previous sessions stay as a rolling log. Not a spec — see
> [`CLAUDE.md`](CLAUDE.md) for conventions and [`PROJECT_MAP.md`](PROJECT_MAP.md)
> for the file inventory.

## Current state

**Rough version live** at https://motion-studio-silk.vercel.app — still
`noindex` with `robots.txt` disallowed, because there is no domain yet.

Working: the five-duration generated scale with per-step pinning, three easings
each editable as a bezier (draggable) or a spring (parameters), six semantic
tokens with derived exits, five preview scenarios, the full export panel (CSS,
Tailwind, Framer Motion, DTCG, agent markdown) with fidelity notes, the
machine-readable block, and URL state. 161 tests.

## Deferred from the first pass

Called out rather than quietly dropped:

1. **Scrubbing.** The timeline is read-only; the clock exists and is seekable,
   so this is wiring a drag to it.
2. **A/B compare**, including the "true spring vs the linear() you'd ship" mode
   that SPEC §8.3 calls the honesty thesis made visible.
3. **The `-sm`/`-md`/`-lg` distance buckets** (§6.2). The rule is documented in
   the agent markdown; the tokens aren't generated yet.
4. **Agent surfaces** — `middleware.ts`, `api/render`, `api/tokens`, `llms.txt`,
   JSON-LD. The on-page block exists; the no-JavaScript path does not, so this
   tool is not yet agent-readable the way Ramps is. Highest-value next item.
5. **Purpose aliases aren't editable or droppable** in the UI, though the model
   supports it.

## Blockers / open questions

- **No domain.** `motion.studio` is taken. When one is chosen, flip together:
  `index.html` canonical + `og:url` + robots meta, `public/robots.txt`,
  `public/sitemap.xml`, `src/lib/site.ts`, and the manifest entry in **Ramps
  Studio** (then `pnpm sync`).
- **The preview animation has not been observed running.** The browser pane used
  during the build throttles `requestAnimationFrame` while hidden, so `elapsed`
  stayed at 0 in every check. The timeline maths is unit-tested in
  `lib/preview.ts`, but nobody has watched it move — worth a human eyeballing
  before anything is built on top of it.

## Session log

### 2026-08-05 — SPEC.md written

Covers the token model (emphasis × direction, with purposes as aliases), the
spring maths and its closed form, the conversion fidelity truth table, the
preview harness, the distance rule, all five exports, and a family-level section
on the export experience.

Four things were verified against sources rather than asserted: CSS `linear()`
reached Baseline in June 2026 and there is no native CSS spring easing; DTCG has
`duration`, `cubicBezier` and a `transition` composite but **no spring type**;
Motion's spring parameters and its `visualDuration`/`bounce` alternative; and
SwiftUI's `Spring` parameterization, which the agent block documents even though
we ship no SwiftUI tab.

Five more are flagged in §12 as verify-before-you-depend-on-it, the important one
being the closed-form spring against Motion's actual output. If they diverge,
Motion wins.

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
