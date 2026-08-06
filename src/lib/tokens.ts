// ==============================================
// TOKEN MODEL
// Primitives hold values, semantics compose them,
// purposes alias the semantics. Everything on this
// page is a pure function of the state in here.
//
// Durations are generated from a base and a ratio
// rather than hand-entered, with any step pinnable —
// the same auto-until-you-pin idiom Ramps uses for
// its accents.
//
// Exits are derived from entrances, faster and
// flatter, because that is the rule the tool exists
// to teach. Deriving it means you get it by default
// and have to actively opt out.
// ==============================================
import { clampBezier, type Bezier } from "./bezier.js"
import { motionSettlingTime, type SpringConfig } from "./spring.js"

export const DURATION_NAMES = ["instant", "fast", "base", "slow", "deliberate"] as const
export type DurationName = (typeof DURATION_NAMES)[number]

/** Offsets from `base` on the ratio, in steps. */
const DURATION_STEPS: Record<DurationName, number> = {
  instant: -2,
  fast: -1,
  base: 0,
  slow: 1,
  deliberate: 2,
}

export const EMPHASIS_NAMES = ["subtle", "standard", "emphasized"] as const
export type Emphasis = (typeof EMPHASIS_NAMES)[number]

/** Which duration each emphasis level reaches for. */
const EMPHASIS_DURATION: Record<Emphasis, DurationName> = {
  subtle: "fast",
  standard: "base",
  emphasized: "slow",
}

export type Direction = "enter" | "exit"

export type Easing =
  { kind: "bezier"; bezier: Bezier } | { kind: "spring"; spring: SpringConfig }

export type MotionState = {
  /** The middle of the duration scale, in ms. */
  base: number
  /** Multiplier between steps. */
  ratio: number
  /** Generated durations round to this, in ms. */
  snap: number
  /** Steps held at a fixed value instead of being derived. */
  pins: Partial<Record<DurationName, number>>
  easings: Record<Emphasis, Easing>
  /** Exit duration as a fraction of enter. */
  exitRatio: number
  staggerMs: number
  /** Sub-linear falloff so a long list doesn't take proportionally long. */
  staggerDecay: number
  /** Target max deviation for the CSS linear() approximation. */
  tolerance: number
}

export const DEFAULT_STATE: MotionState = {
  base: 200,
  ratio: 1.4,
  snap: 10,
  // `instant` ships pinned. It is not a point on the same perceptual curve as
  // the others — it's an anchor. Feedback meant to read as cause and effect
  // needs to sit under roughly 100ms whatever the rest of the scale does, and
  // the generated 102ms doesn't. Bending it onto the curve would be the
  // dishonest version.
  pins: { instant: 80 },
  easings: {
    subtle: { kind: "bezier", bezier: { x1: 0.3, y1: 0, x2: 0.3, y2: 1 } },
    standard: { kind: "bezier", bezier: { x1: 0.2, y1: 0, x2: 0, y2: 1 } },
    emphasized: {
      kind: "spring",
      spring: { stiffness: 210, damping: 20, mass: 1, velocity: 0 },
    },
  },
  exitRatio: 0.7,
  staggerMs: 40,
  staggerDecay: 0.85,
  tolerance: 0.01,
}

const roundTo = (value: number, snap: number) =>
  snap <= 0 ? Math.round(value) : Math.round(value / snap) * snap

/** The five durations, generated then overridden by any pins. */
export function resolveDurations(s: MotionState): Record<DurationName, number> {
  const out = {} as Record<DurationName, number>
  for (const name of DURATION_NAMES) {
    const pinned = s.pins[name]
    out[name] =
      pinned !== undefined
        ? pinned
        : Math.max(1, roundTo(s.base * Math.pow(s.ratio, DURATION_STEPS[name]), s.snap))
  }
  return out
}

/** True when a step is showing its generated value rather than a pinned one. */
export function isDerived(s: MotionState, name: DurationName): boolean {
  return s.pins[name] === undefined
}

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

/** Damping that puts a spring exactly at critical — no bounce, quickest arrival. */
export function criticalDamping(s: SpringConfig): number {
  return 2 * Math.sqrt(s.stiffness * s.mass)
}

/**
 * The exit easing for a given entrance.
 *
 * An entrance introduces something and can afford character. An exit removes
 * something the user has already finished with, and lingering on it reads as
 * lag — so exits are pushed toward the linear end: beziers mirror, and springs
 * lose their bounce by going critical.
 */
export function deriveExitEasing(enter: Easing): Easing {
  if (enter.kind === "bezier") return { kind: "bezier", bezier: mirrorBezier(enter.bezier) }
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

export type SemanticToken = {
  /** e.g. "standard.enter" */
  id: string
  emphasis: Emphasis
  direction: Direction
  /**
   * For a bezier this is the transition duration. For a spring it is the
   * settling time Framer Motion will actually use — a spring has no duration
   * of its own, only a threshold, so this number is always reported alongside
   * what produced it.
   */
  durationMs: number
  easing: Easing
}

export function resolveSemantics(s: MotionState): SemanticToken[] {
  const durations = resolveDurations(s)
  const out: SemanticToken[] = []
  for (const emphasis of EMPHASIS_NAMES) {
    const enterEasing = s.easings[emphasis]
    const nominal = durations[EMPHASIS_DURATION[emphasis]]

    for (const direction of ["enter", "exit"] as Direction[]) {
      const easing = direction === "enter" ? enterEasing : deriveExitEasing(enterEasing)
      const durationMs =
        easing.kind === "spring"
          ? motionSettlingTime(easing.spring)
          : Math.max(1, Math.round(direction === "enter" ? nominal : nominal * s.exitRatio))
      out.push({ id: `${emphasis}.${direction}`, emphasis, direction, durationMs, easing })
    }
  }
  return out
}

/**
 * Purposes are aliases, never copies.
 *
 * A thin naming layer over the six semantics, because "which one do I grab for
 * a drawer?" is the question people actually have — and because it gives a
 * person and their agent a shared vocabulary. "Use the drawer motion" is
 * unambiguous to both in a way "emphasized enter at 280ms" is not.
 *
 * `travels` marks the ones where distance is meaningful. A checkbox filling has
 * no distance; a drawer does.
 */
export const PURPOSES: { id: string; aliasOf: Emphasis; travels: boolean }[] = [
  { id: "state", aliasOf: "subtle", travels: false },
  { id: "dropdown", aliasOf: "standard", travels: true },
  { id: "tooltip", aliasOf: "standard", travels: false },
  { id: "toast", aliasOf: "emphasized", travels: true },
  { id: "drawer", aliasOf: "emphasized", travels: true },
  { id: "modal", aliasOf: "emphasized", travels: false },
]

/** Progress 0→1 for any easing at a moment in ms. The one entry point. */
export function easingProgress(easing: Easing, ms: number, durationMs: number): number {
  if (easing.kind === "spring") {
    // A spring is defined in real time, not as a fraction of a duration.
    return springAt(easing.spring, ms)
  }
  return bezierAtLocal(easing.bezier, ms, durationMs)
}

// Imported lazily-ish to keep the dependency direction obvious at a glance.
import { springValue } from "./spring.js"
import { bezierAt } from "./bezier.js"
const springAt = (s: SpringConfig, ms: number) => springValue(s, ms)
const bezierAtLocal = (b: Bezier, ms: number, d: number) => bezierAt(b, ms, d)

/** Per-child delay, with sub-linear falloff so long lists stay bearable. */
export function staggerDelay(s: MotionState, index: number): number {
  return Math.round(s.staggerMs * Math.pow(index, s.staggerDecay))
}
