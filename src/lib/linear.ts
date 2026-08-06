// ==============================================
// LINEAR() APPROXIMATION
// CSS cannot run spring physics. `linear()` takes a
// piecewise-linear polyline whose values may exceed 1
// or fall below 0, which is exactly what overshoot
// needs — so a spring reaches a stylesheet as a
// sampled approximation of itself.
//
// That approximation has a cost, and the whole point
// of this file is to measure it rather than assert
// it's fine. Because the spring is solved in closed
// form, every sample here is exact and the error
// figure is a measurement.
//
// Sampling is adaptive, not uniform: points are spent
// where the curve bends. See pickPoints for why that
// matters and what it buys.
// ==============================================

/** A point on the emitted polyline. `at` is 0–1 along the duration. */
export type LinearPoint = { at: number; value: number }

export type LinearApproximation = {
  points: LinearPoint[]
  css: string
  /** Largest vertical gap, as a fraction of total travel. */
  maxDeviation: number
  /** Largest horizontal gap, in ms — usually the more intuitive number. */
  maxTemporalMs: number
  bytes: number
}

/** How finely the true curve is measured. Not the output resolution. */
const DENSE = 1000

function denseSamples(progress: (t: number) => number): LinearPoint[] {
  const out: LinearPoint[] = []
  for (let i = 0; i <= DENSE; i++) out.push({ at: i / DENSE, value: progress(i / DENSE) })
  return out
}

function interpolate(points: LinearPoint[], at: number): number {
  if (at <= points[0].at) return points[0].value
  const last = points[points.length - 1]
  if (at >= last.at) return last.value
  for (let i = 1; i < points.length; i++) {
    const b = points[i]
    if (at <= b.at) {
      const a = points[i - 1]
      const span = b.at - a.at
      return span === 0 ? b.value : a.value + ((at - a.at) / span) * (b.value - a.value)
    }
  }
  return last.value
}

/**
 * Choose `budget` points to approximate the curve, worst-error-first.
 *
 * Start with the endpoints, then repeatedly add whichever dense sample sits
 * furthest from the polyline so far. That directly attacks the number the
 * export reports — max deviation — rather than spreading points evenly and
 * hoping.
 *
 * The difference is not marginal on a bouncy spring. Uniform sampling spends
 * most of its budget on the long flat tail where the curve is already a
 * straight line; adaptive spends it on the bounces, where being wrong is
 * visible.
 */
function pickPoints(dense: LinearPoint[], budget: number): LinearPoint[] {
  const chosen = [0, dense.length - 1]
  while (chosen.length < Math.max(2, budget)) {
    let worstIdx = -1
    let worstErr = 0
    for (let seg = 0; seg < chosen.length - 1; seg++) {
      const a = dense[chosen[seg]]
      const b = dense[chosen[seg + 1]]
      const span = b.at - a.at
      for (let i = chosen[seg] + 1; i < chosen[seg + 1]; i++) {
        const p = dense[i]
        const lerp =
          span === 0 ? a.value : a.value + ((p.at - a.at) / span) * (b.value - a.value)
        const err = Math.abs(p.value - lerp)
        if (err > worstErr) {
          worstErr = err
          worstIdx = i
        }
      }
    }
    if (worstIdx < 0) break // already exact everywhere
    chosen.push(worstIdx)
    chosen.sort((x, y) => x - y)
  }
  return chosen.map((i) => dense[i])
}

const trim = (n: number) => Number(n.toFixed(4))

/**
 * The CSS string.
 *
 * Positions are emitted for interior points because adaptive sampling means
 * they aren't evenly spaced. The endpoints don't need one — 0% and 100% are
 * implied — so they're left off.
 */
export function toLinearCss(points: LinearPoint[]): string {
  const body = points
    .map((p, i) =>
      i === 0 || i === points.length - 1
        ? String(trim(p.value))
        : `${trim(p.value)} ${Number((p.at * 100).toFixed(2))}%`,
    )
    .join(", ")
  return `linear(${body})`
}

/**
 * Approximate a progress function, and measure what it cost.
 *
 * `maxTemporalMs` is defined as: for each moment on the true curve, the closest
 * moment at which the approximation held that same value; the largest such gap.
 * That's the honest reading of "this arrives up to N ms early or late", and it
 * stays well-defined for non-monotonic curves where simply inverting would not.
 */
export function approximate(
  progress: (t: number) => number,
  durationMs: number,
  budget = 24,
): LinearApproximation {
  const dense = denseSamples(progress)
  const points = pickPoints(dense, budget)
  const css = toLinearCss(points)

  let maxDeviation = 0
  for (const p of dense) {
    maxDeviation = Math.max(maxDeviation, Math.abs(p.value - interpolate(points, p.at)))
  }

  let maxTemporal = 0
  for (const p of dense) {
    let nearest = Infinity
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      const lo = Math.min(a.value, b.value)
      const hi = Math.max(a.value, b.value)
      if (p.value < lo || p.value > hi) continue
      const span = b.value - a.value
      const at = span === 0 ? a.at : a.at + ((p.value - a.value) / span) * (b.at - a.at)
      nearest = Math.min(nearest, Math.abs(at - p.at))
    }
    if (nearest !== Infinity) maxTemporal = Math.max(maxTemporal, nearest)
  }

  return {
    points,
    css,
    maxDeviation,
    maxTemporalMs: maxTemporal * durationMs,
    bytes: css.length,
  }
}

/**
 * Spend as many samples as it takes to hit a target error, up to a cap.
 *
 * A fixed budget is the wrong default. 24 points holds a normal spring under
 * 1% of travel, but a heavily oscillatory one — k=700, c=8 — needs far more,
 * and at 24 it lands at 2.7%. Nobody wants to discover that by reading a
 * number; they want the curve to be right and to be told what it cost.
 *
 * So the control people actually get is "how accurate", and the sample count
 * follows. `atCap` is true when the cap bound the result rather than the
 * tolerance, which is the case the fidelity note has to be honest about.
 */
export function approximateToTolerance(
  progress: (t: number) => number,
  durationMs: number,
  tolerance = 0.01,
  cap = 96,
): LinearApproximation & { atCap: boolean } {
  let best = approximate(progress, durationMs, 4)
  for (let budget = 4; budget <= cap; budget += 2) {
    best = approximate(progress, durationMs, budget)
    if (best.maxDeviation <= tolerance) return { ...best, atCap: false }
  }
  return { ...best, atCap: true }
}

/** One line for the export panel's fidelity note. */
export function describeApproximation(a: LinearApproximation & { atCap?: boolean }): string {
  const pct = (a.maxDeviation * 100).toFixed(1)
  const base = `linear() approximation · max error ${Math.round(a.maxTemporalMs)}ms (${pct}% of travel) · ${a.points.length} samples`
  // Say when the sample cap bound the result rather than the tolerance —
  // otherwise the number reads as a choice when it was a limit.
  return a.atCap ? `${base} · at sample cap` : base
}
