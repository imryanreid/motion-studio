# Next Up

> **What this file is for:** Session handoff state — what was most recently
> built, what to do next, and known blockers. Read at the start of a session,
> update at the end. Previous sessions stay as a rolling log. Not a spec — see
> [`CLAUDE.md`](CLAUDE.md) for conventions and [`PROJECT_MAP.md`](PROJECT_MAP.md)
> for the file inventory.

## Current state

**Live** at https://www.springs.studio, indexable and agent-readable, since
2026-08-09. Has a favicon, app icons and a static OG card; the whole token set
is in the HTML without JavaScript, with `/api/tokens` and `/llms.txt` beside it.

Listed in the family as **Springs — "Motion, easings & durations"**. The tool's
own copy stays Motion: the H1, the page title, and the `motion.*` namespace it
emits. The manifest name is the shelf label.

Working: a list of named motions, each a bezier (draggable, or picked from
presets) or a spring (five presets by damping ratio, or raw physics), each with
a derived exit; Generate builds the three-level set from any one of them; seven
preview scenarios with component-first assignment; the full export panel (CSS,
Tailwind, Framer Motion, DTCG, agent markdown) with fidelity notes; the
machine-readable block; per-token export selection; and URL state. 288 tests.

## The mark became a coil (2026-08-13)

The favicon was a spring's step response drawn as two parallel strokes. It is
now a **literal coil spring**, and the reason is geometric rather than a change
of taste — worth recording so nobody re-attempts the old shape.

Two strokes stay parallel at a gap `d` only where the curve's radius of
curvature exceeds `d`. A spring that rings has a radius near **0.6 units** at
its overshoot peak against a ~2.3-unit gap, so the inner stroke folds back
through itself and leaves a visible cusp. Every alternative was tried and
measured: translating straight down keeps the two shapes identical but loses the
gap exactly where the curve is steep, merging them on the rise; scaling the
offset by local slope holds the gap but staggers the strokes apart diagonally;
capping the offset at the local radius still kinks. A search over damping,
cycles and amplitude found that only 0.75-cycle curves — barely a spring —
clear the constraint at a Ramps-like gap.

A coil is **one stroke**, so there is no offset to fold, and it is more literal.
It is an obliquely-viewed helix, `x = P·t + A·sin(t)`, `y = B·cos(t)`,
`depth = sin(t)`, with P 0.55, A 1.6, B 3.2 over 3 turns at 40°. The stroke is
split on the sign of that depth and the back halves painted first in `#2452b0`,
the front halves over them in `#8db0ff` — so the loops pass behind one another
instead of reading as a flat scribble, which also restores the two-tone weight.
Full derivation is in the comment on `public/favicon.svg`.

The family now reads as three different objects at a glance: Ramps' horizontal
bars, Beeps' vertical bars, and this coil. One caveat: a coil carries more
detail than four bars, so at 16px it reads as distinctive diagonal texture
rather than resolving into loops.

Also in this pass, via `pnpm sync`: the collapsed switcher shows the current
tool's mark, the three unbuilt tools became Depths / Texts / SVGs, and the
`llms.txt` family block is generated from the manifest by
`src/shared/scripts/build-llms.mjs` on every build. That block had omitted Beeps
entirely and still used the old names.

## Agent surfaces (2026-08-09)

`middleware.ts` sends `/` to `api/render`, which injects the motion set into the
HTML as both a JSON script and a `<pre>`. A no-JavaScript fetch of the homepage
went from 1,497 bytes to ~19,200. `/api/tokens` is the same payload as JSON,
`/llms.txt` is the contract, JSON-LD is in the head. `src/lib/agent.ts` builds
the payload and is pure, so the functions import it without React.

**Two things went wrong; both are worth remembering.**

_The renderer served the previous build's shell._ `/index.html` is a stable URL
whose contents change every deploy, so the internal fetch took a CDN hit from
the last build — and production served current tokens grafted onto a document
whose asset hash 404'd. Perfectly readable to an agent, completely broken for a
person. Fixed with `cache: "no-store"` plus a per-deployment query key. Ramps
had the identical shape and was one deploy from the same failure — PR #3 there.

_llms.txt was wrong, which is worse than absent._ It documented spring mass as a
plain number when the codec scales it ×100, and called the tolerance
thousandths when it is ten-thousandths. An agent would have followed it and
built a URL decoding to a different spring. There is now a test that parses the
worked example out of the file and asserts it decodes to what the prose claims
— and that test immediately found a real codec bug, where `decodeState`
returned early without an `e`, silently discarding `?tol=`.

**The rule this establishes:** anything touching `api/`, `src/lib/agent.ts` or
`src/lib/params.ts` gets a real no-JavaScript fetch. Note that preview
deployments are SSO-protected, so that check has to run against production —
which is why the launch shipped and was verified in that order.

## Security round 2, and the mobile pass (2026-08-10)

A reflected XSS was live on production and is closed. `decodeWarnings` — added
the day before to report what a truncated link had lost — re-read `pu` raw and
echoed it verbatim, and `JSON.stringify` does not escape `<`, so `pu=</script>…`
ended the script element and everything after it parsed as HTML. Fixed at both
ends: only `ID_OK`-shaped ids are ever quoted back, and `jsonForScript` escapes
`<` wherever JSON enters a script block in both repos. **Rejected input is the
least trustworthy thing in the system, and the warning was the one place
repeating it.**

`approximateToTolerance` no longer rebuilds its greedy chain 47 times. The
budgets are nested — worst-error-first means the set for b+1 is the set for b
plus one index — and the deviation was already being measured by the scan that
picks the next point. Production's worst repro went 6.11s to ~0.2s. Byte
identity is asserted against the old sweep across 36 spring cases plus every
bezier, because the refactor is only safe if it changes nothing.

Mobile: the page no longer spills. A grid item defaults to `min-width:auto`, so
the widest child set a floor the column could not go below. Beyond that fix,
two things are worth remembering. `min-w-0` does nothing to an element that is
not a flex or grid item — that cost two wrong fixes on the switcher before
`max-w-full` on the button turned out to be the answer. And inputs must be 16px
or Safari zooms the viewport on focus, which is what forced a whole mobile type
scale: labels 11, controls 14, inputs 16, all `sm:`-scoped.

Curve dragging is off below `sm` — an 18px target under a fingertip — and chip
groups collapse to a single trigger there.

## The last two 16px controls (2026-08-12)

`ChipGroup`'s mobile collapse was a native `<select>`, which meant it had to
render at 16px to keep Safari from zooming — so Shape and Scenario sat a size
above every control beside them. Measured on production: two elements at 16px
against 58 at 14. It read as broken because it was.

The fix was already in the file. `Menu` — a plain button — has no zoom rule to
obey, and the Components picker one row above Shape had been using it at 14px
the whole time. `ChipGroup` now collapses to that same `Menu` instead of a
`<select>`. Chips above `sm` are untouched.

**The 16px floor only binds focusable form controls.** Reach for a button and
the constraint disappears. Worth remembering before the next mobile fallback
gets written as a `<select>` — the picker wheel is not worth a broken scale.

Also fixed in passing: the popover was pinned at `top-8`, which cleared a 28px
desktop trigger but overlapped the 36px mobile one by 4px. Now `top-10 sm:top-8`
for bordered triggers; `bare` keeps `top-8`, since its negative margins bottom
it out where a 28px box does.

Left alone: the four text inputs, which genuinely must stay 16px, and the export
modal's format select, which is shared with Ramps.

**Follow-up, same day:** that collapse shipped with `width="w-full"`, which
pinned the popover to its trigger — and Shape's trigger is 90px, so `Ease
in-out` truncated to about four characters. A `<select>` sizes its own picker
and a popover does not; carrying the width over from the element being replaced
was the mistake. Now `w-max min-w-full max-w-[16rem]`, and `align="right"` so a
content-width panel under a narrow, right-of-centre trigger grows into the panel
rather than off the screen. When min and max disagree the minimum wins, which is
what keeps Scenario's full-width trigger matched at 317px.

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
selected is _derived_ by comparing values, never stored — so dragging a handle
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
rows rather than one curve behind tabs. An emphasis is a curve _and_ a duration
_and_ the purposes that reach for it; those were split across two panels and a
caption, which left the primary object of the tool represented by three tab
labels. Every row now carries its own shape (thumbnail), its duration step by
name, and what uses it, whether open or not — comparing three curves is the
design judgement and you can't make it one at a time. Hovering a row highlights
the step it points at in the scale above, which is the tie drawn rather than
described.

**Pinning is gone as a concept, not as a capability.** You override a step by
typing a value into it; an authored number is drawn in a box and a generated
one isn't. The box is on the _number_, never on the cell — that bug came back
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

- **vite dev-only advisories in Ramps.** Eleven, all under `.>vite` — seven
  high, including a `server.fs.deny` bypass that allows arbitrary file read
  from the dev server. **Nothing reaches the production bundle**, and Motion
  audits clean. It is lockfile drift, not policy: both declare `vite ^8.0.0`,
  Motion resolved 8.2.0, Ramps is pinned at 8.0.3. `pnpm update vite` fixes it
  inside the existing range. Needs Ryan's approval — dependency change.
- **No Content-Security-Policy beyond `frame-ancestors`.** A real one would
  have downgraded the reflected XSS from executing to merely ugly. Deferred on
  purpose: Vite's output plus the inline JSON-LD needs hashes or a nonce, which
  is design work, not a one-liner.
- **No real agent has consumed either site end to end.** Every legibility claim
  is a simulation of what one would do. It is the largest untested assertion in
  the project and costs one paste of the agent prompt into a fresh session.
- **Never run `git add -A` in these repos.** Ryan works across concurrent
  sessions on a shared checkout, and a `Sound` → `Beeps` rename he made in the
  Ramps working tree was swept into an unrelated mobile PR and shipped to
  production without appearing in its description. Stage explicit paths.

- **Browser-pane caveat, for agents only.** The in-app browser pane renders
  pages as a _hidden_ tab: `requestAnimationFrame` fires zero frames and
  `setTimeout` is clamped to ~1/sec, so nothing animates and any UI behind an
  `AnimatePresence mode="wait"` swap (the export modal's chooser → code stage)
  cannot be reached there at all — it presents as a dead click. Verify layout
  with `getBoundingClientRect` or by server-rendering the component. This is a
  limitation of that pane, not of the app: the preview animation works, and has
  been in daily use throughout the build.

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
