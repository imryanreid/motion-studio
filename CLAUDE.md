# CLAUDE.md — Motion Studio

> **What this file is for:** How we work together on _this_ project — stack,
> conventions, and the rules specific to it. Global preferences live in
> `~/CLAUDE.md`; where the two conflict, this file wins. For what each file
> does, see [`PROJECT_MAP.md`](PROJECT_MAP.md). For where we left off, see
> [`NEXT-UP.md`](NEXT-UP.md). For the visual language, see
> [`DESIGN-LANGUAGE.md`](../Ramps%20Studio/DESIGN-LANGUAGE.md) in Ramps Studio.

## What this is

A single-page tool that generates motion tokens you can actually preview:
a set of named motions you own, each a cubic-bezier or a spring with its own
duration and a derived, deliberately faster exit, and exports for CSS, Tailwind, Framer Motion and DTCG — with the cross-platform differences stated rather than hidden.

Second tool in the **Studio Tools** family, after
[Ramps Studio](../Ramps%20Studio). Public, open source (MIT), and a portfolio
piece.

**Status: built and live** at https://www.springs.studio. The full tool ships —
named motions with bezier and spring editors, derived exits, Generate, seven
preview scenarios, the export panel with fidelity notes, per-token export
selection, URL state, and the agent surfaces (`api/render`, `/api/tokens`,
`llms.txt`, JSON-LD). See [`NEXT-UP.md`](NEXT-UP.md) for the rolling log.

## Stack

React 19 · Vite 8 · Tailwind CSS v4 · TypeScript (strict) · Motion · pnpm ·
deployed on Vercel. Same as Ramps Studio minus the color-specific packages
(`culori`, `react-colorful`).

**No database, no state, no auth.** Every token set is a pure function of the
URL. Vercel Functions may be added — as in Ramps Studio — purely so agents that
don't run JavaScript can read a share link. Nothing in `api/` may ever read or
write persistent state, so every response stays cacheable forever.

## `src/shared/` is not ours to edit

That directory is authored in **Ramps Studio** and copied here byte-for-byte.
Editing it locally means the next sync silently reverts your change.

```bash
pnpm sync          # pull the latest shared layer from Ramps Studio
pnpm sync:check    # diff only; exits non-zero on drift
```

To change something shared, change it in Ramps Studio and run `pnpm sync` here.
If a shared component needs behaviour specific to this tool, give it a **prop** —
never a branch on which tool is running.

`src/shared/` must never import from `src/lib/` or `src/components/`. One
direction only. That rule is what keeps the copy mechanical.

Run `pnpm sync:check` before any release.

### Parallel sessions and worktrees

If more than one agent is working this repo at once, **only one of them should
be anywhere near `src/shared/`** — and strictly speaking none of them should,
since it is authored in Ramps Studio. Work here splits cleanly along
`src/lib/`, `src/components/`, `api/` and the docs.

Worktrees must be created **inside `Studio Tools/`**, because
`scripts/sync-shared.sh` finds its upstream by filesystem path rather than by
git — `FAMILY_ROOT` is just the parent directory of this repo:

```bash
git worktree add "../Motion Studio-feature-x" -b feature-x origin/main
```

A worktree anywhere else looks for `Ramps Studio` beside itself, doesn't find
it, and `pnpm sync` fails. Give each session its own dev port too
(`pnpm dev --port 5184`); the default is held with `--strictPort`.

## Conventions

Inherited from Ramps Studio, and they matter more here because the two repos
share code:

- **Every file opens with a comment block** explaining what it does in plain
  language, in the banner style used across `src/`.
- **Class names go through `cn()`** (`src/shared/utils.ts`) whenever there's a
  conditional. Static class strings can stay inline.
- **Fonts are self-hosted** via Fontsource. Never a font CDN.
- **Math belongs in `src/lib/`**, not in components. Components render; `lib/`
  decides.
- **`src/lib/` and `api/` imports carry explicit `.js` extensions** so the
  Vercel Functions can import them. `src/components/` imports don't.
- **Durations, easings and springs come from `src/shared/motion.ts`.** Given
  what this tool is, hardcoding a timing here would be embarrassing.

## The things that will be easy to break

**1. The URL contract.** Once `?` params exist they're a public API — a shared
link has to keep working. Document them in `README.md`, `public/llms.txt`, the
JSON-LD in `index.html`, and any on-page legend, and change all of them
together.

**2. Machine-readability.** Being consumable by agents is a stated goal for
every tool in this family, not a nice-to-have. `robots.txt` stays permissive,
the JSON-LD stays accurate, and the page keeps rendering its full token set as
plain text in the DOM. Don't move that behind an interaction.

**3. Conversion honesty.** CSS cannot run spring physics — it approximates with
a sampled `linear()`, while Framer Motion runs the real thing. The same token
therefore behaves differently depending on which export you took. Where a value
can't be faithfully represented, the export UI must say so and show what the
approximation costs. Shipping a quiet lie here would defeat the point of the
tool. Targets are web and Figma only; see §2 and §10.1 of `SPEC.md`.

**4. The domain is live: `www.springs.studio`.** The tool is called Motion; the
domain is springs.studio. Both are correct — the family names what a tool makes,
and "springs" names a mechanism that is only one of the two easing types this
produces. `SITE_URL`, the canonical tag, `og:url`, `public/robots.txt`,
`public/sitemap.xml` and the manifest entry in **Ramps Studio** all say
`www.springs.studio` and must stay in step.

**Agent surfaces are the product, not a nicety.** `middleware.ts` sends `/` to
`api/render`, which injects the motion set into the HTML as both JSON and text,
so a fetch with JavaScript disabled returns the tokens. `/api/tokens` is the
same payload as JSON, `/llms.txt` is the contract. Anything touching `api/`,
`src/lib/agent.ts` or `src/lib/params.ts` must be verified with a **real
no-JavaScript fetch** — a browser check proves nothing, because the browser
runs the app, which is the one thing an agent doesn't do. Note that preview
deployments are SSO-protected, so that verification has to happen against
production or an unprotected deployment.

There is deliberately **no `og:image`** — Ramps points at its own `/api/og`,
Motion has no such route yet, and a card tag aimed at a 404 is worse than no
card tag. Add it and switch `twitter:card` to `summary_large_image` when the
agent surfaces land.

## Pushing

This site is live on a custom domain, so it follows the family rule: **branch,
push, Vercel preview, Ryan looks, then merge.** No direct pushes to `main` —
what's on `main` is what's in front of the world.

## Ask before

- Adding, removing, or upgrading any dependency.
- Touching `.env` files (there are none — this app needs no secrets).
- Adding state anywhere: a database, a session, a write path.

## Verify before calling it done

```bash
pnpm build && pnpm test && pnpm sync:check
```

`build` runs `tsc --noEmit` then Vite. All three must be clean. For visual
changes, load the page and check light _and_ dark. Anything touching an agent
payload must be verified without a browser — a browser is the one client that
already worked.
