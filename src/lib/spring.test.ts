// ==============================================
// SPRING TESTS
// The closed form is checked against Motion's own
// spring, not against a textbook.
//
// Matching the runtime people will actually paste
// into matters more than matching the derivation. If
// the two disagree, Motion wins and the formulas
// change — SPEC.md §12.4 says so explicitly, and this
// file is where that gets decided.
// ==============================================
import { describe, it, expect } from "vitest"
import { spring as motionSpring, calcGeneratorDuration } from "motion"
import {
  springValue,
  springVelocity,
  settlingTime,
  motionSettlingTime,
  derive,
  normalizeMass,
  overshoot,
  extremaCount,
  MOTION_REST,
  type SpringConfig,
} from "./spring.js"

/** A spread covering all three damping regimes, plus initial velocity. */
const CASES: { name: string; s: SpringConfig }[] = [
  { name: "motion default", s: { stiffness: 100, damping: 10, mass: 1, velocity: 0 } },
  { name: "our default", s: { stiffness: 210, damping: 20, mass: 1, velocity: 0 } },
  { name: "bouncy", s: { stiffness: 400, damping: 12, mass: 1, velocity: 0 } },
  { name: "very bouncy", s: { stiffness: 700, damping: 8, mass: 1, velocity: 0 } },
  { name: "critical-ish", s: { stiffness: 100, damping: 20, mass: 1, velocity: 0 } },
  { name: "overdamped", s: { stiffness: 100, damping: 40, mass: 1, velocity: 0 } },
  { name: "heavy mass", s: { stiffness: 210, damping: 20, mass: 3, velocity: 0 } },
  { name: "light mass", s: { stiffness: 210, damping: 20, mass: 0.4, velocity: 0 } },
  { name: "with velocity", s: { stiffness: 210, damping: 20, mass: 1, velocity: 4 } },
  { name: "negative velocity", s: { stiffness: 210, damping: 20, mass: 1, velocity: -3 } },
]

const motionGen = (s: SpringConfig) =>
  motionSpring({
    keyframes: [0, 1],
    stiffness: s.stiffness,
    damping: s.damping,
    mass: s.mass,
    velocity: s.velocity,
  })

describe("springValue — agrees with Motion", () => {
  // Motion's generator is NOT a pure function of time. It snaps to exactly 1
  // and reports done whenever the instantaneous rest condition holds — which
  // includes velocity zero-crossings mid-oscillation, so a bouncy spring has
  // flat spots in the middle of its curve and normal values again afterwards.
  // (k=100 c=10 snaps across 1068–1114ms, then returns 1.0026 at 1200ms.)
  //
  // So compare where Motion is actually reporting the curve, and check
  // separately that every snap it took was a legitimate one. This is also why
  // the tool computes its own values rather than sampling Motion: sampling it
  // would bake those flat spots into the exported linear().
  it.each(CASES)("$name", ({ s }) => {
    const gen = motionGen(s)
    const duration = calcGeneratorDuration(gen)
    const samples = 200
    let worst = 0
    let worstAt = 0
    let compared = 0
    let snaps = 0

    for (let i = 0; i <= samples; i++) {
      const ms = (i / samples) * duration
      const r = gen.next(ms)
      const ours = springValue(s, ms)

      if (r.done) {
        // A snap is only legitimate if we agree it was within resting distance.
        snaps++
        expect(
          Math.abs(1 - ours),
          `Motion snapped at ${ms.toFixed(1)}ms but we were ${ours.toFixed(4)}`,
        ).toBeLessThanOrEqual(MOTION_REST.restDelta + 1e-9)
        continue
      }

      compared++
      const diff = Math.abs(ours - r.value)
      if (diff > worst) {
        worst = diff
        worstAt = ms
      }
    }

    expect(compared, "no unsnapped samples to compare").toBeGreaterThan(samples / 4)
    expect(
      worst,
      `worst divergence ${worst.toExponential(2)} at ${worstAt.toFixed(1)}ms over ${compared} samples (${snaps} snapped)`,
    ).toBeLessThan(1e-9)
  })
})

describe("springVelocity — is the derivative of springValue", () => {
  it.each(CASES)("$name", ({ s }) => {
    const end = settlingTime(s, MOTION_REST, "last")
    for (let ms = 1; ms < end; ms += Math.max(1, Math.floor(end / 40))) {
      const h = 0.01
      const numeric = ((springValue(s, ms + h) - springValue(s, ms - h)) / (2 * h)) * 1000
      expect(springVelocity(s, ms)).toBeCloseTo(numeric, 2)
    }
  })

  it("starts at the configured initial velocity", () => {
    for (const v of [0, 4, -3, 12]) {
      const s = { stiffness: 210, damping: 20, mass: 1, velocity: v }
      expect(springVelocity(s, 0)).toBeCloseTo(v, 6)
    }
  })
})

describe("the shape of the curve", () => {
  it.each(CASES)("$name starts at 0 and ends at 1", ({ s }) => {
    expect(springValue(s, 0)).toBe(0)
    expect(springValue(s, settlingTime(s, MOTION_REST, "last") * 4)).toBeCloseTo(1, 3)
  })

  it("only underdamped springs overshoot", () => {
    for (const { s } of CASES) {
      if (s.velocity !== 0) continue // a shove can push any spring past the target
      const { regime } = derive(s)
      const { peak } = overshoot(s)
      if (regime === "underdamped") expect(peak).toBeGreaterThan(1)
      else expect(peak).toBeLessThanOrEqual(1 + 1e-6)
    }
  })

  it("classifies the damping regimes", () => {
    expect(derive({ stiffness: 100, damping: 10, mass: 1, velocity: 0 }).regime).toBe(
      "underdamped",
    )
    expect(derive({ stiffness: 100, damping: 20, mass: 1, velocity: 0 }).regime).toBe(
      "critical",
    )
    expect(derive({ stiffness: 100, damping: 40, mass: 1, velocity: 0 }).regime).toBe(
      "overdamped",
    )
  })
})

describe("normalizeMass — lossless, and must be reported as such", () => {
  it.each(CASES)("$name is identical at mass 1", ({ s }) => {
    const n = normalizeMass(s)
    expect(n.mass).toBe(1)
    const end = settlingTime(s)
    for (let ms = 0; ms <= end; ms += Math.max(1, Math.floor(end / 100))) {
      // Not "close" — the same motion. Only k/m and c/m appear in the equation.
      expect(springValue(n, ms)).toBeCloseTo(springValue(s, ms), 12)
    }
  })

  it("preserves the damping ratio and natural frequency exactly", () => {
    for (const { s } of CASES) {
      const a = derive(s)
      const b = derive(normalizeMass(s))
      expect(b.dampingRatio).toBeCloseTo(a.dampingRatio, 12)
      expect(b.naturalFrequency).toBeCloseTo(a.naturalFrequency, 12)
    }
  })
})

describe("settlingTime — a threshold, not a fact", () => {
  it.each(CASES)("$name — ours is never later than Motion's", ({ s }) => {
    // Motion walks on a coarse grid and rounds up to 50ms, so it reports the
    // same or longer. What must never happen is ours being *later* than
    // Motion's: that would mean sampling a linear() window past the point the
    // JS runtime has already stopped.
    expect(settlingTime(s, MOTION_REST)).toBeLessThanOrEqual(motionSettlingTime(s))
  })

  it("Motion rounds its duration up to a 50ms grid", () => {
    // Documenting the mechanism, because it explains the gap and would
    // otherwise look like our maths drifting.
    for (const { s } of CASES) expect(motionSettlingTime(s) % 50).toBe(0)
  })

  it("matches Motion exactly once its rounding is accounted for — except when it steps over a rest window", () => {
    const exact: string[] = []
    const longer: string[] = []
    for (const { name, s } of CASES) {
      const rounded = Math.ceil(settlingTime(s, MOTION_REST) / 50) * 50
      ;(motionSettlingTime(s) === rounded ? exact : longer).push(name)
    }
    // The three that differ are the ones with a brief mid-oscillation rest
    // window — a bouncy spring passes through velocity zero inside restDelta
    // and reads as at rest for an instant our 1ms scan sees and Motion's
    // coarse walk misses.
    expect(exact.length).toBeGreaterThanOrEqual(7)
    for (const name of longer) {
      expect(motionSettlingTime(CASES.find((c) => c.name === name)!.s)).toBeGreaterThan(
        Math.ceil(settlingTime(CASES.find((c) => c.name === name)!.s, MOTION_REST) / 50) * 50,
      )
    }
  })

  it("first-rest and last-violation differ for bouncy springs — that's the point", () => {
    // An underdamped curve passes through velocity zero at every turnaround, so
    // once it is inside restDelta it reads as at rest for an instant while
    // still visibly moving either side. Motion stops there; strictly, it hasn't
    // finished.
    const bouncy = { stiffness: 700, damping: 8, mass: 1, velocity: 0 }
    const first = settlingTime(bouncy, MOTION_REST, "first")
    const last = settlingTime(bouncy, MOTION_REST, "last")
    expect(last).toBeGreaterThan(first)
  })

  it("agrees with itself when the spring never turns around", () => {
    const overdamped = { stiffness: 100, damping: 40, mass: 1, velocity: 0 }
    const first = settlingTime(overdamped, MOTION_REST, "first")
    const last = settlingTime(overdamped, MOTION_REST, "last")
    expect(Math.abs(last - first)).toBeLessThanOrEqual(1)
  })

  it("moves when the threshold moves — which is the whole point", () => {
    const s = { stiffness: 210, damping: 20, mass: 1, velocity: 0 }
    expect(settlingTime(s, { restDelta: 0.1, restSpeed: 0.1 })).toBeLessThan(
      settlingTime(s, { restDelta: 0.0001, restSpeed: 0.0001 }),
    )
  })

  it("is at rest by the time it reports", () => {
    for (const { s } of CASES) {
      const end = settlingTime(s, MOTION_REST)
      expect(Math.abs(1 - springValue(s, end))).toBeLessThanOrEqual(MOTION_REST.restDelta)
    }
  })
})

describe("extremaCount — what decides whether a bezier can stand in", () => {
  it("counts none for a spring that never turns around", () => {
    expect(extremaCount({ stiffness: 100, damping: 40, mass: 1, velocity: 0 })).toBe(0)
    expect(extremaCount({ stiffness: 100, damping: 20, mass: 1, velocity: 0 })).toBe(0)
  })

  it("counts more than one for anything visibly bouncy", () => {
    // A bezier can express a single overshoot but cannot oscillate, so these
    // are the springs the conversion has to refuse.
    expect(extremaCount({ stiffness: 700, damping: 8, mass: 1, velocity: 0 })).toBeGreaterThan(
      1,
    )
    expect(extremaCount({ stiffness: 400, damping: 12, mass: 1, velocity: 0 })).toBeGreaterThan(
      1,
    )
  })
})
