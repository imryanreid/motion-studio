// ==============================================
// EXPORT TESTS
// The export panel is the product, so these check
// the output is valid, complete, and honest about
// what it lost.
// ==============================================
import { describe, it, expect } from "vitest"
import {
  DEFAULT_STATE,
  PURPOSE_IDS,
  entryForPurpose,
  resolveSemantics,
  slugs,
  tokenKey,
  type MotionState,
} from "./tokens.js"
import { encodeState, resolveState } from "./params.js"
import {
  toCss,
  toTailwind,
  toFramer,
  toDtcg,
  toAgentMarkdown,
  agentPrompt,
  cssFidelity,
  dtcgFidelity,
  tailwindFidelity,
} from "./export.js"

/**
 * The shipped set is all beziers now, so a spring has to be asked for.
 *
 * That's the right way round: the honesty machinery should be exercised by a
 * fixture that deliberately contains the hard case, not by whatever happened
 * to be in the defaults. The previous version of this file tested a "no
 * springs" path by removing one from the defaults, which meant the default
 * fixture silently carried the interesting case.
 */
const WITH_SPRING: MotionState = {
  ...DEFAULT_STATE,
  entries: DEFAULT_STATE.entries.map((e) =>
    e.id === "emp"
      ? {
          ...e,
          easing: {
            kind: "spring" as const,
            spring: { stiffness: 210, damping: 20, mass: 1, velocity: 0 },
          },
        }
      : e,
  ),
}

const alias = (s: MotionState, p: (typeof PURPOSE_IDS)[number]) =>
  slugs(s.entries)[entryForPurpose(s, p).id]

describe("CSS", () => {
  const css = toCss(WITH_SPRING)

  it("emits every duration, easing, motion and purpose", () => {
    for (const t of resolveSemantics(WITH_SPRING)) {
      expect(css).toContain(`--motion-${t.id.replace(".", "-")}:`)
      expect(css).toContain(`--ease-${t.id.replace(".", "-")}:`)
    }
    for (const p of PURPOSE_IDS) expect(css).toContain(`--motion-${p}-enter:`)
  })

  it("gives an exit its own duration token", () => {
    // Exits used to be mapped back onto the nearest step of a shared scale,
    // which was a lie whenever the nearest one wasn't the right one.
    expect(css).toContain("--duration-standard:")
    expect(css).toContain("--duration-standard-exit:")
  })

  it("aliases purposes rather than copying values", () => {
    for (const p of PURPOSE_IDS) {
      expect(css).toContain(
        `--motion-${p}-enter: var(--motion-${alias(WITH_SPRING, p)}-enter);`,
      )
    }
  })

  it("always ships reduced motion, covering springs too", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    // Spring shorthands bake in their duration, so overriding only the duration
    // variables would leave them animating.
    for (const t of resolveSemantics(WITH_SPRING)) {
      expect(css).toContain(`--motion-${t.id.replace(".", "-")}: 1ms linear;`)
    }
  })

  it("renders springs as linear() and beziers as cubic-bezier()", () => {
    expect(css).toMatch(/--ease-emphasized-enter: linear\(/)
    expect(css).toMatch(/--ease-standard-enter: cubic-bezier\(/)
  })

  it("balances its parentheses", () => {
    expect((css.match(/\(/g) ?? []).length).toBe((css.match(/\)/g) ?? []).length)
  })

  it("gives every motion its own stagger, and aliases it too", () => {
    // One global --stagger couldn't say whose children it was spacing.
    for (const e of WITH_SPRING.entries) {
      expect(css).toContain(
        `--motion-${slugs(WITH_SPRING.entries)[e.id]}-stagger: ${e.staggerMs}ms;`,
      )
    }
    expect(css).toContain("--motion-list-stagger: var(--motion-standard-stagger);")
    expect(css).not.toContain("--stagger:")
  })

  it("zeroes every stagger under reduced motion", () => {
    for (const e of WITH_SPRING.entries) {
      expect(css).toContain(`--motion-${slugs(WITH_SPRING.entries)[e.id]}-stagger: 0ms;`)
    }
  })

  it("uses the name you gave a motion", () => {
    const renamed: MotionState = {
      ...DEFAULT_STATE,
      entries: DEFAULT_STATE.entries.map((e) =>
        e.id === "std" ? { ...e, name: "Snappy Thing" } : e,
      ),
    }
    expect(toCss(renamed)).toContain("--motion-snappy-thing-enter:")
  })
})

describe("Tailwind", () => {
  it("emits a theme block with the ease namespace", () => {
    const tw = toTailwind(DEFAULT_STATE)
    expect(tw.startsWith("@theme {")).toBe(true)
    expect(tw).toContain("--ease-standard-enter:")
    expect(tw).toContain("--duration-standard:")
  })
})

describe("Framer Motion", () => {
  const js = toFramer(WITH_SPRING)

  it("uses seconds, not milliseconds", () => {
    // The silent 1000x error. 140ms must appear as 0.140.
    expect(js).toContain("duration: 0.140")
    expect(js).not.toMatch(/duration: \d{2,}/)
  })

  it("emits springs as real springs, not as approximations", () => {
    expect(js).toContain('type: "spring"')
    expect(js).toContain("stiffness: 210")
  })

  it("points purposes at the same objects", () => {
    for (const p of PURPOSE_IDS) expect(js).toContain(`${p}: motion.${alias(WITH_SPRING, p)},`)
  })

  it("quotes a slug that isn't a valid identifier", () => {
    const renamed: MotionState = {
      ...DEFAULT_STATE,
      entries: DEFAULT_STATE.entries.map((e) =>
        e.id === "std" ? { ...e, name: "Snappy Thing" } : e,
      ),
    }
    const out = toFramer(renamed)
    // "snappy-thing" would be a subtraction as a bare key or a dotted access.
    expect(out).toContain('"snappy-thing": {')
    expect(out).toContain('motion["snappy-thing"]')
    expect(out).not.toContain("motion.snappy-thing")
  })

  it("exports stagger per motion, in seconds", () => {
    expect(js).toContain("export const stagger = {")
    expect(js).toContain("standard: 0.040,")
  })

  it("says how reduced motion is handled in this runtime", () => {
    expect(js).toContain("MotionConfig")
  })
})

describe("DTCG", () => {
  const json = JSON.parse(toDtcg(WITH_SPRING))

  it("uses the types the spec actually defines", () => {
    expect(json.duration.standard.$type).toBe("duration")
    expect(json.duration.standard.$value).toEqual({ value: 200, unit: "ms" })
    expect(json.easing["standard-enter"].$type).toBe("cubicBezier")
    expect(json.motion.standard.enter.$type).toBe("transition")
  })

  it("references rather than inlines", () => {
    expect(json.motion.standard.enter.$value.timingFunction).toBe("{easing.standard-enter}")
    expect(json.motion.standard.enter.$value.duration).toBe("{duration.standard}")
    expect(json.motion.standard.exit.$value.duration).toBe("{duration.standard-exit}")
    expect(json.purpose.drawer.enter.$value).toBe("{motion.emphasized.enter}")
  })

  it("carries a spring in an extension and says why", () => {
    const spring = json.easing["emphasized-enter"]
    expect(spring.$extensions["studio.motion.spring"].stiffness).toBe(210)
    expect(spring.$extensions["studio.motion.linear"]).toMatch(/^linear\(/)
    expect(spring.$description).toMatch(/no spring type/)
  })
})

describe("fidelity is reported only when there is something to report", () => {
  it("CSS is silent when every easing is a bezier", () => {
    expect(cssFidelity(DEFAULT_STATE)).toBeUndefined()
    expect(dtcgFidelity(DEFAULT_STATE)).toBeUndefined()
  })

  it("CSS reports the measured cost when a spring is present", () => {
    const f = cssFidelity(WITH_SPRING)
    expect(f).toBeDefined()
    expect(f!.summary).toMatch(/linear\(\) approximation · max error \d+ms/)
    expect(f!.detail).toMatch(/Framer Motion runs the real physics/)
  })

  it("Tailwind always mentions the duration namespace gap", () => {
    expect(tailwindFidelity(DEFAULT_STATE)!.detail).toMatch(/no equivalent namespace/)
  })
})

describe("agent markdown", () => {
  const md = toAgentMarkdown(
    WITH_SPRING,
    "https://example.test/?e=std*standard*b.20.0.0.100*200*70",
  )

  it("carries every token", () => {
    for (const t of resolveSemantics(WITH_SPRING)) expect(md).toContain(`motion.${t.id}`)
    expect(md).toContain("3 motions")
  })

  it("states the rules as rules, not as values", () => {
    expect(md).toMatch(/Exits are faster and flatter/)
    expect(md).toMatch(/travel distance/)
    expect(md).toMatch(/reduced-motion/)
  })

  it("explains that a spring has no duration", () => {
    expect(md).toMatch(/settling threshold/)
  })

  it("ships the conversion maths for platforms we don't export", () => {
    // The whole reason dropping SwiftUI and Compose is safe.
    expect(md).toContain("response = 2π·√(m/k)")
    expect(md).toContain("dampingRatio = c / (2·√(k·m))")
    expect(md).toMatch(/normalising mass to 1 is lossless/)
  })

  it("includes the fidelity report unconditionally — agents don't click", () => {
    expect(md).toMatch(/What the CSS export costs/)
    expect(md).toMatch(/What the DTCG export costs/)
  })

  it("says nothing about fidelity when nothing was lost", () => {
    const clean = toAgentMarkdown(DEFAULT_STATE, "https://example.test/")
    expect(clean).not.toMatch(/What the CSS export costs/)
  })

  it("the prompt points at the URL rather than inlining everything", () => {
    const p = agentPrompt("https://example.test/?e=1")
    expect(p).toContain("https://example.test/?e=1")
    expect(p.length).toBeLessThan(1200)
    expect(p).toMatch(/Exits must stay faster/)
  })
})

// ==============================================
// EXCLUDED TOKENS
// The hazard is not the missing token — it's the alias left pointing at it.
// ==============================================
describe("excluding a token", () => {
  const held = (state: MotionState, ...keys: string[]): MotionState => ({
    ...state,
    excluded: keys,
  })

  it("keeps it out of every format", () => {
    const s = held(DEFAULT_STATE, tokenKey(DEFAULT_STATE.entries[0].id, "exit"))
    const slug = slugs(s.entries)[s.entries[0].id]
    for (const out of [
      toCss(s),
      toTailwind(s),
      toFramer(s),
      toDtcg(s),
      toAgentMarkdown(s, "https://x"),
    ]) {
      expect(out).not.toContain(`${slug}-exit`)
      expect(out).not.toContain(`${slug}.exit`)
    }
  })

  it("leaves the other direction alone", () => {
    const s = held(DEFAULT_STATE, tokenKey(DEFAULT_STATE.entries[0].id, "exit"))
    const slug = slugs(s.entries)[s.entries[0].id]
    expect(toCss(s)).toContain(`--motion-${slug}-enter`)
  })

  it("never emits an alias to something it didn't emit", () => {
    // Every var() on the right-hand side has to have been declared above it,
    // or the stylesheet resolves to nothing at runtime and says nothing about it.
    const s = held(DEFAULT_STATE, ...DEFAULT_STATE.entries.map((e) => tokenKey(e.id, "exit")))
    const css = toCss(s)
    const declared = new Set([...css.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]))
    for (const [, ref] of css.matchAll(/var\((--[\w-]+)\)/g)) {
      expect(declared.has(ref), `${ref} is referenced but never declared`).toBe(true)
    }
  })

  it("drops the alias key rather than dangling it in DTCG", () => {
    const s = held(DEFAULT_STATE, tokenKey(entryForPurpose(DEFAULT_STATE, "drawer").id, "exit"))
    const dtcg = JSON.parse(toDtcg(s)) as {
      purpose: Record<string, Record<string, unknown>>
    }
    expect(dtcg.purpose.drawer).not.toHaveProperty("exit")
    expect(dtcg.purpose.drawer).toHaveProperty("enter")
  })

  it("says what it held back rather than quietly shipping less", () => {
    const s = held(DEFAULT_STATE, tokenKey(DEFAULT_STATE.entries[0].id, "exit"))
    expect(toAgentMarkdown(s, "https://x")).toMatch(/1 token was deliberately excluded/)
  })

  it("survives a round trip through the URL", () => {
    const s = held(
      DEFAULT_STATE,
      tokenKey(DEFAULT_STATE.entries[0].id, "exit"),
      tokenKey(DEFAULT_STATE.entries[1].id, "enter"),
    )
    const back = resolveState(encodeState(s))
    expect(back.excluded.sort()).toEqual(s.excluded.sort())
  })

  it("forgets an exclusion whose entry is gone", () => {
    // Otherwise a deleted motion leaves a key that silently re-applies if an
    // id is ever reused.
    const p = new URLSearchParams(encodeState(DEFAULT_STATE))
    p.set("xt", "ghost*exit")
    expect(resolveState(p.toString()).excluded).toEqual([])
  })
})
