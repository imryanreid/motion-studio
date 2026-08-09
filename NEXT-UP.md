# Next Up

> **What this file is for:** Session handoff state — what was most recently
> built, what to do next, and known blockers. Read at the start of a session,
> update at the end. Previous sessions stay as a rolling log. Not a spec — see
> [`CLAUDE.md`](CLAUDE.md) for conventions and [`PROJECT_MAP.md`](PROJECT_MAP.md)
> for the file inventory.

## Current state

**Rough version live** at https://motion-studio-silk.vercel.app — still
`noindex` with `robots.txt` disallowed, because there is no domain yet.

Working: a list of named motions, each a bezier (draggable, or picked from
presets) or a spring (five presets by damping ratio, or raw physics), each with
a derived exit; Generate builds the three-level set from any one of them; seven
preview scenarios with component-first assignment; the full export panel (CSS,
Tailwind, Framer Motion, DTCG, agent markdown) with fidelity notes; the
machine-readable block; per-token export selection; and URL state. 216 tests.

## Choosing what ships

Each row of the output table has an Export checkbox. `MotionState.excluded`
holds `${entryId}.${direction}` keys — entry id, not slug, so a rename doesn't
un-exclude anything. URL param `xt`, `*` between the halves of a key and `.`
between keys.

The part worth remembering: **the risk was never the missing token, it was the
alias left pointing at it.** A purpose aliasing an excluded direction emits a
`var()` that resolves to nothing in CSS and a variable Figma rejects on DTCG
import. So `purposeExports()` drops the direction, and a test walks the CSS
asserting every referenced custom property was also declared. Every exporter
reads `exportedSemantics()` rather than filtering for itself, so a new format
can't forget. Preview deliberately still uses `resolveSemantics()` — you should
be able to watch a motion you're deciding whether to ship.

## The model rewrite

The five-step duration scale and the fixed three emphasis levels are **gone**.
The model is now a list of motions you own — name, curve, duration, exit — with
purposes pointing at them by id. `SPEC.md` §3 is the record; the short version:

- **Live within an entry, one-time between entries.** Exits still derive from
  their own entrance, always. Everything between motions (Generate, "make one
  like this but slower") seeds a value once and lets go. No links, no anchor,
  no multipliers to keep in sync.
- **Duration, exit and the link idea are bezier-only.** A spring row doesn't
  render them at all. That's what killed the "spring has no duration" wrinkle —
  nothing forces a slot on it.
- **Derivations are named transforms, not multipliers**, applied in each type's
  own units. `faster` on a spring scales ω₀ and holds ζ, so it's the same
  spring, quicker. A multiplier could never express that.
- **The shipped default is what Generate produces** — three beziers at
  140/200/280. It used to be a mixed set, which promised Generate would hand
  you a spring.
- Names are yours (24 chars, `A-Za-z0-9 _-`), slugified and deduplicated for
  export. Up to 12 motions.

**No stored primary.** Generate asks which motion to build from when you press
it. The radio on every row was a permanent control for a momentary decision —
and removing it also removed a state field, the `p` URL param, and the
promote-someone-else rule on delete.

**Presets are the shape selector, for both types**, with the raw numbers behind
"Custom". Springs got five presets picked by damping ratio. Which one is
selected is *derived* by comparing values, never stored — so dragging a handle
lands on Custom with nothing having to notice, and a hand-edited link shows the
truth on arrival.

**Nothing in the model is global.** Stagger moved onto the motion (a 140ms
entrance wants a tighter stagger than a 400ms one), and `staggerDecay` became a
constant — it never had a control. Exports gained
`--motion-<slug>-stagger` with purpose aliases, and the Framer output a
`stagger` object keyed by slug.

**The exit can be unlinked.** A link button between Duration and Exit switches
it between a share of the entrance and its own ms value; both persist, so
toggling loses neither. In the URL the exit is self-describing — `r70` or
`a140` — so a link missing the field falls back to linked rather than to a
silent absolute that would quietly stop tracking.

**Assignment moved onto the motion**, as a checkbox list behind a count, with
each row naming the component's current owner since ticking moves it.

**The URL contract changed completely** — `e` (repeated, one per motion,
now always six fields for both types) and `pu`, plus `tol`. The `sg` global
stagger param is gone. Old links no longer decode; they
degrade to defaults rather than erroring. This was the cheap moment: placeholder
domain, `noindex`, no links in the wild.

Field separator is `*`, not `~`. URLSearchParams percent-encodes `~` despite it
being unreserved in RFC 3986 — only `*`, `-`, `.` and `_` survive.

### Found on the way: `motionSettlingTime` is blunt

Motion's `calcGeneratorDuration` reports **600ms for both** `spring(210, 20)`
and `spring(412, 28)`, even though the closed form puts them at 583ms and 419ms
— a real 1.4× difference it walks straight past. It rounds to a 50ms grid and
samples too coarsely to find the faster spring's rest window.

Consequence: a spring's reported duration can be overstated by ~40%, which also
means the CSS `linear()` runs that much longer than the Framer version of the
same token — the exact cross-format drift this tool exists to catch. Switching
the display and exports to our own `settlingTime` would fix it, at the cost of
no longer reporting "what Framer Motion will compute". **Not changed — needs a
decision.** The tests assert the physics and only require Motion's number never
to move the wrong way.

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

- **Domain: `springs.studio`.** Bought, not yet configured — `motion.studio`
  was taken. Nothing is crawlable until it is pointed here, so the site stays
  `noindex` with `robots.txt` disallowing everything in the meantime.

  When it is hooked up, flip together:
  - `index.html` — canonical, `og:url`, and the robots meta
  - `public/robots.txt` — allow, and point agents at `/llms.txt`
  - `public/sitemap.xml`
  - `src/lib/site.ts` — `SITE_URL`
  - the manifest entry in **Ramps Studio** (`src/shared/tools.ts`): set
    `domain: "springs.studio"`, add a `wordmark`, and flip `status` from
    `"soon"` to `"live"` — then `pnpm sync` so every tool's switcher links out.
    That one is a Ramps change, so it needs a branch.

  Worth deciding at the same time: the tool is named Motion and the domain is
  springs.studio, so the switcher wordmark and the title prefix have to pick
  one. The titles currently read `Motion · …`.
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
