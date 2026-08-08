// ==============================================
// SPRING
// A damped harmonic oscillator, solved in closed
// form.
//
// m·x″ + c·x′ + k·x = 0. Normalising by mass gives
// x″ + 2ζω₀x′ + ω₀²x = 0, which has exact analytic
// solutions in all three damping regimes — so there
// is no integrator here, no rAF accumulation and no
// drift. Position at any t is one expression.
//
// That matters twice over: the linear() sampling in
// linear.ts is exact at every sample, and the error
// figure the export reports is a measurement rather
// than an estimate.
//
// Parameterized the way Motion does it, because Motion
// is an export target and the numbers people paste
// come from there. Verified against Motion's own
// output in spring.test.ts — if the two ever disagree,
// Motion wins.
// ==============================================
import { spring as motionSpring, calcGeneratorDuration } from "motion"

/** Motion's spring inputs. Velocity is in units per second, travel being 0→1. */
export type SpringConfig = {
  stiffness: number
  damping: number
  mass: number
  velocity: number
}

export const SPRING_DEFAULTS: SpringConfig = {
  stiffness: 210,
  damping: 20,
  mass: 1,
  velocity: 0,
}

/**
 * Named springs, spread across the damping ratio.
 *
 * A spring's feel is ζ = c / (2√(km)), not its raw stiffness — so these are
 * chosen by ζ and the numbers derived from it, which is the opposite of how
 * anyone picks a spring by hand. ζ = 1 is critical: the quickest arrival with
 * no overshoot at all. Below it the spring bounces; above it it crawls in.
 *
 * Mass is 1 throughout, which costs nothing: only k/m and c/m affect the
 * motion, so normalising mass is lossless rather than an approximation.
 */
export const SPRING_PRESETS: {
  id: string
  label: string
  value: SpringConfig
  /** The damping ratio these were picked for, shown in the UI. */
  zeta: number
}[] = [
  { id: "gentle", label: "Gentle", zeta: 1.19, value: { stiffness: 120, damping: 26, mass: 1, velocity: 0 } },
  { id: "smooth", label: "Smooth", zeta: 1.0, value: { stiffness: 210, damping: 29, mass: 1, velocity: 0 } },
  { id: "lively", label: "Lively", zeta: 0.73, value: { stiffness: 320, damping: 26, mass: 1, velocity: 0 } },
  { id: "bouncy", label: "Bouncy", zeta: 0.4, value: { stiffness: 400, damping: 16, mass: 1, velocity: 0 } },
  { id: "wobbly", label: "Wobbly", zeta: 0.27, value: { stiffness: 500, damping: 12, mass: 1, velocity: 0 } },
]

/**
 * What the numbers mean, rather than what they are.
 *
 * `dampingRatio` and `naturalFrequency` are what actually predict the feel;
 * stiffness and damping only do so relative to each other and to mass.
 */
export type SpringDerived = {
  /** ζ. Below 1 bounces, exactly 1 is critical, above 1 crawls in. */
  dampingRatio: number
  /** ω₀, in radians per second. */
  naturalFrequency: number
  regime: "underdamped" | "critical" | "overdamped"
}

/**
 * Only k/m and c/m appear in the normalised equation, so (m, k, c) and
 * (1, k/m, c/m) produce identical motion. Runtimes that fix mass at 1 lose
 * nothing — this is a reparameterization, not an approximation, and must never
 * be reported as one.
 */
export function normalizeMass(s: SpringConfig): SpringConfig {
  return {
    stiffness: s.stiffness / s.mass,
    damping: s.damping / s.mass,
    mass: 1,
    velocity: s.velocity,
  }
}

/** Floating-point equality is hopeless here; treat near-1 ζ as critical. */
const CRITICAL_EPSILON = 1e-6

export function derive(s: SpringConfig): SpringDerived {
  const naturalFrequency = Math.sqrt(s.stiffness / s.mass)
  const dampingRatio = s.damping / (2 * Math.sqrt(s.stiffness * s.mass))
  const regime =
    Math.abs(dampingRatio - 1) < CRITICAL_EPSILON
      ? "critical"
      : dampingRatio < 1
        ? "underdamped"
        : "overdamped"
  return { dampingRatio, naturalFrequency, regime }
}

/**
 * Progress at time `ms`, where 0 is the start and 1 is the target.
 *
 * Returned in the same units Motion reports, so the two are directly
 * comparable. Underdamped springs exceed 1 on the way — that overshoot is the
 * point, not an error to clamp.
 */
export function springValue(s: SpringConfig, ms: number): number {
  if (ms <= 0) return 0
  const t = ms / 1000
  const { dampingRatio: z, naturalFrequency: w0, regime } = derive(s)
  const v0 = s.velocity

  if (regime === "underdamped") {
    const wd = w0 * Math.sqrt(1 - z * z)
    const k = (z * w0 - v0) / wd
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + k * Math.sin(wd * t))
  }

  if (regime === "critical") {
    return 1 - Math.exp(-w0 * t) * (1 + (w0 - v0) * t)
  }

  // Overdamped: two real, both-negative roots.
  const root = w0 * Math.sqrt(z * z - 1)
  const r1 = -z * w0 + root
  const r2 = -z * w0 - root
  const c1 = (v0 + r2) / (r1 - r2)
  const c2 = -1 - c1
  return 1 + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t)
}

/** Rate of change at time `ms`, in units per second. Needed for rest checks. */
export function springVelocity(s: SpringConfig, ms: number): number {
  const t = Math.max(0, ms) / 1000
  const { dampingRatio: z, naturalFrequency: w0, regime } = derive(s)
  const v0 = s.velocity

  if (regime === "underdamped") {
    const wd = w0 * Math.sqrt(1 - z * z)
    const k = (z * w0 - v0) / wd
    return (
      Math.exp(-z * w0 * t) *
      ((z * w0 - k * wd) * Math.cos(wd * t) + (z * w0 * k + wd) * Math.sin(wd * t))
    )
  }

  if (regime === "critical") {
    const c = w0 - v0
    return Math.exp(-w0 * t) * (w0 + w0 * c * t - c)
  }

  const root = w0 * Math.sqrt(z * z - 1)
  const r1 = -z * w0 + root
  const r2 = -z * w0 - root
  const c1 = (v0 + r2) / (r1 - r2)
  const c2 = -1 - c1
  return c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t)
}

/**
 * When the spring is considered at rest.
 *
 * A spring approaches its target asymptotically and never arrives, so any
 * "duration" is a threshold, not a fact about the spring. Different runtimes
 * pick different ones, which is why the same spring honestly reports different
 * durations on different platforms — say so wherever this number is shown, and
 * never present it bare.
 *
 * These defaults match Motion's, because Motion is an export target.
 */
export type RestThreshold = {
  /** How close to the target counts as arrived. */
  restDelta: number
  /** How slow counts as stopped, in units per second. */
  restSpeed: number
}

export const MOTION_REST: RestThreshold = { restDelta: 0.01, restSpeed: 0.01 }

/** Motion refuses to run a generator longer than this; match it. */
export const MAX_DURATION_MS = 20000

/**
 * When the spring is considered done.
 *
 * `first` — the first instant the rest condition holds. This is what Motion
 * does at runtime and what `calcGeneratorDuration` reports, so it is the
 * default: matching the runtime people paste into matters more than being
 * strictly correct about the tail.
 *
 * `last` — the last instant it *doesn't* hold, plus a step. Strictly safer, and
 * different from `first` for bouncy springs: an underdamped curve passes
 * through velocity zero at each turnaround, so if it is already inside
 * `restDelta` at a turnaround it reads as at rest for a moment while still
 * visibly moving either side of it. Kept because the difference is real and
 * someone will want the honest number.
 */
export type SettleMode = "first" | "last"

function isAtRest(s: SpringConfig, ms: number, { restDelta, restSpeed }: RestThreshold) {
  return (
    Math.abs(1 - springValue(s, ms)) <= restDelta &&
    Math.abs(springVelocity(s, ms)) <= restSpeed
  )
}

export function settlingTime(
  s: SpringConfig,
  threshold: RestThreshold = MOTION_REST,
  mode: SettleMode = "first",
): number {
  const { dampingRatio: z, naturalFrequency: w0 } = derive(s)
  const decay = z * w0
  if (decay <= 0) return MAX_DURATION_MS // undamped: it never settles

  if (mode === "first") {
    for (let ms = 0; ms <= MAX_DURATION_MS; ms += 1) {
      if (ms > 0 && isAtRest(s, ms, threshold)) return ms
    }
    return MAX_DURATION_MS
  }

  let last = 0
  for (let ms = 0; ms <= MAX_DURATION_MS; ms += 1) {
    if (!isAtRest(s, ms, threshold)) last = ms
    // Once the decay envelope is under tolerance nothing later can violate it.
    else if (Math.exp(-decay * (ms / 1000)) * 2 < threshold.restDelta) break
  }
  return last + 1
}

/**
 * The duration Framer Motion will actually use.
 *
 * Delegated rather than reimplemented. Motion walks its own generator on a
 * coarse grid and rounds up to 50ms, and for a bouncy spring it steps straight
 * over the brief rest windows that our 1ms analytic scan finds — so it reports
 * longer. Neither number is wrong; they are different procedures. Measured
 * across ten springs: for seven, Motion is exactly `ceil(ours / 50) * 50`; for
 * the three with mid-oscillation rest windows it runs 190–600ms longer.
 *
 * Use this wherever the output has to line up with what Framer Motion does at
 * runtime — the CSS `linear()` window above all, since a shorter window would
 * truncate motion the JS runtime still plays. Use `settlingTime` when the
 * question is what a *threshold* implies rather than what Motion does.
 *
 * The cost is that this module imports the animation library. Worth it: the
 * alternative is a second implementation of somebody else's walk, which would
 * be wrong the first time they change it.
 */
export function motionSettlingTime(s: SpringConfig): number {
  return calcGeneratorDuration(
    motionSpring({
      keyframes: [0, 1],
      stiffness: s.stiffness,
      damping: s.damping,
      mass: s.mass,
      velocity: s.velocity,
    }),
  )
}

/** Peak progress reached, and when. Above 1 means it overshoots. */
export function overshoot(s: SpringConfig): { peak: number; atMs: number } {
  // Strict window: a bouncy spring's later swings sit past the first rest.
  const end = settlingTime(s, MOTION_REST, "last")
  let peak = 0
  let atMs = 0
  for (let ms = 0; ms <= end; ms += 1) {
    const v = springValue(s, ms)
    if (v > peak) {
      peak = v
      atMs = ms
    }
  }
  return { peak, atMs }
}

/**
 * How many times the curve turns around by more than `tolerance`.
 *
 * This is what decides whether a cubic-bezier can stand in for a spring: a
 * bezier can express one overshoot but cannot oscillate, so anything with more
 * than one extremum has no faithful bezier and the conversion must be refused
 * rather than approximated.
 */
export function extremaCount(s: SpringConfig, tolerance = 0.001): number {
  const end = settlingTime(s, MOTION_REST, "last")
  let count = 0
  let prev = springVelocity(s, 0)
  for (let ms = 1; ms <= end; ms += 1) {
    const v = springVelocity(s, ms)
    if (prev !== 0 && Math.sign(v) !== Math.sign(prev)) {
      // Only count a turn that actually goes somewhere visible.
      if (Math.abs(1 - springValue(s, ms)) > tolerance) count++
    }
    prev = v
  }
  return count
}
