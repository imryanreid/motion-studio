import { describe, it, expect } from "vitest"
import { DEFAULT_STATE, resolveSemantics } from "./tokens.js"
import { childProgress, timelineTotal, tick, HOLD_MS } from "./preview.js"

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

describe("tick — the clock, and the loop that used to freeze", () => {
  it("advances while inside the timeline", () => {
    const r = tick(1500, 1000, 1, 1000, true)
    expect(r.elapsedMs).toBe(500)
    expect(r.originMs).toBe(1000)
    expect(r.playing).toBe(true)
  })

  it("moves the origin when it wraps", () => {
    // The bug: elapsed reset to 0 but the origin stayed, so the next frame was
    // still past total and it pinned at 0 forever — played once, then froze.
    const wrapped = tick(2100, 1000, 1, 1000, true)
    expect(wrapped.elapsedMs).toBe(0)
    expect(wrapped.originMs).toBe(2100)

    // The frame after a wrap must make progress. With the old code it did not.
    const next = tick(2116, wrapped.originMs, 1, 1000, true)
    expect(next.elapsedMs).toBeGreaterThan(0)
  })

  it("keeps looping over many cycles", () => {
    let origin = 0
    let seen = 0
    for (let now = 0; now <= 5000; now += 16) {
      const r = tick(now, origin, 1, 1000, true)
      origin = r.originMs
      if (r.elapsedMs > 500) seen++
    }
    // Roughly five laps' worth of late-timeline frames, not one.
    expect(seen).toBeGreaterThan(100)
  })

  it("stops at the end when looping is off", () => {
    const r = tick(3000, 1000, 1, 1000, false)
    expect(r.elapsedMs).toBe(1000)
    expect(r.playing).toBe(false)
  })

  it("honours the playback rate", () => {
    expect(tick(1400, 1000, 0.25, 1000, true).elapsedMs).toBe(100)
  })
})
