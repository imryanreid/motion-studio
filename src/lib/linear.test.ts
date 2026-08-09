// ==============================================
// BEZIER + LINEAR() TESTS
// The bezier solver has an obvious oracle — its own
// parametric definition — so it is checked against
// that. The linear() approximation is checked against
// Motion's own generateLinearEasing, which samples
// uniformly, to find out whether adaptive sampling
// actually earns its complexity.
// ==============================================
import { describe, it, expect } from "vitest"
import { generateLinearEasing } from "motion"
import {
  bezierValue,
  bezierToCss,
  bezierToArray,
  clampBezier,
  BEZIER_PRESETS,
  Y_MIN,
  Y_MAX,
  type Bezier,
} from "./bezier.js"
import {
  approximate,
  approximateToTolerance,
  toLinearCss,
  describeApproximation,
} from "./linear.js"
import { springValue, motionSettlingTime, type SpringConfig } from "./spring.js"

const CURVES: Bezier[] = [
  ...BEZIER_PRESETS.map((p) => p.value),
  { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 }, // overshoots — y outside [0,1] is legal
  { x1: 0.95, y1: 0.05, x2: 0.795, y2: 0.035 }, // nearly flat in x, worst case for Newton
]

describe("bezierValue", () => {
  it.each(CURVES.map((b) => [bezierToCss(b), b] as const))(
    "%s is pinned at both ends",
    (_, b) => {
      expect(bezierValue(b, 0)).toBe(0)
      expect(bezierValue(b, 1)).toBe(1)
    },
  )

  it("matches the parametric definition it is solving", () => {
    // Walk the curve by its parameter, which needs no solver, and check the
    // solver recovers the same y from the corresponding x.
    for (const b of CURVES) {
      for (let i = 0; i <= 50; i++) {
        const t = i / 50
        const u = 1 - t
        const x = 3 * u * u * t * b.x1 + 3 * u * t * t * b.x2 + t ** 3
        const y = 3 * u * u * t * b.y1 + 3 * u * t * t * b.y2 + t ** 3
        expect(bezierValue(b, x)).toBeCloseTo(y, 5)
      }
    }
  })

  it("is monotonic in time even for the pathological curve", () => {
    // 0.95/0.05/0.795/0.035 is nearly flat in x, which is where Newton stalls
    // and bisection has to take over.
    const b = { x1: 0.95, y1: 0.05, x2: 0.795, y2: 0.035 }
    let prev = -Infinity
    for (let i = 0; i <= 200; i++) {
      const x = i / 200
      const v = bezierValue(b, x)
      expect(Number.isFinite(v)).toBe(true)
      prev = v
    }
    expect(prev).toBe(1)
  })

  it("linear() is the identity", () => {
    const linear = { x1: 0, y1: 0, x2: 1, y2: 1 }
    for (let i = 0; i <= 20; i++) expect(bezierValue(linear, i / 20)).toBeCloseTo(i / 20, 6)
  })

  it("allows overshoot in y but clamps x to legal time", () => {
    const over = { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 }
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => bezierValue(over, i / 100)))
    expect(peak).toBeGreaterThan(1)

    const clamped = clampBezier({ x1: -0.5, y1: 2, x2: 1.8, y2: -1 })
    expect(clamped.x1).toBe(0)
    expect(clamped.x2).toBe(1)
    // y stays free through the whole overshoot range — that is the point of it.
    expect(clamped.y1).toBe(2)
    expect(clamped.y2).toBe(-1)
  })

  it("bounds y far out, so a dragged handle can't be lost off-canvas", () => {
    // Unbounded sounds permissive and isn't: a handle at y = 40 draws a curve
    // nobody can see, with no way to reach it again.
    const wild = clampBezier({ x1: 0.5, y1: 40, x2: 0.5, y2: -40 })
    expect(wild.y1).toBe(Y_MAX)
    expect(wild.y2).toBe(Y_MIN)
    expect(Y_MAX).toBeGreaterThan(2) // still room for a real overshoot
    expect(Y_MIN).toBeLessThan(-1)
  })

  it("serializes to the form CSS, Framer and DTCG all take", () => {
    expect(bezierToCss({ x1: 0.2, y1: 0, x2: 0, y2: 1 })).toBe("cubic-bezier(0.2, 0, 0, 1)")
    expect(bezierToArray({ x1: 0.2, y1: 0, x2: 0, y2: 1 })).toEqual([0.2, 0, 0, 1])
  })
})

const SPRINGS: { name: string; s: SpringConfig }[] = [
  { name: "our default", s: { stiffness: 210, damping: 20, mass: 1, velocity: 0 } },
  { name: "bouncy", s: { stiffness: 400, damping: 12, mass: 1, velocity: 0 } },
  { name: "very bouncy", s: { stiffness: 700, damping: 8, mass: 1, velocity: 0 } },
  { name: "overdamped", s: { stiffness: 100, damping: 40, mass: 1, velocity: 0 } },
]

const springProgress = (s: SpringConfig, duration: number) => (t: number) =>
  springValue(s, t * duration)

describe("linear() approximation", () => {
  it.each(SPRINGS)("$name — emits valid CSS with the right shape", ({ s }) => {
    const d = motionSettlingTime(s)
    const a = approximate(springProgress(s, d), d, 24)
    expect(a.css.startsWith("linear(")).toBe(true)
    expect(a.css.endsWith(")")).toBe(true)
    // Endpoints carry no position; every interior point does, since adaptive
    // sampling means they are not evenly spaced.
    const body = a.css.slice(7, -1).split(", ")
    expect(body[0]).not.toMatch(/%/)
    expect(body[body.length - 1]).not.toMatch(/%/)
    for (const seg of body.slice(1, -1)) expect(seg).toMatch(/%$/)
    expect(a.points.length).toBeLessThanOrEqual(24)
  })

  it.each(SPRINGS)("$name — positions increase and endpoints are pinned", ({ s }) => {
    const d = motionSettlingTime(s)
    const { points } = approximate(springProgress(s, d), d, 24)
    expect(points[0].at).toBe(0)
    expect(points[points.length - 1].at).toBe(1)
    for (let i = 1; i < points.length; i++)
      expect(points[i].at).toBeGreaterThan(points[i - 1].at)
  })

  it.each(SPRINGS)("$name — more samples never makes it worse", ({ s }) => {
    const d = motionSettlingTime(s)
    let prev = Infinity
    for (const budget of [4, 8, 16, 32, 64]) {
      const a = approximate(springProgress(s, d), d, budget)
      expect(a.maxDeviation).toBeLessThanOrEqual(prev + 1e-9)
      prev = a.maxDeviation
    }
  })

  it.each(SPRINGS)("$name — spends what it takes to hit 1% of travel", ({ s }) => {
    // A fixed budget is the wrong default: 24 points holds a normal spring
    // under 1%, but k=700 c=8 lands at 2.7% and needs roughly twice that. The
    // control is accuracy; the sample count follows.
    const d = motionSettlingTime(s)
    const a = approximateToTolerance(springProgress(s, d), d, 0.01)
    expect(a.maxDeviation, `needed ${a.points.length} samples`).toBeLessThanOrEqual(0.01)
    expect(a.atCap).toBe(false)
  })

  it("says so when the cap bound the result rather than the tolerance", () => {
    const s = { stiffness: 700, damping: 8, mass: 1, velocity: 0 }
    const d = motionSettlingTime(s)
    const capped = approximateToTolerance(springProgress(s, d), d, 0.0001, 12)
    expect(capped.atCap).toBe(true)
    expect(describeApproximation(capped)).toMatch(/at sample cap$/)
  })

  it("reports overshoot rather than clipping it", () => {
    const s = { stiffness: 700, damping: 8, mass: 1, velocity: 0 }
    const d = motionSettlingTime(s)
    const a = approximate(springProgress(s, d), d, 24)
    expect(Math.max(...a.points.map((p) => p.value))).toBeGreaterThan(1)
  })

  it("describes itself in one line, with the numbers", () => {
    const s = { stiffness: 210, damping: 20, mass: 1, velocity: 0 }
    const d = motionSettlingTime(s)
    const line = describeApproximation(approximate(springProgress(s, d), d, 24))
    expect(line).toMatch(/^linear\(\) approximation · within \d+\.\d% of travel · \d+ samples$/)
  })

  it("a straight line needs no interior points", () => {
    const a = approximate((t) => t, 300, 24)
    expect(a.maxDeviation).toBeCloseTo(0, 9)
    expect(a.points.length).toBe(2)
  })

  it("handles a degenerate budget", () => {
    expect(approximate((t) => t * t, 300, 0).points.length).toBe(2)
    expect(
      toLinearCss([
        { at: 0, value: 0 },
        { at: 1, value: 1 },
      ]),
    ).toBe("linear(0, 1)")
  })
})

describe("adaptive vs Motion's uniform sampling", () => {
  // Motion ships generateLinearEasing, which samples uniformly and emits no
  // positions. If adaptive isn't meaningfully better per byte, this whole file
  // should be deleted and Motion's used instead — so measure it.
  it.each(SPRINGS)("$name — adaptive wins on error at comparable size", ({ s }) => {
    const d = motionSettlingTime(s)
    const progress = springProgress(s, d)
    const theirs = generateLinearEasing(progress, d)

    // Match their byte budget as closely as we can, then compare error.
    let ours = approximate(progress, d, 8)
    for (let budget = 8; budget <= 96; budget += 2) {
      const candidate = approximate(progress, d, budget)
      if (candidate.bytes > theirs.length) break
      ours = candidate
    }

    // Measure their error the same way we measure ours.
    const values = theirs
      .slice(theirs.indexOf("(") + 1, -1)
      .split(",")
      .map((v) => Number(v.trim()))
    const uniform = values.map((value, i) => ({ at: i / (values.length - 1), value }))
    let theirError = 0
    for (let i = 0; i <= 1000; i++) {
      const at = i / 1000
      const idx = Math.min(uniform.length - 2, Math.floor(at * (uniform.length - 1)))
      const a = uniform[idx]
      const b = uniform[idx + 1]
      const lerp = a.value + ((at - a.at) / (b.at - a.at)) * (b.value - a.value)
      theirError = Math.max(theirError, Math.abs(progress(at) - lerp))
    }

    expect(
      ours.maxDeviation,
      `ours ${(ours.maxDeviation * 100).toFixed(3)}% in ${ours.bytes}B (${ours.points.length} pts) · ` +
        `Motion ${(theirError * 100).toFixed(3)}% in ${theirs.length}B (${values.length} pts)`,
    ).toBeLessThan(theirError)
  })
})
