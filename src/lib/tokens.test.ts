// ==============================================
// TOKEN MODEL + URL TESTS
// The rules the tool teaches have to actually hold:
// exits faster and flatter, a derivation that means
// what its name says for both curve types, and a link
// that round-trips or degrades rather than breaking.
// ==============================================
import { describe, it, expect } from "vitest"
import {
  DEFAULT_STATE,
  ENTRY_LIMIT,
  PURPOSE_IDS,
  STEP,
  criticalDamping,
  deriveExit,
  enterMs,
  entryForPurpose,
  exitMs,
  faster,
  generateSet,
  mirrorBezier,
  nextId,
  purposesUsing,
  resolveSemantics,
  sanitizeName,
  sharper,
  slower,
  slugs,
  softer,
  staggerDelay,
  type MotionEntry,
  type MotionState,
} from "./tokens.js"
import { encodeState, decodeState, resolveState, isDefaultState } from "./params.js"
import { derive, settlingTime } from "./spring.js"
import { bezierValue } from "./bezier.js"

const entry = (over: Partial<MotionEntry> = {}): MotionEntry => ({
  id: "x1",
  name: "test",
  easing: { kind: "bezier", bezier: { x1: 0.2, y1: 0, x2: 0, y2: 1 } },
  durationMs: 200,
  exitRatio: 0.7,
  ...over,
})

const springEntry = (stiffness = 210, damping = 20, mass = 1) =>
  entry({ easing: { kind: "spring", spring: { stiffness, damping, mass, velocity: 0 } } })

const springOf = (e: MotionEntry) => {
  if (e.easing.kind !== "spring") throw new Error("not a spring")
  return e.easing.spring
}

describe("the shipped set", () => {
  it("is three beziers, purely generated from the primary", () => {
    // The default used to be mixed — two beziers and a spring — which promised
    // that Generate hands you a spring when it does not. A default the tool
    // cannot reproduce with its own button is a default it can't make.
    expect(DEFAULT_STATE.entries).toHaveLength(3)
    for (const e of DEFAULT_STATE.entries) expect(e.easing.kind).toBe("bezier")

    const primary = DEFAULT_STATE.entries.find((e) => e.id === DEFAULT_STATE.primaryId)!
    expect(generateSet(primary)).toEqual(DEFAULT_STATE.entries)
  })

  it("lands on the same durations the old five-step scale produced", () => {
    expect(DEFAULT_STATE.entries.map((e) => e.durationMs)).toEqual([140, 200, 280])
  })

  it("siblings inherit the primary's type", () => {
    for (const e of generateSet(springEntry())) expect(e.easing.kind).toBe("spring")
  })

  it("agrees with pressing Faster and Slower by hand", () => {
    // If Generate secretly did more than the menu items do, the button and the
    // menu would disagree about what "faster" means.
    const primary = { ...entry(), id: "std", name: "standard" }
    const [sub, std, emp] = generateSet(primary)
    expect(std.durationMs).toBe(primary.durationMs)
    expect(sub.durationMs).toBe(faster(primary).durationMs)
    expect(emp.durationMs).toBe(slower(primary).durationMs)
    // Curve untouched in every direction.
    for (const e of [sub, std, emp]) expect(e.easing).toEqual(primary.easing)
  })
})

describe("derivations are one-time seeds, and type-aware", () => {
  it("a bezier gets faster by shortening, on a 10ms grid", () => {
    expect(faster(entry({ durationMs: 200 })).durationMs).toBe(140)
    expect(slower(entry({ durationMs: 200 })).durationMs).toBe(280)
  })

  it("a spring gets faster by frequency, holding the damping ratio", () => {
    // This is the whole reason a named transform beats a multiplier: a
    // multiplier on a settling threshold is meaningless, but scaling ω₀ = √(k/m)
    // while holding ζ = c / (2√(km)) is exactly "the same spring, quicker".
    const s = springEntry(210, 20)
    const before = derive({ stiffness: 210, damping: 20, mass: 1, velocity: 0 })
    for (const t of [faster, slower]) {
      const out = t(s)
      if (out.easing.kind !== "spring") throw new Error("unreachable")
      expect(derive(out.easing.spring).dampingRatio).toBeCloseTo(before.dampingRatio, 2)
    }
  })

  it("a faster spring actually settles sooner", () => {
    const s = springEntry(210, 20)
    // Measured on the closed form, not on the number the tool reports.
    // `motionSettlingTime` delegates to Motion's calcGeneratorDuration, which
    // walks coarsely and rounds to a 50ms grid — it answers 600ms for BOTH
    // 210/20 and 412/28 even though the physics differ by a factor of 1.4
    // (583ms vs 419ms). The transform is right; the reporter is blunt.
    expect(settlingTime(springOf(faster(s)))).toBeLessThan(settlingTime(springOf(s)))
    expect(settlingTime(springOf(slower(s)))).toBeGreaterThan(settlingTime(springOf(s)))
    // Whatever the reporter's resolution, it must never move the wrong way.
    expect(enterMs(faster(s))).toBeLessThanOrEqual(enterMs(s))
    expect(enterMs(slower(s))).toBeGreaterThanOrEqual(enterMs(s))
  })

  it("faster scales the spring's frequency by one step", () => {
    const out = faster(springEntry(210, 20))
    if (out.easing.kind !== "spring") throw new Error("unreachable")
    // ω₀ ∝ √k, so one step of frequency is STEP² of stiffness.
    expect(out.easing.spring.stiffness).toBe(Math.round(210 * STEP * STEP))
    expect(out.easing.spring.damping).toBeCloseTo(20 * STEP, 2)
  })

  it("softer damps a spring and sharper springs it up", () => {
    const s = springEntry(400, 12)
    const calm = softer(s)
    const lively = sharper(s)
    if (calm.easing.kind !== "spring" || lively.easing.kind !== "spring") {
      throw new Error("unreachable")
    }
    expect(derive(calm.easing.spring).dampingRatio).toBeGreaterThan(
      derive(lively.easing.spring).dampingRatio,
    )
  })

  it("softer flattens a bezier and sharper steepens it", () => {
    const b = entry()
    const soft = softer(b)
    const sharp = sharper(b)
    if (soft.easing.kind !== "bezier" || sharp.easing.kind !== "bezier") {
      throw new Error("unreachable")
    }
    // A quarter of the way in, the sharper curve is further along.
    expect(bezierValue(sharp.easing.bezier, 0.25)).toBeGreaterThan(
      bezierValue(soft.easing.bezier, 0.25),
    )
  })

  it("never produces a duration below the grid", () => {
    let e = entry({ durationMs: 30 })
    for (let i = 0; i < 12; i++) e = faster(e)
    expect(e.durationMs).toBeGreaterThanOrEqual(1)
  })
})

describe("exits are faster and flatter — the one live relationship", () => {
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
    const bouncy = springEntry(400, 12)
    if (bouncy.easing.kind !== "spring") throw new Error("unreachable")
    expect(derive(bouncy.easing.spring).regime).toBe("underdamped")
    const exit = deriveExit(bouncy.easing)
    if (exit.kind !== "spring") throw new Error("unreachable")
    expect(derive(exit.spring).dampingRatio).toBeGreaterThanOrEqual(1 - 1e-9)
    expect(exit.spring.damping).toBeCloseTo(criticalDamping(bouncy.easing.spring), 6)
  })

  it("an already-calm spring is left alone", () => {
    const calm = springEntry(100, 40)
    if (calm.easing.kind !== "spring") throw new Error("unreachable")
    const exit = deriveExit(calm.easing)
    if (exit.kind !== "spring") throw new Error("unreachable")
    expect(exit.spring.damping).toBe(40)
  })

  it("a bezier exit is its own share of its own entrance", () => {
    // Per-entry now: changing one motion's exit leaves the others alone.
    const a = entry({ id: "a", durationMs: 200, exitRatio: 0.5 })
    const b = entry({ id: "b", durationMs: 200, exitRatio: 0.9 })
    expect(exitMs(a)).toBe(100)
    expect(exitMs(b)).toBe(180)
  })

  it("holds across the shipped set", () => {
    for (const e of DEFAULT_STATE.entries) expect(exitMs(e)).toBeLessThan(enterMs(e))
  })
})

describe("names, slugs and ids", () => {
  it("keeps only what can survive a URL and a CSS property", () => {
    expect(sanitizeName("Snappy!! <script>")).toBe("Snappy script")
    expect(sanitizeName("a".repeat(80))).toHaveLength(24)
    expect(sanitizeName("with~tilde.and.dots")).toBe("withtildeanddots")
  })

  it("deduplicates slugs, because two custom properties can't share a key", () => {
    const s = slugs([entry({ id: "a", name: "Snappy" }), entry({ id: "b", name: "snappy" })])
    expect(s).toEqual({ a: "snappy", b: "snappy-2" })
  })

  it("falls back rather than emitting an empty property name", () => {
    expect(slugs([entry({ id: "a", name: "   " })])).toEqual({ a: "motion" })
  })

  it("never hands out an id already in use", () => {
    const taken = [entry({ id: "e1" }), entry({ id: "e2" }), entry({ id: "e3" })]
    expect(taken.map((e) => e.id)).not.toContain(nextId(taken))
  })
})

describe("semantics and purposes", () => {
  it("emits two tokens per motion, named by slug", () => {
    expect(resolveSemantics(DEFAULT_STATE).map((t) => t.id)).toEqual([
      "subtle.enter",
      "subtle.exit",
      "standard.enter",
      "standard.exit",
      "emphasized.enter",
      "emphasized.exit",
    ])
  })

  it("renaming a motion renames its tokens", () => {
    const renamed = {
      ...DEFAULT_STATE,
      entries: DEFAULT_STATE.entries.map((e) =>
        e.id === "sub" ? { ...e, name: "Whisper" } : e,
      ),
    }
    const ids = resolveSemantics(renamed).map((t) => t.id)
    expect(ids).toContain("whisper.enter")
    expect(ids).not.toContain("subtle.enter")
  })

  it("every purpose resolves to a real entry", () => {
    const ids = DEFAULT_STATE.entries.map((e) => e.id)
    for (const p of PURPOSE_IDS) expect(ids).toContain(entryForPurpose(DEFAULT_STATE, p).id)
  })

  it("a purpose pointing at a deleted entry falls back to the primary", () => {
    const orphaned: MotionState = {
      ...DEFAULT_STATE,
      purposeEntry: { ...DEFAULT_STATE.purposeEntry, modal: "gone" },
    }
    expect(entryForPurpose(orphaned, "modal").id).toBe(orphaned.primaryId)
  })

  it("reports which purposes use a motion", () => {
    expect(purposesUsing(DEFAULT_STATE, "emp")).toEqual(["drawer", "modal", "toast"])
  })

  it("a spring's duration comes from its settling time, not a field", () => {
    const s = springEntry()
    // The durationMs field is carried but never consulted for a spring.
    expect(enterMs({ ...s, durationMs: 9999 })).toBe(enterMs({ ...s, durationMs: 20 }))
    expect(enterMs(s)).toBeGreaterThan(0)
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
  const withEntries = (entries: MotionEntry[], over: Partial<MotionState> = {}): MotionState => ({
    ...DEFAULT_STATE,
    entries,
    primaryId: entries[0].id,
    purposeEntry: Object.fromEntries(PURPOSE_IDS.map((p) => [p, entries[0].id])) as MotionState["purposeEntry"],
    ...over,
  })

  const VARIANTS: { name: string; s: MotionState }[] = [
    { name: "defaults", s: DEFAULT_STATE },
    { name: "one motion", s: withEntries([entry({ id: "a", name: "only" })]) },
    {
      name: "renamed",
      s: withEntries([entry({ id: "a", name: "Snappy Thing" }), entry({ id: "b", name: "Calm" })]),
    },
    {
      name: "mixed types",
      s: withEntries([
        entry({ id: "a", name: "curve" }),
        { ...springEntry(300, 30), id: "b", name: "bouncy" },
        entry({ id: "c", name: "other", durationMs: 640, exitRatio: 0.45 }),
      ]),
    },
    { name: "tuned stagger", s: { ...DEFAULT_STATE, staggerMs: 25, staggerDecay: 0.7 } },
    { name: "tight tolerance", s: { ...DEFAULT_STATE, tolerance: 0.002 } },
    {
      name: "repointed purposes",
      s: {
        ...DEFAULT_STATE,
        purposeEntry: { ...DEFAULT_STATE.purposeEntry, modal: "sub", list: "emp" },
      },
    },
  ]

  it.each(VARIANTS)("$name round-trips", ({ s }) => {
    expect(resolveState(encodeState(s))).toEqual(s)
  })

  it("round-trips entries for real, not via the default fallback", () => {
    // resolveState substitutes defaults for anything it can't decode, so a
    // defaults-only round-trip can pass while encoding is completely broken —
    // which is exactly what happened once: the kind label was being rounded to
    // NaN. Decode directly, where there is no fallback to hide behind.
    for (const { s } of VARIANTS) {
      const decoded = decodeState(encodeState(s))
      expect(decoded.entries).toBeDefined()
      expect(decoded.entries).toEqual(s.entries)
    }
  })

  it("carries a name through the query string intact", () => {
    const s = withEntries([entry({ id: "a", name: "Snappy Thing" })])
    expect(resolveState(encodeState(s)).entries[0].name).toBe("Snappy Thing")
  })

  it("keeps the default link clean", () => {
    expect(isDefaultState(DEFAULT_STATE)).toBe(true)
    expect(
      isDefaultState({
        ...DEFAULT_STATE,
        entries: DEFAULT_STATE.entries.map((e) => ({ ...e, durationMs: e.durationMs + 1 })),
      }),
    ).toBe(false)
    const q = encodeState(DEFAULT_STATE)
    expect(q).not.toContain("sg=")
    expect(q).not.toContain("tol=")
  })

  it("degrades a malformed link to defaults instead of erroring", () => {
    expect(resolveState("e=nonsense&p=&pu=&sg=&tol=-4")).toEqual(DEFAULT_STATE)
    expect(resolveState("")).toEqual(DEFAULT_STATE)
  })

  it("drops a bad entry and keeps the good ones", () => {
    const good = encodeState(withEntries([entry({ id: "a", name: "keep" })]))
    const decoded = decodeState(`${good}&e=broken**zzz`)
    expect(decoded.entries).toHaveLength(1)
    expect(decoded.entries![0].name).toBe("keep")
  })

  it("refuses duplicate ids, which would make purposes ambiguous", () => {
    const s = withEntries([entry({ id: "a", name: "one" })])
    const decoded = decodeState(`${encodeState(s)}&e=a*two*b.20.0.0.100*300*70`)
    expect(decoded.entries).toHaveLength(1)
  })

  it("caps how many entries a link can carry", () => {
    const many = Array.from({ length: ENTRY_LIMIT + 6 }, (_, i) =>
      entry({ id: `e${i}`, name: `m${i}` }),
    )
    const decoded = decodeState(encodeState(withEntries(many)))
    expect(decoded.entries).toHaveLength(ENTRY_LIMIT)
  })

  it("repoints a purpose whose entry didn't survive the link", () => {
    const s = withEntries([entry({ id: "a", name: "one" })])
    const decoded = decodeState(`${encodeState(s)}`.replace("pu=a", "pu=zz"))
    for (const p of PURPOSE_IDS) expect(decoded.purposeEntry![p]).toBe("a")
  })

  it("rejects a spring that could never settle", () => {
    expect(decodeState("e=a*x*s.0.0.100.0").entries).toBeUndefined()
    expect(decodeState("e=a*x*s.210.20.0.0").entries).toBeUndefined()
  })

  it("uses dots and asterisks — every other separator gets percent-encoded", () => {
    const q = encodeState(DEFAULT_STATE)
    expect(q).not.toContain("%2C")
    expect(q).toContain("*")
    expect(q).not.toContain("%7E")
  })
})
