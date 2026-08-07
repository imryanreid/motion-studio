import { describe, it, expect } from "vitest"
import { DEFAULT_STATE, resolveSemantics } from "./tokens.js"
import {
  childProgress,
  timelineTotal,
  sequenceTotal,
  sequenceProgress,
  tick,
  LEAD_MS,
  DWELL_MS,
  HOLD_MS,
} from "./preview.js"

const tokens = resolveSemantics(DEFAULT_STATE)
const enter = tokens.find((t) => t.id === "standard.enter")!
const exit = tokens.find((t) => t.id === "standard.exit")!

// The shipped set is all beziers now, so a spring has to be asked for rather
// than borrowed from the defaults — which is the right way round: a fixture
// for the hard case should say that's what it is.
const spring = resolveSemantics({
  ...DEFAULT_STATE,
  entries: DEFAULT_STATE.entries.map((e) =>
    e.id === "emp"
      ? {
          ...e,
          easing: {
            kind: "spring" as const,
            spring: { stiffness: 400, damping: 12, mass: 1, velocity: 0 },
          },
        }
      : e,
  ),
}).find((t) => t.id === "emphasized.enter")!

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
  it("covers a lead, the token, and a tail", () => {
    expect(timelineTotal(DEFAULT_STATE, enter, 1)).toBe(LEAD_MS + enter.durationMs + HOLD_MS)
  })

  it("pauses keep their real length as playback slows", () => {
    // At ¼× a 350ms hold would otherwise stretch to 1.4s of dead air, exactly
    // when you're trying to watch something repeatedly.
    const full = timelineTotal(DEFAULT_STATE, enter, 1, 1)
    const quarter = timelineTotal(DEFAULT_STATE, enter, 1, 0.25)
    const pauseAtFull = full - enter.durationMs
    const pauseAtQuarter = quarter - enter.durationMs
    expect(pauseAtQuarter).toBeCloseTo(pauseAtFull * 0.25, 6)
    // In real time both are the same wait: animation-ms divided by rate.
    expect(pauseAtQuarter / 0.25).toBeCloseTo(pauseAtFull, 6)
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

describe("sequenceProgress — enter, dwell, exit", () => {
  it("starts hidden through the lead-in", () => {
    // The point of the lead: you need to see the rest state to have anything to
    // compare the motion against.
    expect(sequenceProgress(DEFAULT_STATE, enter, exit, 0)).toBe(0)
    expect(sequenceProgress(DEFAULT_STATE, enter, exit, LEAD_MS - 1)).toBe(0)
  })

  it("arrives, holds, then leaves", () => {
    const arrival = LEAD_MS + enter.durationMs
    expect(sequenceProgress(DEFAULT_STATE, enter, exit, arrival)).toBe(1)
    expect(sequenceProgress(DEFAULT_STATE, enter, exit, arrival + DWELL_MS / 2)).toBe(1)
    // Just after the dwell it has started to go.
    const leaving = arrival + DWELL_MS + exit.durationMs / 2
    const v = sequenceProgress(DEFAULT_STATE, enter, exit, leaving)
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(1)
  })

  it("ends gone", () => {
    const end = LEAD_MS + enter.durationMs + DWELL_MS + exit.durationMs
    expect(sequenceProgress(DEFAULT_STATE, enter, exit, end)).toBe(0)
  })

  it("spends less time leaving than arriving — the rule the tool teaches", () => {
    // Measurable rather than felt: the exit phase is shorter than the entrance.
    expect(exit.durationMs).toBeLessThan(enter.durationMs)
    const total = sequenceTotal(DEFAULT_STATE, enter, exit, 1)
    expect(total).toBe(LEAD_MS + enter.durationMs + DWELL_MS + exit.durationMs + HOLD_MS)
  })

  it("covers every staggered child before it ends", () => {
    const total = sequenceTotal(DEFAULT_STATE, enter, exit, 5)
    const lastFrame = total - HOLD_MS
    expect(sequenceProgress(DEFAULT_STATE, enter, exit, lastFrame, 4, true, 1, 5)).toBe(0)
  })
})
