# SPEC — Motion Token Generator

> **What this file is for:** What we're building and why, decided before any of
> it is built. Behaviour, the token model, the maths, and the export contract.
> Not a task list and not a progress log — see [`NEXT-UP.md`](NEXT-UP.md) for
> state, [`CLAUDE.md`](CLAUDE.md) for conventions, and
> [`DESIGN-LANGUAGE.md`](../Ramps%20Studio/DESIGN-LANGUAGE.md) for the family's
> visual language. Section 10 is family-level and governs every tool, not just
> this one.

---

## 1. The thesis

Motion is the least systematized part of most design systems. Colour has ramps,
type has scales, spacing has grids — motion usually has a few durations someone
picked once and a couple of easing curves copied off a blog.

Two reasons, and the tool exists to fix both:

**You can't evaluate motion honestly.** Every easing tool previews on a dot
moving along a track. Nobody ships a dot. A curve that looks lively on a 300px
track feels sluggish on a 40px toggle and frantic on a full-height drawer, and
you can't tell until it's in the product.

**Motion tokens don't survive contact with a second runtime.** CSS can't run
spring physics; it approximates. So the same "spring" means two different things
depending on whether it went through a stylesheet or a JS animation library —
and nothing tells you what the difference costs.

So: preview on real UI, and measure the gap rather than hide it.

---

## 2. Scope

**Targets: web and Figma.** CSS, Tailwind, Framer Motion, DTCG JSON, and a
markdown block written for an agent. No SwiftUI or Compose emitters — see §10.1
for the family-level reasoning and §9.5 for what we do instead.

**Non-negotiable, inherited from the family brief:**

- 100% client-side computation. No database, no auth, no keys, no analytics
  beyond Vercel's beacons.
- No persistence layer. Full app state encodes into the URL query string.
- Deploys as a static site; the client bundle alone is a complete working tool.
  Vercel Functions may be added, as in Ramps Studio, **only** to serve agents
  that don't run JavaScript — pure functions of the query string, cacheable
  forever, never reading or writing state.
- Minimal dependencies. This spec adds **none** — see §11.
- Nothing to operate after launch.

---

## 3. The token model

Two layers. Primitives hold values; semantics compose them; purposes are
aliases, not copies.

### 3.1 Primitives

```
duration    instant · fast · base · slow · deliberate      5 values
easing      subtle · standard · emphasized                 3 curves,
                                                           each a bezier OR a spring
```

**Durations are generated, not hand-entered.** From a base and a ratio, rounded
to a grid, with any step overridable — the same auto-until-you-touch-it idiom
Ramps uses for its accents, and the same round-to-a-grid idea Shape uses for
spacing.

```
step(n) = round_to(snap,  base × ratio^n)      n ∈ {−2, −1, 0, 1, 2}
```

Defaults: `base 200ms`, `ratio 1.4`, `round to 10ms`.

| Token        | Unrounded | Shipped | For                                         |
| ------------ | --------- | ------- | ------------------------------------------- |
| `instant`    | 102.04ms  | 100ms   | Feedback that must read as cause and effect |
| `fast`       | 142.86ms  | 140ms   | Small state changes, hovers, checkboxes     |
| `base`       | 200ms     | 200ms   | The default for anything unspecified        |
| `slow`       | 280ms     | 280ms   | Surfaces entering, larger travel            |
| `deliberate` | 392ms     | 390ms   | Motion that is meant to be noticed          |

**Nothing ships overridden.** `instant` used to ship pinned at 80ms, on the
argument that feedback has to sit under roughly 100ms whatever the rest of the
scale does and the generated value doesn't. That argument ignored rounding:
102.04ms lands on exactly 100ms. The pin was buying 80-over-100, which is taste
rather than correctness, and a tool whose whole claim is "this is a system"
should not ship an exception to its own system on load.

Any step can still be overridden, and the interaction is simply **typing a
value into it** — no pin, no icon, no verb. An authored number is drawn in a
box and a generated one isn't, which is the panel's entire legend: **a box
around a number means that number was typed.** The box is on the number and
never on the cell, because a box around a region claims everything inside it is
editable and there is always a derived value in there. A small ↺ puts the step
back on the curve. The ratio is the lesson; the override is the escape hatch.

### 3.2 Semantics — emphasis × direction

Six tokens. Emphasis is _how much attention the change deserves_; direction is
enter or exit.

```
motion.subtle.enter      motion.subtle.exit
motion.standard.enter    motion.standard.exit
motion.emphasized.enter  motion.emphasized.exit
```

Each resolves to `{ duration, easing, delay? }`.

Plus one standalone: `motion.stagger` — a per-child offset with an optional
decay factor (§7.3).

### 3.3 Purposes are aliases

A thin naming layer over the six, because "which one do I grab for a drawer?"
is the question people actually have:

| Purpose    | Aliases      |
| ---------- | ------------ |
| `state`    | `subtle`     |
| `dropdown` | `standard`   |
| `tooltip`  | `standard`   |
| `toast`    | `emphasized` |
| `drawer`   | `emphasized` |
| `modal`    | `emphasized` |

**Aliases are references, never copies.** In every format that supports
indirection they emit as references — `var(--motion-emphasized-enter)` in CSS,
`{motion.emphasized.enter}` in DTCG. In formats that can't alias, they resolve
to the same literal _and the export states which primitive it came from_.

This is not fussiness. Ramps has the same hazard in its Figma export, where a
token aliasing an excluded ramp would produce a dangling variable reference that
Figma rejects on import. An alias that silently becomes a second copy of a value
is the same bug wearing different clothes.

The purpose list is editable and its entries are droppable, so someone who finds
it noise can export the six primitives alone.

**Why this layer stays**, having been challenged: it gives a person and their
agent a _shared vocabulary_. "Use the drawer motion" is unambiguous to both, in
a way "use emphasized enter at 280ms" is not — and agents lean on that naming
heavily. The six primitives are the system; the purposes are how people talk
about it. Both earn their place.

---

## 4. The curve editor

One editor, two modes, switched by a segmented control. A named easing is
_either_ a bezier or a spring — never both, never a spring "expressed as" a
bezier behind the scenes.

### 4.1 Bezier mode

Standard `cubic-bezier(x1, y1, x2, y2)`.

- Draggable handles on an SVG plot, plus four numeric fields, each editing the
  same state.
- `x1` and `x2` clamp to [0, 1] — required by CSS and by the definition of a
  timing function. `y1` and `y2` are unbounded, which is what allows a single
  overshoot.
- Presets for the common curves (`ease-out`, `ease-in`, `ease-in-out`, plus the
  Material-style `standard`), as starting points that immediately become custom
  on the first drag.
- Live readout of the CSS string, click to copy.

Evaluating a bezier at a given time requires solving for the parameter `t` given
`x` — Newton-Raphson with a bisection fallback, the standard approach. This is
~30 lines and needs no dependency.

### 4.2 Spring mode

A damped harmonic oscillator, parameterized as Framer Motion does it, because
that is the most common runtime target:

| Input            | Symbol | Default | Range    |
| ---------------- | ------ | ------- | -------- |
| Stiffness        | `k`    | 210     | 1–1000   |
| Damping          | `c`    | 20      | 0–100    |
| Mass             | `m`    | 1       | 0.1–10   |
| Initial velocity | `v₀`   | 0       | −100–100 |

Derived and shown live, because they're what actually predicts the feel:

- **Damping ratio** ζ = `c / (2·√(k·m))` — under 1 bounces, 1 is critical, over
  1 crawls in.
- **Natural frequency** ω₀ = `√(k / m)` rad/s.
- **Overshoot**: peak value and how many extrema exceed the settle tolerance.
- **Settling time** — with a loud caveat, see §5.4.

### 4.3 Converting between the two

Offered where it's meaningful, refused where it isn't. See the truth table in
§5.5.

---

## 5. The maths

The correctness-critical part of the tool. Everything here is computed, not
approximated by eye, and everything here gets unit tests.

### 5.1 The spring has a closed form

For displacement `x` from the target, `m·x″ + c·x′ + k·x = 0`. Normalising by
mass gives `x″ + 2ζω₀x′ + ω₀²x = 0`, which has **exact analytic solutions** —
no numerical integration, no `requestAnimationFrame` accumulation, no drift.

With progress `p(0) = 0` heading to `p(∞) = 1`, and `ω_d = ω₀√(1 − ζ²)`:

```
ζ < 1   p(t) = 1 − e^(−ζω₀t)·[ cos(ω_d·t) + ((ζω₀ − v₀)/ω_d)·sin(ω_d·t) ]
ζ = 1   p(t) = 1 − e^(−ω₀t)·[ 1 + (ω₀ − v₀)·t ]
ζ > 1   p(t) = 1 − (A·e^(r₁t) + B·e^(r₂t)),  r₁,₂ = ω₀(−ζ ± √(ζ² − 1))
```

Two consequences worth stating: the `linear()` sampling in §5.3 is **exact at
every sample**, and the error figure the export reports is a real measurement
rather than an estimate.

**These formulas must be verified numerically against Motion's own spring
output, not trusted.** Matching the runtime people will actually use matters
more than matching a textbook. Test at ≥200 sample points across a spread of
(k, c, m, v₀) including all three damping regimes; tolerance 1e-4 in progress.
If Motion diverges, Motion wins and the divergence gets documented.

### 5.2 Mass normalises away, losslessly

Only `k/m` and `c/m` appear in the normalised equation, so `(m, k, c)` and
`(1, k/m, c/m)` produce **identical motion**. This matters because some runtimes
fix mass at 1. Normalising is not an approximation and must not be reported as
one.

### 5.3 Spring → CSS `linear()`

CSS cannot run spring physics. [`linear()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/easing-function/linear)
reached Baseline in June 2026 and takes a piecewise-linear polyline whose values
may exceed 1 or fall below 0 — which is exactly what overshoot needs. There is
no native CSS spring easing; this is the mechanism.

- Sample `p(t)` across `[0, t_settle]` and emit `linear(0, 0.31 12%, 1.04 34%, …)`.
- **Adaptive sampling**, not uniform: place points by curvature so a bouncy
  spring spends its budget on the bounces. For a given point count this cuts
  error substantially versus uniform spacing.
- Sample count is a user control, defaulting to 24, with live readout of both
  the resulting error and the string length.

**Reported error**, recomputed on every change:

- **Max deviation** — the largest `|p_true(t) − p_linear(t)|`, as a percentage
  of total travel, measured over a dense sweep (≥1000 points).
- **Temporal error** — the largest horizontal gap between the two curves, in ms.
  Usually the more intuitive of the two: "this arrives up to 8ms early."
- **String length** in bytes, because a 100-sample `linear()` is not free.

### 5.4 A spring has no duration

It approaches its target asymptotically and never arrives. Any "duration" is a
**settling threshold**, and different runtimes pick different ones — Motion uses
`restDelta` and `restSpeed`, other systems use other tolerances.

So the same spring honestly reports different durations on different platforms.
The tool must:

- State the threshold it used alongside every settling time, never a bare number.
- Default to Motion's convention, since Framer Motion is an export target.
- Expose the threshold as a control, because it changes the CSS output — the
  `linear()` sampling window is `[0, t_settle]`.

This is the single most surprising thing about spring tokens and it gets said in
the UI, not just here.

### 5.5 Conversion fidelity — the truth table

| From → To                        | Fidelity            | Notes                                                                                                                                       |
| -------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Bezier → CSS / Tailwind / Framer | **Exact**           | All take the same four control points                                                                                                       |
| Spring → Framer Motion           | **Exact**           | Same parameters, same physics                                                                                                               |
| Spring (m,k,c) → mass-1 form     | **Exact**           | §5.2 — a reparameterization                                                                                                                 |
| Spring → CSS `linear()`          | **Lossy, measured** | §5.3. Error always shown                                                                                                                    |
| Spring → cubic-bezier            | **Conditional**     | Allowed only when ≤1 extremum exceeds tolerance; a bezier can express one overshoot but cannot oscillate. Otherwise refused with the reason |
| Bezier → spring                  | **Approximate**     | Monotonic curves only; fitted by least squares over ζ and ω₀, with residual reported                                                        |
| Duration + easing → DTCG         | **Exact**           | `duration`, `cubicBezier`, `transition` are all in the spec                                                                                 |
| Spring → DTCG                    | **Unrepresentable** | No spring type exists — §9.4                                                                                                                |

**Refusing is a feature.** Where a conversion can't be faithful, the tool says
so and explains why, rather than emitting a plausible-looking wrong answer. This
is the same stance as Ramps badging a contrast shortfall honestly instead of
faking a pass.

---

## 6. The duration scale, and travel distance

### 6.1 The rule

Duration should grow with travel distance — but **sub-linearly**, because
perceived speed isn't linear in distance. A drawer crossing 600px shouldn't take
six times a 100px slide.

```
d = base × clamp( (travel / reference)^exponent, 0.6, 1.8 )
```

Defaults: `reference = 160px`, `exponent = 0.5`. Both are controls.

### 6.2 How it reaches the output — the decision

CSS cannot evaluate that formula at transition time, so **the lookup table is
normative and the formula is a documented escape hatch.** This is chosen for
agent reliability specifically:

- A rule alone forces the consumer to do arithmetic and pick a reference
  distance. Different consumers pick differently, so the same tool produces
  non-reproducible output. That breaks the property Ramps has and this tool
  should keep.
- A table alone is deterministic but can't cover a case outside its buckets.
- Both, with an explicit instruction about which to use when, is deterministic
  by default and extensible at the edges.

```css
--motion-drawer-enter-sm: 200ms; /* travel ≤ 120px      */
--motion-drawer-enter-md: 280ms; /* 120–320px           */
--motion-drawer-enter-lg: 360ms; /* > 320px             */
```

Bucket values are evaluated at a stated representative travel — 80 / 200 / 480px
— and the export says so.

### 6.3 Only motions that travel get variants

A checkbox filling has no distance. Each purpose declares `travels: boolean`;
only those get the `-sm/-md/-lg` set. `subtle` never does. This keeps the output
from tripling for no reason.

---

## 7. Semantic pairs

### 7.1 Exits are faster and flatter

The default the tool teaches. An entrance introduces something and can afford
character; an exit is removing something the user has already finished with, and
lingering on it feels like lag.

- **Exit duration** = enter × `0.7` (the ratio is a control).
- **Exit easing** is forced toward the linear end: a bezier exit defaults to
  ease-in shape; a spring exit defaults to ζ ≥ 1, i.e. no bounce.

Both are defaults, not locks. Overriding is one click, but you have to actually
do it — the tool teaches by defaulting, and the agent block states the rule as a
rule.

### 7.2 Emphasis

| Emphasis     | Duration | Easing character                                                            |
| ------------ | -------- | --------------------------------------------------------------------------- |
| `subtle`     | `fast`   | Nearly linear, no overshoot. A state change you notice only if it's missing |
| `standard`   | `base`   | Decelerating. The default for surfaces appearing                            |
| `emphasized` | `slow`   | Spring with visible settle, or a pronounced bezier                          |

### 7.3 Stagger

A per-child offset with optional decay, so a long list doesn't take a
proportionally long time:

```
delay(i) = stagger × i^decay        decay default 0.85, range 0.5–1
```

Exposed as `motion.stagger` plus the decay. Capped total, since a 50-item list
at 40ms flat is two seconds of waiting.

---

## 8. The preview — the reason the tool exists

### 8.1 Architecture, and why it can't use CSS transitions

Scrub, slow-motion and replay all require a **controllable clock**. A CSS
transition can't be seeked. So the preview is driven manually:

- One `useClock()` owns normalized time, playback rate (1× / 0.5× / 0.25×),
  play/pause, loop, replay, and scrub position.
- Scenarios are **pure functions of `(progress, index)` → style**. They hold no
  animation state of their own.
- Progress comes from evaluating the token directly — the bezier solver or the
  closed-form spring — not from an animation library's internal state.
- Total timeline = `max(delay + duration)` across children; the scrub bar spans
  that.

**The consequence, stated rather than hidden:** the preview shows the _true_
curve. The CSS export is an approximation of it. That gap is the subject of
§8.3, not a defect to paper over.

### 8.2 The five scenarios

Small and schematic, not pixel-real products. Each declares which semantic pair
it demonstrates.

| Scenario   | Demonstrates                  | Why it earns a slot                                                                             |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| **List**   | `standard`, stagger           | The only place stagger and decay are visible. Stagger 0 is also the "card entering a list" case |
| **Drawer** | `emphasized`, distance        | Long travel — where easing differences are most legible and where §6 bites                      |
| **Modal**  | `emphasized`                  | Scale + fade together, on a surface that owns the screen                                        |
| **Toggle** | `subtle`                      | Tiny travel. Proves that a curve tuned on a drawer is wrong here                                |
| **Toast**  | `emphasized` enter, fast exit | Short travel, high emphasis — where exit asymmetry is most obvious                              |

Each runs enter and exit, with a control to play either or both.

### 8.3 A/B compare — two modes, one mechanism

Two configurations on identical elements, same clock, running simultaneously.
The same slot serves two purposes:

1. **Curve A vs curve B** — comparing two candidate tokens.
2. **True vs exported** — the real spring against the `linear()` you would
   actually ship. You _see_ what the approximation costs instead of reading a
   number about it.

Mode 2 is the honesty thesis made visible, and it's free once mode 1 exists.

### 8.4 Controls

Scrub bar with a time readout · play / pause / replay · 1× / 0.5× / 0.25× ·
loop · enter / exit / both · stagger count for the list scenario · a travel
distance control on scenarios where distance is meaningful.

---

## 9. Export

The export panel is the product. §10 governs its shell and behaviour; this
section covers what goes in each tab.

### 9.1 CSS

Durations and easings as separate custom properties, plus composed shorthands.
Separate matters: the reduced-motion block overrides only the durations, and
because `var()` resolves at use time, every shorthand follows automatically.

```css
:root {
  --duration-fast: 140ms;
  --duration-base: 200ms;

  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasized: linear(0, 0.31 12%, 1.04 34%, 0.98 56%, 1);

  --motion-standard-enter: var(--duration-base) var(--ease-standard);
  --motion-modal-enter: var(--motion-emphasized-enter); /* alias, not a copy */
}

/* Always emitted. Not a checkbox. */
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-instant: 1ms;
    --duration-fast: 1ms;
    /* … every duration … */
  }
}
```

### 9.2 Tailwind

A `@theme` block. Easings map onto Tailwind v4's `--ease-*` namespace and
generate `ease-*` utilities directly. **Durations need verification during the
build** — v4's namespace coverage for transition duration is the open question
in §12; if there's no namespace, durations emit as plain custom properties
consumed via `duration-[var(--duration-base)]`, and the export says so.

### 9.3 Framer Motion

Transition objects, both forms. **Note the unit change: Motion takes seconds,
CSS takes milliseconds.** Getting this wrong is a silent 1000× error, so it gets
a test.

```ts
export const motionTokens = {
  standard: {
    enter: { type: "spring", stiffness: 210, damping: 20, mass: 1 },
    exit: { duration: 0.14, ease: [0.4, 0, 1, 1] },
  },
}
```

Plus a note recommending `<MotionConfig reducedMotion="user">`, since that's how
reduced motion is honoured in this runtime rather than via a media query.

### 9.4 DTCG JSON

`duration`, `cubicBezier` and the `transition` composite are all in the spec, so
tween tokens are exact and semantic pairs emit as `transition` values with
references to their duration and easing tokens.

**Springs are not representable.** There is no spring type. So a spring emits:

- `$value` as its `cubicBezier` approximation where one is legal (§5.5), or its
  sampled `linear()` where it isn't,
- the true parameters under `$extensions`,
- and a fidelity note saying which of the two it did and what it cost.

This is the one place the tool cannot be lossless and cannot warn inside the
format itself, so the warning has to live in the export UI and the agent block.

### 9.5 Agent markdown

Plain-language rules plus values, written to be dropped into a `CLAUDE.md`. It
carries everything the UI can collapse, because agents don't click:

- Every token, with values.
- The asymmetry rule, stated as a rule.
- The distance rule: the buckets as normative, the formula as the escape hatch,
  with explicit instruction on when to use which (§6.2).
- The complete fidelity report for every target, expanded, unconditionally.
- The settling-threshold caveat (§5.4).
- **The conversion formulas for platforms we don't emit.** We ship no SwiftUI or
  Compose tab, so an agent asked to port these will otherwise guess the
  parameter mapping and guess wrong. Stating the maths makes that translation
  reliable at the cost of a paragraph:

  > SwiftUI: `response = 2π·√(m/k)`, `dampingFraction = c / (2·√(k·m))`.
  > Compose: `stiffness = k/m`, `dampingRatio = c / (2·√(k·m))` — mass is fixed
  > at 1 there, which is lossless because only `k/m` and `c/m` affect the motion.

---

## 10. The export experience — family-level

**This section governs every tool in the family, not just this one.** A person
moving between Ramps and Motion should not notice they changed apps. Authored
here because Motion is the second consumer and the first opportunity to prove it.

### 10.1 Targets are web and Figma

No native runtime emitters anywhere in the family. Deliberate, because the three
weakest cases all disappear with it: Type's fluid scaling has no native
equivalent (viewport-driven vs. user-preference-driven — a different model, not
a formatting gap), Shape's layered elevation collapses onto a single Compose
value, and Icons would need a real SVG→VectorDrawable converter.

Figma stays a target where it applies — it's a design destination, not a runtime.
Motion is the exception: Figma can't consume easing as a variable, so Motion has
no Figma tab, for a stated reason.

The family's promise is not _"every tool exports to every platform."_ It is
**"every tool states exactly what it can and can't do on your target, with the
cost measured."**

### 10.2 The invariant shell

```
┌ Export ─────────────────────────────────────────── ✕ ┐
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │ </>              │  │ ✨                │          │
│  │ Export code    › │  │ Copy agent prompt│          │
│  └──────────────────┘  └──────────────────┘          │
└──────────────────────────────────────────────────────┘

← back
┌──────────────────────────────────────────────────────┐
│ CSS  Tailwind  Figma  JSON        [download] [copy]  │
├──────────────────────────────────────────────────────┤
│ options for this tab            fidelity note  ⌄     │
├──────────────────────────────────────────────────────┤
│ …code, max-h-60vh, dark in both themes…              │
└──────────────────────────────────────────────────────┘
```

Identical everywhere: the two-card fork, the modal width, the terminal that
stays dark in light mode, the spring underline on tabs, the lowercase
`download` / `copy` / `back`, the crossfade on tab change.

### 10.3 The contract

```ts
type ExportFormat = {
  id: string
  label: string // the tab
  filename: string
  mime: string
  render(): string
  options?: ReactNode // left of the bar — this tab's settings
  fidelity?: FidelityNote // right — omitted entirely when lossless
}
```

`<ExportPanel formats={…} agentPrompt={…} />`. Extracting this from Ramps into
`src/shared` is a **prerequisite** for Motion's build, not a later cleanup, and
it gets authored against both tools at once.

### 10.4 Two rules that keep it feeling the same

**Tabs are destinations, not encodings.** You pick by answering _"where is this
going?"_ Canonical order, each tool showing its subset:

|        | CSS | Tailwind | Figma | JSON | Framer |
| ------ | --- | -------- | ----- | ---- | ------ |
| Ramps  | ✓   | ✓        | ✓     | ✓    | —      |
| Motion | ✓   | ✓        | n/a   | ✓    | ✓      |
| Shape  | ✓   | ✓        | ✓     | ✓    | —      |
| Type   | ✓   | ✓        | ✓     | ✓    | —      |

Same positions every time, so muscle memory transfers.

**Controls that change the artifact live on the page; controls that change only
the encoding live in the export panel.** Ramps' colour notation is a page
control because it also changes what you see. Motion's `linear()` sample count
affects one export and nothing else, so it belongs in the options bar.

### 10.5 The fidelity line

One quiet mono line, **absent entirely when the conversion is lossless**, so its
presence always means something:

```
linear() approximation · max error 8ms (1.9% of travel) · 24 samples   ⌄
```

Expands to the full breakdown. The agent block gets the complete report for
every target unconditionally.

**Collapse for humans, never for machines.** Same rule as Ramps' machine-readable
block, which is on the page rather than behind an interaction.

---

## 11. Dependencies

**None added.** Worth stating explicitly, because each of these looked like it
might need one:

- Spring physics — closed form (§5.1), no integrator.
- The bezier editor — SVG plus pointer events, ~100 lines.
- Bezier evaluation — Newton-Raphson, ~30 lines.
- Preview animation — `motion`, already a family dependency.
- `linear()` generation — sampling the closed form.

---

## 12. To verify during the build

Flagged rather than assumed. Each needs checking against a primary source before
the code that depends on it is written.

1. **Tailwind v4's theme namespace for transition duration.** Determines whether
   §9.2 emits theme values or plain custom properties.
2. **Motion's `visualDuration` / `bounce` mapping** to `(k, c, m)`. Wanted for a
   secondary spring input mode; verify against Motion's source, not blog posts.
3. **Motion's default `restDelta` / `restSpeed`**, since §5.4's default settling
   threshold follows from them.
4. **The closed-form spring against Motion's actual output** — §5.1. This is the
   one that matters most; if they diverge, Motion wins.
5. **DTCG `duration` value shape** — recent drafts moved from `"200ms"` to
   `{ value: 200, unit: "ms" }`. Check the current draft.

---

## 13. URL state

Provisional; final at first deploy, and a public API from then on. Same
discipline as Ramps: every field validated independently, so a malformed link
degrades to defaults rather than erroring, and `.` is the list separator because
`URLSearchParams` percent-encodes a comma but leaves a dot alone.

| Param          | Meaning                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `d`            | Duration generator: base, ratio ×100, snap — `200.140.10`                                                  |
| `dp`           | Pinned duration steps, `name:ms`, dot-separated — `instant:80`                                             |
| `es` `ed` `em` | The subtle / standard / emphasized easings. `b.<x1>.<y1>.<x2>.<y2>` (×100, integer) or `s.<k>.<c>.<m>.<v>` |
| `r`            | Exit/enter duration ratio ×100 — default `70`                                                              |
| `sg`           | Stagger ms and decay ×100 — `40.85`                                                                        |
| `dist`         | Distance rule: reference px, exponent ×100 — `160.50`                                                      |
| `n`            | `linear()` sample count — default `24`                                                                     |
| `b`            | The B-side config for A/B compare, same grammar                                                            |
| `xp`           | Purpose aliases deselected, dot-separated                                                                  |

Not in the URL: theme, scrub position, playback rate, which preview scenario is
open. The URL carries the artifact, not the viewing state — a shared link
shouldn't force the recipient into the author's playback speed.

---

## 14. Agent readability

Family standard, non-negotiable, mirroring Ramps:

- `middleware.ts` routes every `/` to `api/render`, which injects the full token
  set as both JSON and plain `<pre>` text — both shapes, because
  HTML-to-markdown conversion strips `<script>`.
- The injected block carries **no hiding styles**; `main.tsx` removes it on
  mount. Readability extractors honour inline hiding, which would defeat the
  purpose.
- `api/tokens` serves the same payload as JSON.
- `llms.txt` documents the URL contract and lists the family.
- A visible machine-readable block on the page, not behind an interaction.
- The bare homepage serves a complete default token set — that's the URL an
  agent lands on when told the tool's name with no link.
- Anything touching these is verified with a real no-JavaScript fetch. A browser
  is the one client that already worked.

---

## 15. Out of scope for v1

Each defensible later; none load-bearing for the thesis.

- Per-property easing (transform and opacity on different curves).
- Multi-step keyframes beyond enter/exit.
- Motion paths and non-linear trajectories.
- Choreography beyond stagger — sequencing, orchestration graphs.
- SwiftUI and Compose emitters (§10.1). The conversion maths ships in the agent
  block regardless (§9.5).
- GSAP, Anime, and other runtime targets.
- `steps()` and other discrete timing functions.
- Scroll-linked and gesture-driven motion.

---

## 16. Build order

Each step ends somewhere shippable.

1. **Extract `ExportPanel` into `src/shared`** against Ramps, sync, verify Ramps
   is unchanged. Prerequisite for everything else (§10.3).
2. **The maths, headless.** Spring closed form, bezier solver, conversions,
   `linear()` generation and error measurement — with the tests from §5.1 and
   §12.4. No UI. This is the part most likely to be subtly wrong, so it gets
   proven before anything renders.
3. **Token model and URL state.** Encode, decode, defaults, degradation.
4. **The curve editor**, both modes, wired to state.
5. **The preview harness** — clock, scrub, slow-motion, A/B. The largest single
   piece.
6. **The five scenarios**, cheap once the harness exists.
7. **The export panel**, format by format, fidelity reporting last.
8. **Agent surfaces** — `api/render`, `api/tokens`, `llms.txt`, JSON-LD.
9. **Domain, canonical, sitemap, robots, manifest entry** flipped from "soon" to
   "live", all together (§4 of `CLAUDE.md`).

---

## 17. Decisions taken, and what stays open

Settled before the build. Recorded because the reasoning outlasts the answer:

- **Purpose aliases stay.** They give a person and their agent a shared
  vocabulary — §3.3.
- **Durations are generated from base × ratio with per-step pinning**, not five
  free values — §3.1. Four of the five defaults were already a geometric series
  at ~1.4; only `instant` sits off it, for a stated reason.
- **The third emphasis level is `emphasized`, not `expressive`.** Material
  Design 3 pairs `emphasized` with `standard`, and `standard` was already
  borrowed from Material — pairing it with Carbon's `expressive`, which belongs
  with `productive`, mixed two systems' vocabularies. `emphasized` is also the
  semantically correct word: `subtle → standard → emphasized` is an intensity
  ladder, whereas `expressive` describes character.
- **Ramps' two overlapping JSON tabs are fine.** Figma is a legitimately
  separate destination, and Shape will want the same pair. Not an inconsistency
  to resolve.

Still open, neither blocking:

- **Does the `-sm`/`-md`/`-lg` distance split survive real use?** It triples the
  token count for travelling motions. If people ignore the buckets and reach for
  the middle one, collapse it to a single value plus the documented formula.
- **Should `motion.stagger` carry a hard cap as well as a decay?** They're two
  answers to the same problem, and shipping both may be one too many.
