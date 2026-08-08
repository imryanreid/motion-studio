// ==============================================
// CUBIC BEZIER
// The other kind of easing: four control points, the
// form CSS, Tailwind and Framer Motion all take
// verbatim.
//
// A bezier timing function is a parametric curve, so
// getting y at a given time means first solving for
// the parameter t where x(t) = time. Newton-Raphson
// converges in a few steps for well-formed curves,
// with bisection as the fallback for the flat regions
// where its derivative approaches zero.
// ==============================================

/** `cubic-bezier(x1, y1, x2, y2)`. x is clamped to [0,1]; y is not. */
export type Bezier = { x1: number; y1: number; x2: number; y2: number }

/**
 * Starting points, not destinations — the editor makes any of these custom on
 * the first drag. `standard` is Material's, which is where `standard` as a
 * token name comes from too.
 */
export const BEZIER_PRESETS: { id: string; label: string; value: Bezier }[] = [
  // Named "Standard" until it collided with the shipped variant also called
  // standard — two different things wearing one word in the same panel.
  { id: "default", label: "Default", value: { x1: 0.2, y1: 0, x2: 0, y2: 1 } },
  { id: "out", label: "Ease out", value: { x1: 0, y1: 0, x2: 0.58, y2: 1 } },
  { id: "in", label: "Ease in", value: { x1: 0.42, y1: 0, x2: 1, y2: 1 } },
  { id: "in-out", label: "Ease in-out", value: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
  { id: "linear", label: "Linear", value: { x1: 0, y1: 0, x2: 1, y2: 1 } },
]

/**
 * x1 and x2 must stay in [0,1] — required by CSS and by what a timing function
 * means, since time cannot run backwards. y is deliberately unbounded: that is
 * what allows a single overshoot.
 */
export function clampBezier(b: Bezier): Bezier {
  return {
    x1: Math.min(1, Math.max(0, b.x1)),
    y1: b.y1,
    x2: Math.min(1, Math.max(0, b.x2)),
    y2: b.y2,
  }
}

/** One axis of the curve at parameter t, with the endpoints pinned at 0 and 1. */
function axis(p1: number, p2: number, t: number): number {
  const u = 1 - t
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t
}

function axisDerivative(p1: number, p2: number, t: number): number {
  const u = 1 - t
  return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2)
}

const NEWTON_STEPS = 8
const NEWTON_EPSILON = 1e-7
const MIN_SLOPE = 1e-6

/**
 * The parameter t at which x(t) equals `time`.
 *
 * Newton-Raphson first, because it converges in a handful of iterations for
 * anything well-formed. Where the curve is nearly flat in x its derivative
 * approaches zero and Newton either stalls or overshoots wildly, so bisection
 * takes over — slower, but it cannot diverge.
 */
function solveT(b: Bezier, time: number): number {
  let t = time
  for (let i = 0; i < NEWTON_STEPS; i++) {
    const error = axis(b.x1, b.x2, t) - time
    if (Math.abs(error) < NEWTON_EPSILON) return t
    const slope = axisDerivative(b.x1, b.x2, t)
    if (Math.abs(slope) < MIN_SLOPE) break
    t -= error / slope
  }

  let lo = 0
  let hi = 1
  t = time
  for (let i = 0; i < 40; i++) {
    const x = axis(b.x1, b.x2, t)
    if (Math.abs(x - time) < NEWTON_EPSILON) return t
    if (x < time) lo = t
    else hi = t
    t = (lo + hi) / 2
  }
  return t
}

/** Progress at `time` (0–1). May exceed [0,1] when the control points do. */
export function bezierValue(b: Bezier, time: number): number {
  if (time <= 0) return 0
  if (time >= 1) return 1
  return axis(b.y1, b.y2, solveT(b, time))
}

/** A progress function over a duration in ms, matching the spring's shape. */
export function bezierAt(b: Bezier, ms: number, durationMs: number): number {
  return bezierValue(b, durationMs <= 0 ? 1 : ms / durationMs)
}

const trim = (n: number) => Number(n.toFixed(4))

export function bezierToCss(b: Bezier): string {
  return `cubic-bezier(${trim(b.x1)}, ${trim(b.y1)}, ${trim(b.x2)}, ${trim(b.y2)})`
}

/** The four numbers, which is the form Framer Motion and DTCG both want. */
export function bezierToArray(b: Bezier): [number, number, number, number] {
  return [trim(b.x1), trim(b.y1), trim(b.x2), trim(b.y2)]
}

/**
 * How many times the curve turns around.
 *
 * The number that decides whether a bezier can stand in for a spring: a cubic
 * can express one overshoot but cannot oscillate, so anything needing more than
 * one extremum has no faithful bezier at all.
 */
export function bezierExtrema(b: Bezier, tolerance = 0.001): number {
  let count = 0
  let prev = bezierValue(b, 0.001) - bezierValue(b, 0)
  for (let i = 2; i <= 200; i++) {
    const t = i / 200
    const d = bezierValue(b, t) - bezierValue(b, t - 1 / 200)
    if (prev !== 0 && Math.sign(d) !== Math.sign(prev) && Math.abs(d) > tolerance / 100) count++
    prev = d
  }
  return count
}
