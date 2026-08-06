// ==============================================
// EXPORT TESTS
// The export panel is the product, so these check
// the output is valid, complete, and honest about
// what it lost.
// ==============================================
import { describe, it, expect } from "vitest"
import { DEFAULT_STATE, resolveDurations, resolveSemantics, PURPOSES } from "./tokens.js"
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

const ALL_BEZIER = {
  ...DEFAULT_STATE,
  easings: {
    ...DEFAULT_STATE.easings,
    emphasized: { kind: "bezier" as const, bezier: { x1: 0.2, y1: 0, x2: 0, y2: 1 } },
  },
}

describe("CSS", () => {
  const css = toCss(DEFAULT_STATE)

  it("emits every duration, easing, semantic and purpose", () => {
    for (const n of Object.keys(resolveDurations(DEFAULT_STATE))) {
      expect(css).toContain(`--duration-${n}:`)
    }
    for (const t of resolveSemantics(DEFAULT_STATE)) {
      expect(css).toContain(`--motion-${t.id.replace(".", "-")}:`)
    }
    for (const p of PURPOSES) expect(css).toContain(`--motion-${p.id}-enter:`)
  })

  it("aliases purposes rather than copying values", () => {
    for (const p of PURPOSES) {
      expect(css).toContain(`--motion-${p.id}-enter: var(--motion-${p.aliasOf}-enter);`)
    }
  })

  it("always ships reduced motion, covering springs too", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    // Spring shorthands bake in their duration, so overriding only the duration
    // variables would leave them animating.
    for (const t of resolveSemantics(DEFAULT_STATE)) {
      expect(css).toContain(`--motion-${t.id.replace(".", "-")}: 1ms linear;`)
    }
  })

  it("renders springs as linear() and beziers as cubic-bezier()", () => {
    expect(css).toMatch(/--ease-emphasized: linear\(/)
    expect(css).toMatch(/--ease-standard: cubic-bezier\(/)
  })

  it("balances its parentheses", () => {
    expect((css.match(/\(/g) ?? []).length).toBe((css.match(/\)/g) ?? []).length)
  })
})

describe("Tailwind", () => {
  it("emits a theme block with the ease namespace", () => {
    const tw = toTailwind(DEFAULT_STATE)
    expect(tw.startsWith("@theme {")).toBe(true)
    expect(tw).toContain("--ease-standard:")
    expect(tw).toContain("--duration-base:")
  })
})

describe("Framer Motion", () => {
  const js = toFramer(DEFAULT_STATE)

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
    for (const p of PURPOSES) expect(js).toContain(`${p.id}: motion.${p.aliasOf},`)
  })

  it("says how reduced motion is handled in this runtime", () => {
    expect(js).toContain("MotionConfig")
  })
})

describe("DTCG", () => {
  const json = JSON.parse(toDtcg(DEFAULT_STATE))

  it("uses the types the spec actually defines", () => {
    expect(json.duration.base.$type).toBe("duration")
    expect(json.duration.base.$value).toEqual({ value: 200, unit: "ms" })
    expect(json.easing.standard.$type).toBe("cubicBezier")
    expect(json.motion.standard.enter.$type).toBe("transition")
  })

  it("references rather than inlines", () => {
    expect(json.motion.standard.enter.$value.timingFunction).toBe("{easing.standard}")
    expect(json.motion.standard.enter.$value.duration).toMatch(/^\{duration\./)
    expect(json.purpose.drawer.enter.$value).toBe("{motion.emphasized.enter}")
  })

  it("carries a spring in an extension and says why", () => {
    const spring = json.easing.emphasized
    expect(spring.$extensions["studio.motion.spring"].stiffness).toBe(210)
    expect(spring.$extensions["studio.motion.linear"]).toMatch(/^linear\(/)
    expect(spring.$description).toMatch(/no spring type/)
  })
})

describe("fidelity is reported only when there is something to report", () => {
  it("CSS is silent when every easing is a bezier", () => {
    expect(cssFidelity(ALL_BEZIER)).toBeUndefined()
    expect(dtcgFidelity(ALL_BEZIER)).toBeUndefined()
  })

  it("CSS reports the measured cost when a spring is present", () => {
    const f = cssFidelity(DEFAULT_STATE)
    expect(f).toBeDefined()
    expect(f!.summary).toMatch(/linear\(\) approximation · max error \d+ms/)
    expect(f!.detail).toMatch(/Framer Motion runs the real physics/)
  })

  it("Tailwind always mentions the duration namespace gap", () => {
    expect(tailwindFidelity(ALL_BEZIER)!.detail).toMatch(/no equivalent namespace/)
  })
})

describe("agent markdown", () => {
  const md = toAgentMarkdown(DEFAULT_STATE, "https://example.test/?d=200.140.10")

  it("carries the values", () => {
    expect(md).toContain("`base` — 200ms")
    expect(md).toContain("(pinned, not on the curve)")
    for (const t of resolveSemantics(DEFAULT_STATE)) expect(md).toContain(`motion.${t.id}`)
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

  it("the prompt points at the URL rather than inlining everything", () => {
    const p = agentPrompt("https://example.test/?d=1")
    expect(p).toContain("https://example.test/?d=1")
    expect(p.length).toBeLessThan(1200)
    expect(p).toMatch(/Exits must stay faster/)
  })
})
