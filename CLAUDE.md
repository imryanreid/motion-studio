# CLAUDE.md — Motion Studio

> **What this file is for:** How we work together on _this_ project — stack,
> conventions, and the rules specific to it. Global preferences live in
> `~/CLAUDE.md`; where the two conflict, this file wins. For what each file
> does, see [`PROJECT_MAP.md`](PROJECT_MAP.md). For where we left off, see
> [`NEXT-UP.md`](NEXT-UP.md). For the visual language, see
> [`DESIGN-LANGUAGE.md`](../Ramps%20Studio/DESIGN-LANGUAGE.md) in Ramps Studio.

## What this is

A single-page tool that generates motion tokens you can actually preview:
cubic-bezier and spring easing, a named duration scale, deliberately asymmetric
enter/exit pairs, and exports for CSS, Tailwind, Framer Motion and DTCG — with the cross-platform differences stated rather than hidden.

Second tool in the **Studio Tools** family, after
[Ramps Studio](../Ramps%20Studio). Public, open source (MIT), and a portfolio
piece.

**Status: scaffolded, not built.** The shared layer is in place and the page
shell renders. The generators land after `SPEC.md` is approved.

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

**4. There is no domain yet.** `index.html` deliberately carries no canonical,
no `og:url` and `noindex`, and the tools manifest gives `motion` no `domain`.
When the domain is registered, all of those change together — plus
`public/robots.txt`, `public/sitemap.xml`, and the manifest entry in **Ramps
Studio** (then `pnpm sync`).

## Pushing

No custom domain yet, so pushes go straight to `main`. **That changes the moment
a domain is live**: from then on this repo follows the family rule — branch, push,
Vercel preview, Ryan looks, then merge. Add that rule to this file at the same
time as the canonical tag, sitemap, robots and manifest entry (see §4 above), and
copy the wording from Ramps Studio's `CLAUDE.md`.

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
