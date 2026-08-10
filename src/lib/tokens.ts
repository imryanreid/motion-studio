// ==============================================
// TOKEN MODEL
// A list of motion entries. Each one owns a curve, a
// duration and the exit derived from it; purposes
// point at entries by id. That is the whole model.
//
// It used to be two stacked scales — five generated
// durations, and three emphasis levels that mapped
// onto them — which meant two names for the same
// idea ("fast" and "subtle") plus a mapping between
// them, and two of the five steps shipping with
// nothing pointing at them. Every legibility problem
// this tool had was that seam.
//
// The one rule that survives:
//
//   LIVE WITHIN AN ENTRY. ONE-TIME BETWEEN ENTRIES.
//
// An exit is always derived from its own entrance,
// because that asymmetry is the lesson the tool
// exists to teach. Everything between entries — the
// generated set, "make one like this but slower" —
// seeds a value once and then lets go. No links, no
// anchor, no multipliers to keep in sync.
//
// That is also what makes springs work. A multiplier
// on a spring is meaningless, because the only number
// a spring has is a settling threshold. A named
// transform is not: "slower" scales its frequency and
// holds the damping ratio, so it takes longer and
// feels identical.
// ==============================================
import { BEZIER_PRESETS, clampBezier, type Bezier } from "./bezier.js"
import {
  MOTION_REST,
  SPRING_PRESETS,
  motionSettlingTime,
  settlingTime,
  type SpringConfig,
} from "./spring.js"

/** Generated durations land on this grid. Values you type are left alone. */
const ROUND_MS = 10

/**
 * How stagger falls off across a group: `stagger x index^DECAY`.
 *
 * A constant rather than state. It has never had a control, and a sub-linear
 * falloff is the rule the tool teaches rather than a dial — the thing worth
 * tuning is the offset itself, which is now per-motion.
 */
export const STAGGER_DECAY = 0.85

/** One step of "faster" or "slower". */
export const STEP = 1.4

/** Enough for any real system; keeps a shared URL a sane length. */
export const ENTRY_LIMIT = 12

/** Names become CSS custom properties, so the charset is deliberately small. */
export const NAME_MAX = 24
const NAME_ALLOWED = /[^A-Za-z0-9 _-]/g

export type Direction = "enter" | "exit"

export type Easing =
  { kind: "bezier"; bezier: Bezier } | { kind: "spring"; spring: SpringConfig }

export type EasingKind = Easing["kind"]

export type MotionEntry = {
  /** Stable across renames — purposes and the URL refer to this. */
  id: string
  name: string
  easing: Easing
  /** Entrance duration in ms. A spring ignores it: it settles when it settles. */
  durationMs: number
  /**
   * Exit as a share of the entrance. Used when `exitLinked`; kept either way,
   * so unlinking and relinking doesn't lose what you had.
   */
  exitRatio: number
  /** Exit as its own duration in ms. Used when not `exitLinked`. */
  exitAbsoluteMs: number
  /**
   * Whether the exit follows the entrance or stands alone.
   *
   * Linked is the default and the lesson: an exit that is a share of its
   * entrance stays faster automatically when you retime the entrance. Unlink
   * it when a motion genuinely needs its own number.
   */
  exitLinked: boolean
  /**
   * Per-child offset when this motion enters as a group, in ms.
   *
   * Per-motion rather than global, because how far apart children should start
   * depends on how long each one takes — a 140ms entrance wants a tighter
   * stagger than a 400ms one, and one number across the whole set could only
   * ever be right for one of them. It also leaves nothing global behind: every
   * value in the model now belongs to a motion.
   */
  staggerMs: number
}

export type MotionState = {
  /**
   * Unordered — position carries no meaning and nothing derives from it. New
   * entries append; there is no drag handle, because an ordered list would
   * imply a scale and invite people to expect proportion between neighbours.
   */
  entries: MotionEntry[]
  /** Which entry each purpose reaches for, by entry id. */
  purposeEntry: Record<PurposeId, string>
  /**
   * Tokens held out of every export, as `${entryId}.${direction}`.
   *
   * Keyed on the entry id rather than the slug, so renaming a motion doesn't
   * silently un-exclude it.
   */
  excluded: string[]
  /** Target max deviation for the CSS linear() approximation. */
  tolerance: number
}

/**
 * The purposes, which are also the preview scenarios.
 *
 * One vocabulary, so the thing you are watching is named the same thing you'd
 * reach for at a call site. `travels` marks where distance is meaningful — a
 * checkbox filling has none.
 */
export const PURPOSE_IDS = [
  "state",
  "dropdown",
  "tooltip",
  "list",
  "drawer",
  "modal",
  "toast",
] as const
export type PurposeId = (typeof PURPOSE_IDS)[number]

export const PURPOSE_TRAVELS: Record<PurposeId, boolean> = {
  state: false,
  dropdown: true,
  tooltip: false,
  list: true,
  drawer: true,
  modal: false,
  toast: true,
}

// ---------- names and slugs ----------

/** Trim a typed name to what can survive a URL and a CSS property. */
export function sanitizeName(raw: string): string {
  return raw.replace(NAME_ALLOWED, "").slice(0, NAME_MAX)
}

/** The slug a name wants, before deduplication. */
export const baseSlug = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "motion"

/**
 * Export slug per entry, deduplicated.
 *
 * Two entries may share a display name — that's the user's business — but two
 * CSS custom properties may not share a key, so the second one gets a suffix.
 * The UI shows the slug under the name so nothing about this is a surprise.
 */
export function slugs(entries: MotionEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  const seen = new Map<string, number>()
  for (const e of entries) {
    const base = baseSlug(e.name)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out[e.id] = n === 1 ? base : `${base}-${n}`
  }
  return out
}

/** An id no existing entry is using. */
export function nextId(entries: MotionEntry[]): string {
  let n = entries.length + 1
  const taken = new Set(entries.map((e) => e.id))
  while (taken.has(`e${n}`)) n++
  return `e${n}`
}

// ---------- transforms ----------

const round = (ms: number) => Math.max(1, Math.round(ms / ROUND_MS) * ROUND_MS)
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Curves the bezier transforms pull toward, half the remaining distance each time. */
const SOFT_TARGET: Bezier = { x1: 0.4, y1: 0, x2: 0.6, y2: 1 }
const SHARP_TARGET: Bezier = { x1: 0.05, y1: 0.7, x2: 0.1, y2: 1 }

const blend = (a: Bezier, b: Bezier, t: number): Bezier =>
  clampBezier({
    x1: Number((a.x1 + (b.x1 - a.x1) * t).toFixed(3)),
    y1: Number((a.y1 + (b.y1 - a.y1) * t).toFixed(3)),
    x2: Number((a.x2 + (b.x2 - a.x2) * t).toFixed(3)),
    y2: Number((a.y2 + (b.y2 - a.y2) * t).toFixed(3)),
  })

/**
 * Same character, shorter.
 *
 * For a bezier that is just the duration. For a spring it is the natural
 * frequency: ω₀ = √(k/m), so scaling ω₀ by `STEP` means k by STEP² — and the
 * damping has to move with it, because ζ = c / (2√(km)). Scale c by STEP and ζ
 * comes out unchanged, which is what makes this "the same spring, quicker"
 * rather than "a different spring".
 */
export function faster(e: MotionEntry): MotionEntry {
  if (e.easing.kind === "spring") {
    const s = e.easing.spring
    return {
      ...e,
      easing: {
        kind: "spring",
        spring: {
          ...s,
          stiffness: clamp(Math.round(s.stiffness * STEP * STEP), 1, 2000),
          damping: Number(clamp(s.damping * STEP, 0, 200).toFixed(2)),
        },
      },
    }
  }
  return { ...e, durationMs: round(e.durationMs / STEP) }
}

/** Same character, longer. The inverse of `faster`, ζ likewise unchanged. */
export function slower(e: MotionEntry): MotionEntry {
  if (e.easing.kind === "spring") {
    const s = e.easing.spring
    return {
      ...e,
      easing: {
        kind: "spring",
        spring: {
          ...s,
          stiffness: clamp(Math.round(s.stiffness / (STEP * STEP)), 1, 2000),
          damping: Number(clamp(s.damping / STEP, 0, 200).toFixed(2)),
        },
      },
    }
  }
  return { ...e, durationMs: round(e.durationMs * STEP) }
}

/** Gentler: a flatter curve, or a spring with the bounce damped out of it. */
export function softer(e: MotionEntry): MotionEntry {
  if (e.easing.kind === "spring") {
    const s = e.easing.spring
    return {
      ...e,
      easing: {
        kind: "spring",
        spring: { ...s, damping: Number(clamp(s.damping * 1.25, 0, 200).toFixed(2)) },
      },
    }
  }
  return { ...e, easing: { kind: "bezier", bezier: blend(e.easing.bezier, SOFT_TARGET, 0.5) } }
}

/** More attack: a steeper curve, or a springier spring. */
export function sharper(e: MotionEntry): MotionEntry {
  if (e.easing.kind === "spring") {
    const s = e.easing.spring
    return {
      ...e,
      easing: {
        kind: "spring",
        spring: { ...s, damping: Number(clamp(s.damping / 1.25, 0, 200).toFixed(2)) },
      },
    }
  }
  return { ...e, easing: { kind: "bezier", bezier: blend(e.easing.bezier, SHARP_TARGET, 0.5) } }
}

export const TRANSFORMS = {
  faster,
  slower,
  softer,
  sharper,
} as const
export type TransformId = keyof typeof TRANSFORMS

// ---------- the generated set ----------

export const DEFAULT_BEZIER: Bezier = BEZIER_PRESETS[0].value

/**
 * What you land on when you switch a motion to a spring.
 *
 * `Lively` rather than the critically-damped `Smooth`, because a critically
 * damped spring is visually almost indistinguishable from a decent bezier —
 * someone switching type to find out what a spring is would see nothing
 * happen. This one visibly overshoots, which is the answer to the question
 * they were asking.
 */
export const DEFAULT_SPRING: SpringConfig = SPRING_PRESETS[2].value

/**
 * Which named preset an easing currently is, or null for a hand-tuned curve.
 *
 * Derived by comparing values, never stored. A stored "selected preset" flag
 * can disagree with the numbers it claims to describe — drag a handle and the
 * flag is a lie, load a hand-edited URL and it's a lie on arrival. Comparing
 * means the answer is always true, and "Custom" needs no representation at
 * all: it is simply the absence of a match.
 */
export function presetIdFor(easing: Easing): string | null {
  if (easing.kind === "bezier") {
    const b = easing.bezier
    const near = (a: number, c: number) => Math.abs(a - c) < 1e-6
    return (
      BEZIER_PRESETS.find(
        (p) =>
          near(p.value.x1, b.x1) &&
          near(p.value.y1, b.y1) &&
          near(p.value.x2, b.x2) &&
          near(p.value.y2, b.y2),
      )?.id ?? null
    )
  }
  const s = easing.spring
  return (
    SPRING_PRESETS.find(
      (p) =>
        p.value.stiffness === s.stiffness &&
        p.value.damping === s.damping &&
        p.value.mass === s.mass &&
        p.value.velocity === s.velocity,
    )?.id ?? null
  )
}

/**
 * The three-level set, built from one motion.
 *
 * The source is chosen at the moment you press Generate, not held as a flag on
 * an entry. It was a flag — a "primary" radio on every row — and that was the
 * last persistent between-entry relationship in a model whose whole rule is
 * that there aren't any. A one-shot decision does not need a permanent
 * control, a field in the state, a parameter in the URL, or a promote-someone
 * -else rule when you delete the entry holding it.
 *
 * Siblings inherit the source's type, so generating from a bezier gives three
 * beziers and from a spring gives three springs. That predictability is the
 * point — and it is why the shipped default is three beziers rather than the
 * mixed set it used to be. A default the tool cannot reproduce with its own
 * button is the tool showing you something it can't make, and it would quietly
 * promise that Generate hands you a spring.
 *
 * Siblings differ in duration only, never in curve, so that pressing Generate
 * agrees with pressing Faster and Slower by hand. Soften the slow one yourself
 * if you want it — that's one click, and it stays yours.
 */
export function generateSet(primary: MotionEntry): MotionEntry[] {
  const standard: MotionEntry = { ...primary, id: "std", name: "standard" }
  return [
    { ...faster(standard), id: "sub", name: "subtle" },
    standard,
    { ...slower(standard), id: "emp", name: "emphasized" },
  ]
}

const SEED: MotionEntry = {
  id: "std",
  name: "standard",
  easing: { kind: "bezier", bezier: DEFAULT_BEZIER },
  durationMs: 200,
  exitRatio: 0.7,
  exitAbsoluteMs: 140,
  exitLinked: true,
  staggerMs: 40,
}

/** Where purposes point when the entry they named has gone. */
export const PURPOSE_FALLBACK = "std"

export const DEFAULT_STATE: MotionState = {
  entries: generateSet(SEED),
  purposeEntry: {
    state: "sub",
    dropdown: "std",
    tooltip: "std",
    list: "std",
    drawer: "emp",
    modal: "emp",
    toast: "emp",
  },
  excluded: [],
  tolerance: 0.01,
}

// ---------- lookups ----------

export function entryById(s: MotionState, id: string): MotionEntry | undefined {
  return s.entries.find((e) => e.id === id)
}

/**
 * The entry a purpose reaches for.
 *
 * Falls back to the first entry rather than to a designated one, now that
 * there is no designated one. Deleting an entry repoints anything using it, so
 * this only fires for a hand-edited link naming an id that never existed.
 */
export function entryForPurpose(s: MotionState, p: PurposeId): MotionEntry {
  return entryById(s, s.purposeEntry[p]) ?? s.entries[0]
}

/** Which purposes reach for an entry — the "used for" column. */
export function purposesUsing(s: MotionState, entryId: string): PurposeId[] {
  return PURPOSE_IDS.filter((p) => entryForPurpose(s, p).id === entryId)
}

/**
 * What a bezier entry's exit lasts. A spring's is its settling time, which is
 * a property of the physics rather than a number anyone chose.
 */
export function enterMs(e: MotionEntry): number {
  return e.easing.kind === "spring"
    ? motionSettlingTime(e.easing.spring)
    : Math.max(1, Math.round(e.durationMs))
}

/**
 * The exit budget, for both kinds.
 *
 * This used to ask the derived spring how long it took, which is how a spring
 * exit ended up slower than its entrance. Now it states the budget and
 * `springExitFor` builds a spring that fits, so "exits are faster" holds by
 * construction rather than by luck.
 */
export function exitBudgetMs(e: MotionEntry): number {
  const base = e.exitLinked ? enterMs(e) * e.exitRatio : e.exitAbsoluteMs
  return Math.max(1, Math.round(base))
}

export function exitMs(e: MotionEntry): number {
  if (e.easing.kind === "bezier") return exitBudgetMs(e)
  // The spring's own settle, not the budget it was built from. The two land
  // within a few percent, and reporting the budget would let the emitted
  // duration fall *under* the real motion — the CSS linear() window is this
  // number, so a short one truncates travel the JS runtime still plays.
  const exit = deriveExitFor(e)
  return exit.kind === "spring" ? motionSettlingTime(exit.spring) : exitBudgetMs(e)
}

// ---------- derivation, the one live relationship ----------

/**
 * The mirror of a timing function: `cubic-bezier(1-x2, 1-y2, 1-x1, 1-y1)`.
 *
 * Turns a decelerating curve into an accelerating one, which is the shape an
 * exit wants. Ease-out (0, 0, 0.58, 1) mirrors to exactly ease-in
 * (0.42, 0, 1, 1), which is the check that this is the right transform rather
 * than an approximation of one.
 */
export function mirrorBezier(b: Bezier): Bezier {
  // Rounded because 1 - 0.58 is 0.42000000000000004 in binary floating point,
  // and that would otherwise be emitted verbatim into a stylesheet.
  const r = (n: number) => Number(n.toFixed(4))
  return clampBezier({
    x1: r(1 - b.x2),
    y1: r(1 - b.y2),
    x2: r(1 - b.x1),
    y2: r(1 - b.y1),
  })
}

/**
 * Damping that puts a spring exactly at critical — no bounce, quickest arrival.
 *
 * Rounded, because this value is emitted verbatim into every export and
 * `spring(210, 28.982753492378876, 1)` is not something anyone should have to
 * paste. Two decimals keeps ζ within a thousandth of 1.
 */
export function criticalDamping(s: SpringConfig): number {
  return Number((2 * Math.sqrt(s.stiffness * s.mass)).toFixed(2))
}

/**
 * The exit easing for a given entrance — the only relationship in the model
 * that stays live, because it is the rule the tool exists to teach.
 *
 * An entrance introduces something and can afford character. An exit removes
 * something the user has already finished with, and lingering on it reads as
 * lag — so exits are pushed toward the linear end: beziers mirror, and springs
 * lose their bounce by going critical.
 */
/** A critically damped spring at a given natural frequency. */
function criticalAt(w0: number, mass: number): SpringConfig {
  const stiffness = clamp(Math.round(mass * w0 * w0), 1, 20000)
  return {
    stiffness,
    damping: Number((2 * Math.sqrt(stiffness * mass)).toFixed(2)),
    mass,
    velocity: 0,
  }
}

/**
 * A critically damped spring sized to settle in roughly `targetMs`.
 *
 * Critically damping alone does not make an exit quicker — it buys flatness by
 * spending time, and a spring exit could settle *slower* than its entrance,
 * contradicting the first rule this tool teaches. So the exit is also stiffened
 * until it actually lands inside the budget.
 *
 * Sized by search rather than formula. Settling would scale as 1/ω₀ if the
 * threshold were position alone, but `isAtRest` also tests an absolute
 * velocity, and velocity has units of 1/time — so a stiffer spring is
 * relatively slower to fall under it. Measured across k=80..1280 the implied
 * constant drifts 9.0 → 10.6, enough that a closed form under-stiffens by
 * about half. One correction step against the real measure removes that.
 */
function springExitFor(enter: SpringConfig, targetMs: number): SpringConfig {
  const target = Math.max(1, targetMs)
  // Mid-range of the measured constant, then corrected by how far it lands.
  let w0 = (10.0 / target) * 1000
  let out = criticalAt(w0, enter.mass)
  for (let i = 0; i < 2; i++) {
    const got = motionSettlingTime(out)
    if (!got) break
    w0 *= got / target
    out = criticalAt(w0, enter.mass)
  }
  return out
}

/**
 * @param targetMs What the exit should take. Omitted, the spring is only
 * calmed, not shortened — used where the shape matters and the clock doesn't.
 */
export function deriveExit(enter: Easing, targetMs?: number): Easing {
  if (enter.kind === "bezier") return { kind: "bezier", bezier: mirrorBezier(enter.bezier) }
  if (targetMs === undefined) {
    const critical = criticalDamping(enter.spring)
    return {
      kind: "spring",
      spring: {
        ...enter.spring,
        damping: Math.max(enter.spring.damping, critical),
        velocity: 0,
      },
    }
  }
  return { kind: "spring", spring: springExitFor(enter.spring, targetMs) }
}

/** The exit easing for one entry, sized against that entry's own budget. */
export function deriveExitFor(e: MotionEntry): Easing {
  return deriveExit(e.easing, exitBudgetMs(e))
}

/**
 * How the curve spends its time: front-loaded reads as decelerating.
 *
 * Measured by when it crosses half its travel rather than by the slope at t=0,
 * because a spring starts from a standstill and would read as accelerating on
 * that test while plainly decelerating to the eye.
 */
export function curveDirection(
  easing: Easing,
  durationMs: number,
): "decelerating" | "accelerating" | "linear" {
  let half = 1
  for (let i = 1; i <= 100; i++) {
    if (easingProgress(easing, (i / 100) * durationMs, durationMs) >= 0.5) {
      half = i / 100
      break
    }
  }
  if (half < 0.47) return "decelerating"
  if (half > 0.53) return "accelerating"
  return "linear"
}

/** The stable key for one direction of one motion. */
export const tokenKey = (entryId: string, direction: Direction) => `${entryId}.${direction}`

export type SemanticToken = {
  /** e.g. "standard.enter", built from the export slug. */
  id: string
  entryId: string
  name: string
  slug: string
  direction: Direction
  /** False when this one is held out of the exports. */
  exported: boolean
  /**
   * For a bezier this is the transition duration. For a spring it is the
   * settling time Framer Motion will actually use — a spring has no duration
   * of its own, only a threshold, so this number is always reported alongside
   * what produced it.
   */
  durationMs: number
  easing: Easing
}

/** Two tokens per entry. What you see on the page is what exports. */
export function resolveSemantics(s: MotionState): SemanticToken[] {
  const slug = slugs(s.entries)
  const held = new Set(s.excluded)
  const out: SemanticToken[] = []
  for (const e of s.entries) {
    out.push({
      id: `${slug[e.id]}.enter`,
      entryId: e.id,
      name: e.name,
      slug: slug[e.id],
      direction: "enter",
      exported: !held.has(tokenKey(e.id, "enter")),
      durationMs: enterMs(e),
      easing: e.easing,
    })
    out.push({
      id: `${slug[e.id]}.exit`,
      entryId: e.id,
      name: e.name,
      slug: slug[e.id],
      direction: "exit",
      exported: !held.has(tokenKey(e.id, "exit")),
      durationMs: exitMs(e),
      easing: deriveExitFor(e),
    })
  }
  return out
}

/**
 * Only what actually ships.
 *
 * Every exporter reads this rather than `resolveSemantics`, so a deselected
 * token cannot reappear in one format because that exporter forgot to filter.
 */
export function exportedSemantics(s: MotionState): SemanticToken[] {
  return resolveSemantics(s).filter((t) => t.exported)
}

/**
 * Whether a purpose can alias a given direction.
 *
 * An alias whose target has been excluded is a dangling reference — a
 * `var()` pointing at nothing in CSS, and something Figma rejects outright on
 * import in the DTCG file. So a purpose loses the direction its motion is no
 * longer publishing, rather than the export quietly emitting a broken link.
 */
export function purposeExports(s: MotionState, p: PurposeId, direction: Direction): boolean {
  return !new Set(s.excluded).has(tokenKey(entryForPurpose(s, p).id, direction))
}

/** Progress 0→1 for any easing at a moment in ms. The one entry point. */
export function easingProgress(easing: Easing, ms: number, durationMs: number): number {
  if (easing.kind === "spring") {
    // A spring is defined in real time, not as a fraction of a duration.
    return springValue(easing.spring, ms)
  }
  return bezierAt(easing.bezier, ms, durationMs)
}

// Imported down here to keep the dependency direction obvious at a glance.
import { springValue } from "./spring.js"
import { bezierAt } from "./bezier.js"

/** Per-child delay, with sub-linear falloff so long lists stay bearable. */
export function staggerDelay(e: MotionEntry, index: number): number {
  return Math.round(e.staggerMs * Math.pow(index, STAGGER_DECAY))
}
