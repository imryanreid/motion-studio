// ==============================================
// TOKEN MODEL + URL TESTS
// The rules the tool teaches have to actually hold:
// exits faster and flatter, durations generated but
// pinnable, and a link that round-trips or degrades
// rather than breaking.
// ==============================================
import { describe, it, expect } from "vitest"
import {
  DEFAULT_STATE,
  DURATION_NAMES,
  EMPHASIS_NAMES,
  resolveDurations,
  resolveSemantics,
  deriveExitEasing,
  mirrorBezier,
  criticalDamping,
  isDerived,
  staggerDelay,
  PURPOSES,
  type MotionState,
} from "./tokens.js"
import { encodeState, decodeState, resolveState, isDefaultState } from "./params.js"
import { derive } from "./spring.js"
import { bezierValue } from "./bezier.js"

describe("durations are generated, with pins as the escape hatch", () => {
  it("produces the documented default scale", () => {
    expect(resolveDurations(DEFAULT_STATE)).toEqual({
      instant: 80, // pinned — not on the curve
      fast: 140,
      base: 200,
      slow: 280,
      deliberate: 390,
    })
  })

  it("instant ships pinned and the rest derived", () => {
    expect(isDerived(DEFAULT_STATE, "instant")).toBe(false)
    for (const n of DURATION_NAMES) {
      if (n !== "instant") expect(isDerived(DEFAULT_STATE, n)).toBe(true)
    }
  })

  it("stays ordered whatever the ratio", () => {
    for (const ratio of [1.1, 1.25, 1.4, 1.8, 2.5]) {
      const d = resolveDurations({ ...DEFAULT_STATE, ratio, pins: {} })
      const values = DURATION_NAMES.map((n) => d[n])
      for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1])
    }
  })

  it("snaps to the grid", () => {
    for (const snap of [1, 5, 10, 25]) {
      const d = resolveDurations({ ...DEFAULT_STATE, snap, pins: {} })
      for (const n of DURATION_NAMES) expect(d[n] % snap).toBe(0)
    }
  })

  it("a pin overrides the curve exactly", () => {
    const d = resolveDurations({ ...DEFAULT_STATE, pins: { instant: 50, deliberate: 1000 } })
    expect(d.instant).toBe(50)
    expect(d.deliberate).toBe(1000)
    expect(d.base).toBe(200) // untouched
  })
})

describe("exits are faster and flatter — the rule the tool teaches", () => {
  it("mirroring turns ease-out into exactly ease-in", () => {
    // The check that this is the right transform rather than an approximation.
    expect(mirrorBezier({ x1: 0, y1: 0, x2: 0.58, y2: 1 })).toEqual({
      x1: 0.42,
      y1: 0,
      x2: 1,
      y2: 1,
    })
  })

  it("a mirrored curve accelerates where the original decelerated", () => {
    const out = { x1: 0, y1: 0, x2: 0.58, y2: 1 }
    const mirrored = mirrorBezier(out)
    // Early on, ease-out is ahead of linear and ease-in is behind it.
    expect(bezierValue(out, 0.25)).toBeGreaterThan(0.25)
    expect(bezierValue(mirrored, 0.25)).toBeLessThan(0.25)
  })

  it("a spring exit loses its bounce", () => {
    const bouncy = {
      kind: "spring" as const,
      spring: { stiffness: 400, damping: 12, mass: 1, velocity: 0 },
    }
    expect(derive(bouncy.spring).regime).toBe("underdamped")
    const exit = deriveExitEasing(bouncy)
    expect(exit.kind).toBe("spring")
    if (exit.kind !== "spring") throw new Error("unreachable")
    expect(derive(exit.spring).dampingRatio).toBeGreaterThanOrEqual(1 - 1e-9)
    expect(exit.spring.damping).toBeCloseTo(criticalDamping(bouncy.spring), 6)
  })

  it("an already-calm spring is left alone", () => {
    const calm = {
      kind: "spring" as const,
      spring: { stiffness: 100, damping: 40, mass: 1, velocity: 0 },
    }
    const exit = deriveExitEasing(calm)
    if (exit.kind !== "spring") throw new Error("unreachable")
    expect(exit.spring.damping).toBe(40)
  })

  it("bezier exits are shorter than their entrances", () => {
    const semantics = resolveSemantics(DEFAULT_STATE)
    for (const emphasis of EMPHASIS_NAMES) {
      const enter = semantics.find((t) => t.id === `${emphasis}.enter`)!
      const exit = semantics.find((t) => t.id === `${emphasis}.exit`)!
      if (enter.easing.kind !== "bezier") continue // springs set their own duration
      expect(exit.durationMs).toBeLessThan(enter.durationMs)
      expect(exit.durationMs).toBeCloseTo(enter.durationMs * DEFAULT_STATE.exitRatio, 0)
    }
  })
})

describe("semantics and purposes", () => {
  it("emits exactly emphasis × direction", () => {
    const ids = resolveSemantics(DEFAULT_STATE).map((t) => t.id)
    expect(ids).toEqual([
      "subtle.enter",
      "subtle.exit",
      "standard.enter",
      "standard.exit",
      "emphasized.enter",
      "emphasized.exit",
    ])
  })

  it("every purpose aliases a real emphasis", () => {
    for (const p of PURPOSES) expect(EMPHASIS_NAMES).toContain(p.aliasOf)
  })

  it("only travelling purposes are marked as such", () => {
    // A checkbox filling has no distance; a drawer does.
    expect(PURPOSES.find((p) => p.id === "state")!.travels).toBe(false)
    expect(PURPOSES.find((p) => p.id === "drawer")!.travels).toBe(true)
  })

  it("a spring's duration comes from its settling time, not the scale", () => {
    const emphasized = resolveSemantics(DEFAULT_STATE).find((t) => t.id === "emphasized.enter")!
    expect(emphasized.easing.kind).toBe("spring")
    // Not the `slow` duration — a spring has no duration of its own.
    expect(emphasized.durationMs).not.toBe(resolveDurations(DEFAULT_STATE).slow)
    expect(emphasized.durationMs).toBeGreaterThan(0)
  })
})

describe("stagger", () => {
  it("falls off sub-linearly so long lists stay bearable", () => {
    const first = staggerDelay(DEFAULT_STATE, 1) - staggerDelay(DEFAULT_STATE, 0)
    const later = staggerDelay(DEFAULT_STATE, 20) - staggerDelay(DEFAULT_STATE, 19)
    expect(later).toBeLessThan(first)
  })

  it("still increases", () => {
    for (let i = 1; i < 30; i++) {
      expect(staggerDelay(DEFAULT_STATE, i)).toBeGreaterThanOrEqual(
        staggerDelay(DEFAULT_STATE, i - 1),
      )
    }
  })
})

describe("URL state", () => {
  const VARIANTS: { name: string; s: MotionState }[] = [
    { name: "defaults", s: DEFAULT_STATE },
    { name: "retuned scale", s: { ...DEFAULT_STATE, base: 240, ratio: 1.25, snap: 5 } },
    { name: "no pins", s: { ...DEFAULT_STATE, pins: {} } },
    { name: "many pins", s: { ...DEFAULT_STATE, pins: { instant: 60, base: 210, slow: 300 } } },
    { name: "tuned exit", s: { ...DEFAULT_STATE, exitRatio: 0.5 } },
    { name: "tuned stagger", s: { ...DEFAULT_STATE, staggerMs: 25, staggerDecay: 0.7 } },
    { name: "tight tolerance", s: { ...DEFAULT_STATE, tolerance: 0.002 } },
    {
      name: "all springs",
      s: {
        ...DEFAULT_STATE,
        easings: {
          subtle: {
            kind: "spring",
            spring: { stiffness: 300, damping: 30, mass: 1, velocity: 0 },
          },
          standard: {
            kind: "spring",
            spring: { stiffness: 210, damping: 20, mass: 1.5, velocity: 2 },
          },
          emphasized: {
            kind: "spring",
            spring: { stiffness: 700, damping: 8, mass: 1, velocity: 0 },
          },
        },
      },
    },
  ]

  it.each(VARIANTS)("$name round-trips", ({ s }) => {
    expect(resolveState(encodeState(s))).toEqual(s)
  })

  it("round-trips easings for real, not via the default fallback", () => {
    // resolveState substitutes defaults for anything it can't decode, so a
    // defaults-only round-trip can pass while encoding is completely broken —
    // which is exactly what happened: the kind label was being rounded to NaN.
    // Decode directly, where there is no fallback to hide behind.
    for (const { s } of VARIANTS) {
      const decoded = decodeState(encodeState(s))
      expect(decoded.easings).toBeDefined()
      expect(decoded.easings).toEqual(s.easings)
    }
  })

  it("keeps the default link clean", () => {
    expect(isDefaultState(DEFAULT_STATE)).toBe(true)
    expect(isDefaultState({ ...DEFAULT_STATE, base: 201 })).toBe(false)
    // Values equal to the defaults are omitted rather than spelled out.
    const q = encodeState(DEFAULT_STATE)
    expect(q).not.toContain("r=")
    expect(q).not.toContain("sg=")
    expect(q).not.toContain("tol=")
  })

  it("degrades a malformed link to defaults instead of erroring", () => {
    const junk = "d=nonsense&dp=bogus:x&es=b.1&ed=zzz&r=9999&sg=&tol=-4"
    expect(resolveState(junk)).toEqual(DEFAULT_STATE)
  })

  it("keeps the fields it can and drops the ones it can't", () => {
    const mixed = decodeState(`${encodeState({ ...DEFAULT_STATE, base: 300 })}&es=garbage`)
    expect(mixed.base).toBe(300)
    // A bad easing falls back rather than taking the whole link down.
    expect(mixed.easings?.subtle).toEqual(DEFAULT_STATE.easings.subtle)
  })

  it("rejects a spring that could never settle", () => {
    expect(decodeState("es=s.0.0.100.0").easings).toBeUndefined()
    expect(decodeState("es=s.210.20.0.0").easings).toBeUndefined()
  })

  it("uses dots, not commas — URLSearchParams would escape a comma", () => {
    const q = encodeState(DEFAULT_STATE)
    expect(q).not.toContain("%2C")
    expect(q).toContain(".")
  })
})
