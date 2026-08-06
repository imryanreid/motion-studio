import { describe, it, expect } from "vitest"
import { DEFAULT_STATE, resolveSemantics } from "./tokens.js"
import { childProgress, timelineTotal, HOLD_MS } from "./preview.js"

const tokens = resolveSemantics(DEFAULT_STATE)
const enter = tokens.find((t) => t.id === "standard.enter")!
const exit = tokens.find((t) => t.id === "standard.exit")!
const spring = tokens.find((t) => t.id === "emphasized.enter")!

describe("childProgress", () => {
  it("runs 0 → 1 across an entrance", () => {
    expect(childProgress(DEFAULT_STATE, enter, 0)).toBe(0)
    expect(childProgress(DEFAULT_STATE, enter, enter.durationMs)).toBe(1)
    const mid = childProgress(DEFAULT_STATE, enter, enter.durationMs / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it("runs 1 → 0 across an exit", () => {
    expect(childProgress(DEFAULT_STATE, exit, 0)).toBe(1)
    expect(childProgress(DEFAULT_STATE, exit, exit.durationMs)).toBe(0)
  })

  it("holds instead of evaluating past the duration", () => {
    // A spring queried past its settling time keeps oscillating microscopically.
    // No runtime plays that, so neither does the preview.
    expect(childProgress(DEFAULT_STATE, spring, spring.durationMs * 3)).toBe(1)
    expect(childProgress(DEFAULT_STATE, enter, enter.durationMs * 10)).toBe(1)
  })

  it("staggers children and keeps them ordered", () => {
    const t = 120
    const values = [0, 1, 2, 3, 4].map((i) => childProgress(DEFAULT_STATE, enter, t, i, true))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1])
    }
    expect(values[0]).toBeGreaterThan(0)
  })

  it("a staggered child hasn't started before its delay", () => {
    const late = childProgress(DEFAULT_STATE, enter, 10, 4, true)
    expect(late).toBe(0)
  })

  it("ignores stagger when the scenario isn't staggered", () => {
    const a = childProgress(DEFAULT_STATE, enter, 100, 0, false)
    const b = childProgress(DEFAULT_STATE, enter, 100, 4, false)
    expect(a).toBe(b)
  })

  it("never leaves [0,1] for a bezier without overshoot", () => {
    for (let ms = 0; ms <= enter.durationMs; ms += 5) {
      const p = childProgress(DEFAULT_STATE, enter, ms)
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })

  it("lets a spring overshoot, because that's the point", () => {
    const peak = Math.max(
      ...Array.from({ length: 200 }, (_, i) =>
        childProgress(DEFAULT_STATE, spring, (i / 200) * spring.durationMs),
      ),
    )
    expect(peak).toBeGreaterThan(1)
  })
})

describe("timelineTotal", () => {
  it("covers the token plus a hold", () => {
    expect(timelineTotal(DEFAULT_STATE, enter, 1)).toBe(enter.durationMs + HOLD_MS)
  })

  it("extends far enough for the last staggered child to finish", () => {
    const total = timelineTotal(DEFAULT_STATE, enter, 5)
    expect(childProgress(DEFAULT_STATE, enter, total - HOLD_MS, 4, true)).toBe(1)
  })
})
