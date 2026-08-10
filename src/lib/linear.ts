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
  return measure(dense, pickPoints(dense, budget), durationMs)
}

/**
 * What a chosen set of points costs against the curve it approximates.
 *
 * Shared by both callers on purpose: `approximateToTolerance` finds its point
 * set by a different route, and routing both through one measurement is what
 * makes "byte-identical" a property of the code rather than of a test.
 */
function measure(
  dense: LinearPoint[],
  points: LinearPoint[],
  durationMs: number,
): LinearApproximation {
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
/**
 * The greedy insertion order, and the error remaining after each insertion.
 *
 * `pickPoints` is deterministic worst-error-first, so the set for budget b+1
 * is the set for b plus one index — budgets are nested, not independent. The
 * sweep below used to rebuild the whole chain for every budget it tried,
 * throwing away 4, 6, 8 … points of identical work on the way to 96.
 *
 * The error each set leaves behind comes free: the scan that picks the next
 * point already measures the worst error across every segment, which *is* the
 * current set's `maxDeviation`. So one pass yields both the order and the
 * deviation at every size.
 */
type GreedyChain = {
  /** Indices in the order the greedy added them, after the two endpoints. */
  order: number[]
  /** `dev[n]` is the maxDeviation of the set of size `n`. */
  dev: number[]
  /** The largest set the curve can use; beyond this the fit is already exact. */
  maxSize: number
}

function greedyChain(dense: LinearPoint[], cap: number): GreedyChain {
  const chosen = [0, dense.length - 1]
  const order: number[] = []
  const dev: number[] = []

  for (;;) {
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
    dev[chosen.length] = worstErr
    // Nothing left to improve, or the cap is reached.
    if (worstIdx < 0 || chosen.length >= cap) {
      return { order, dev, maxSize: chosen.length }
    }
    order.push(worstIdx)
    chosen.push(worstIdx)
    chosen.sort((x, y) => x - y)
  }
}

/** The set of a given size, which is the two endpoints plus the first n-2 picks. */
function setOfSize(dense: LinearPoint[], chain: GreedyChain, size: number): LinearPoint[] {
  const n = Math.min(size, chain.maxSize)
  const idx = [0, dense.length - 1, ...chain.order.slice(0, Math.max(0, n - 2))]
  idx.sort((x, y) => x - y)
  return idx.map((i) => dense[i])
}

/**
 * Spend as many samples as it takes to hit a target error, up to a cap.
 *
 * Byte-identical to sweeping `approximate` over every even budget, because the
 * greedy is nested — the set this returns for budget b is the same set that
 * rebuilding from scratch at b would produce. `linear.test.ts` asserts that
 * against the old path across a spread of curves.
 */
export function approximateToTolerance(
  progress: (t: number) => number,
  durationMs: number,
  tolerance = 0.01,
  cap = 96,
): LinearApproximation & { atCap: boolean } {
  const dense = denseSamples(progress)
  const chain = greedyChain(dense, cap)
  const deviationAt = (size: number) => chain.dev[Math.min(size, chain.maxSize)]

  for (let budget = 4; budget <= cap; budget += 2) {
    if (deviationAt(budget) <= tolerance) {
      return { ...measure(dense, setOfSize(dense, chain, budget), durationMs), atCap: false }
    }
  }
  return { ...measure(dense, setOfSize(dense, chain, cap), durationMs), atCap: true }
}

/** One line for the export panel's fidelity note. */
export function describeApproximation(a: LinearApproximation & { atCap?: boolean }): string {
  const pct = (a.maxDeviation * 100).toFixed(1)
  // Deviation, not maxTemporalMs, and deliberately.
  //
  // This used to read "max error 375ms (1.0% of travel)", which invites you to
  // read one quantity stated twice. They are different axes: deviation is
  // vertical (position), maxTemporalMs is horizontal (timing). Worse, the
  // sampler optimises deviation and the timing figure is emergent, so
  // tightening the tolerance could make the headline number go *up* — 3% gave
  // 306ms where 1% gave 375ms, which reads as a broken control.
  //
  // The timing figure is real and still reported, but in the detail where it
  // can say where it comes from: on a spring it lands in the asymptotic tail,
  // after the element has visually arrived.
  const base = `linear() approximation · within ${pct}% of travel · ${a.points.length} samples`
  // Say when the sample cap bound the result rather than the tolerance —
  // otherwise the number reads as a choice when it was a limit.
  return a.atCap ? `${base} · at sample cap` : base
}
