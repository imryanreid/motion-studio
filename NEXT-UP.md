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
tokens with derived exits, seven preview scenarios, the full export panel (CSS,
Tailwind, Framer Motion, DTCG, agent markdown) with fidelity notes, the
machine-readable block, and URL state. 178 tests.

## Layout, third pass

Two structural fixes, both from the same diagnosis: the page was organised by
mechanism, and neither of the two things you actually author had a home.

**The scale.** `base` is no longer an input sitting above the strip it
generates — it leads the strip, in its own bordered box, with the four derived
steps in scale order after a gap and each labelled with the factor that
produced it (`÷1.4`, `×1.96`). Numeric order would put base in position three,
which is not where the eye lands. Bordered means authored, filled means
generated; that is the only legend. A second aligned row of exit durations
under the first names the enter values as entrances and sits the exit slider
directly under the numbers it drives. `snap` is now labelled "round to", and
hovering a derived step shows the unrounded arithmetic.

Consequence: **`base` is no longer pinnable**, and `decodePins` drops a base pin
from a hand-edited URL. Pinning the anchor would let the cell labelled `base`
hold a value the rest of the scale isn't derived from.

**The emphasis.** The "Easing" panel is now "Emphasis", an accordion of three
rows rather than one curve behind tabs. An emphasis is a curve *and* a duration
*and* the purposes that reach for it; those were split across two panels and a
caption, which left the primary object of the tool represented by three tab
labels. Every row now carries its own shape (thumbnail), its duration step by
name, and what uses it, whether open or not — comparing three curves is the
design judgement and you can't make it one at a time. Hovering a row highlights
the step it points at in the scale above, which is the tie drawn rather than
described.

**Pinning is gone as a concept, not as a capability.** You override a step by
typing a value into it; an authored number is drawn in a box and a generated
one isn't. The box is on the *number*, never on the cell — that bug came back
twice, because a box around a region always ends up containing a derived value.
`↺` releases a step back onto the curve. `DEFAULT_STATE.pins` is now `{}`, so
the shipped scale is **100 / 140 / 200 / 280 / 390**, purely generated.

**Enter and exit are paired inside each step**, not split into two rows — the
pair anyone reasons about is "fast in, fast out". That freed the exit share to
join `ratio` and `round to` in the header, where all three multipliers now get
one row and one treatment, because they are one kind of thing.

**Assignment runs component-first.** Which emphasis a purpose uses is set on
the purpose, in the preview band — "I'm building a drawer, what should it feel
like?", not "I have an emphasized spring, what should use it?". This breaks the
earlier rule that nothing in the preview panel edits a token, and the rule was
wrong: assigning a purpose is simultaneously a token decision and a
what-am-I-watching decision. They are one act. The split is therefore **the
system (left) vs. one component in it (right)**, not edit vs. watch.

## Layout, second pass

The first pass copied Ramps' layout but assigned the wrong thing to "output".
Ramps' artifact is the swatch grid — static, always on screen, updating as you
fiddle. Motion's artifact is motion, which only exists in time, so the preview
_is_ the artifact surface. Putting it below 700px of easing cards showed the
controls and hid the thing they controlled.

Now: scale band → preview and easing editor side by side above the fold →
durations → semantics. The three curves stay comparable as thumbnails and only
the selected one expands, which is what makes the two-column fit. Selecting a
curve switches the preview to a scenario that uses it, so the causal link is
physical rather than explained.

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
5. ~~Purpose aliases aren't editable~~ — done, on the scenario band. Still not
   **droppable**: you can point a purpose at a different emphasis but not
   remove it from the set.

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
