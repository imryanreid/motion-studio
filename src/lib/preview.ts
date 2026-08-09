// ==============================================
// PREVIEW TIMELINE
// The maths behind the preview, kept out of the
// component so it can be proven without a browser.
//
// Components render; lib decides. That split matters
// more than usual here: a preview is exactly the kind
// of thing that looks fine in a screenshot while
// being subtly wrong, and a screenshot can't tell you
// that a curve is being evaluated past its duration
// or that a stagger offset is off by one.
// ==============================================
import {
  easingProgress,
  entryById,
  staggerDelay,
  type MotionState,
  type SemanticToken,
} from "./tokens.js"

/**
 * Beats of stillness around the motion.
 *
 * The tail stops a loop reading as a stutter. The lead matters more and was
 * missing: without a moment at rest before it moves, there is no "before" to
 * compare the motion against — the loop restarts and something is already
 * travelling.
 *
 * `DWELL_MS` is how long the thing stays on screen in "both" mode, between the
 * entrance and the exit.
 *
 * None of these are tokens. They are about watching, not about the system, so
 * they never reach the URL or an export.
 */
/**
 * How many rows the list scenario shows.
 *
 * Lives here rather than in the component because the stagger control reports
 * the delays this many children would get, and the two have to agree — the
 * readout is only useful if it describes the list you're watching.
 */
export const LIST_ITEMS = 5

export const LEAD_MS = 250
export const DWELL_MS = 700
export const HOLD_MS = 350

/**
 * Pauses hold their real-world length whatever the playback rate.
 *
 * Elapsed time is measured in animation-milliseconds, which run slower than
 * real ones at ½× and ¼×. Scaling the pauses along with the motion would turn a
 * 350ms hold into 1.4 seconds of dead air at ¼× — precisely when you are trying
 * to watch something over and over. Multiplying by the rate cancels that out.
 */
const pauses = (rate: number) => ({
  lead: LEAD_MS * rate,
  dwell: DWELL_MS * rate,
  tail: HOLD_MS * rate,
})

/**
 * How long the whole timeline runs.
 *
 * Only the staggered scenario reaches past the token's own duration — its last
 * child hasn't started when the first has finished.
 */
export function timelineTotal(
  state: MotionState,
  token: SemanticToken,
  childCount: number,
  rate = 1,
): number {
  const { lead, tail } = pauses(rate)
  return lead + phaseSpan(state, token, childCount) + tail
}

/**
 * The stagger belonging to the motion this token came from.
 *
 * Per-motion now, so the list scenario spaces its rows by whatever the `list`
 * purpose actually points at rather than by one number for the whole set.
 */
function staggerFor(state: MotionState, token: SemanticToken, index: number): number {
  const entry = entryById(state, token.entryId)
  return entry ? staggerDelay(entry, index) : 0
}

/** How long one direction takes, including the last staggered child. */
function phaseSpan(state: MotionState, token: SemanticToken, childCount: number): number {
  const lastChildDelay = childCount > 1 ? staggerFor(state, token, childCount - 1) : 0
  return token.durationMs + lastChildDelay
}

/**
 * Enter, then a beat, then exit — the whole life of the element.
 *
 * Worth its own mode rather than a convenience: the rule this tool teaches is
 * that exits are faster and flatter, and toggling between two directions makes
 * you compare from memory, which is exactly what a preview is supposed to
 * replace.
 */
export function sequenceTotal(
  state: MotionState,
  enter: SemanticToken,
  exit: SemanticToken,
  childCount: number,
  rate = 1,
): number {
  const { lead, dwell, tail } = pauses(rate)
  return (
    lead +
    phaseSpan(state, enter, childCount) +
    dwell +
    phaseSpan(state, exit, childCount) +
    tail
  )
}

/** Progress through an enter → dwell → exit sequence. */
export function sequenceProgress(
  state: MotionState,
  enter: SemanticToken,
  exit: SemanticToken,
  elapsedMs: number,
  index = 0,
  staggered = false,
  rate = 1,
  childCount = 1,
): number {
  const { lead, dwell } = pauses(rate)
  const enterSpan = phaseSpan(state, enter, childCount)

  const afterLead = elapsedMs - lead
  if (afterLead <= 0) return 0
  if (afterLead < enterSpan) return childProgress(state, enter, afterLead, index, staggered)

  const afterEnter = afterLead - enterSpan
  if (afterEnter < dwell) return 1

  return childProgress(state, exit, afterEnter - dwell, index, staggered)
}

/**
 * Progress for one child at a moment in the timeline.
 *
 * Clamped at both ends: before its delay a child hasn't started, and after its
 * duration it holds rather than continuing to evaluate the curve — a spring
 * queried past its settling time keeps oscillating microscopically, which would
 * show up as a shimmer that no runtime would actually play.
 */
export function childProgress(
  state: MotionState,
  token: SemanticToken,
  elapsedMs: number,
  index = 0,
  staggered = false,
): number {
  const delay = staggered ? staggerFor(state, token, index) : 0
  const local = elapsedMs - delay
  if (local <= 0) return token.direction === "exit" ? 1 : 0

  const raw =
    local >= token.durationMs ? 1 : easingProgress(token.easing, local, token.durationMs)

  return token.direction === "exit" ? 1 - raw : raw
}

/**
 * One frame of the clock.
 *
 * Pure, because the bug it replaces was invisible in review and invisible in a
 * screenshot: the loop reset `elapsed` to 0 without moving the clock origin, so
 * the very next frame was still past `total` and it pinned at 0 forever. The
 * preview played exactly once and then froze, which reads as "looping is off"
 * rather than as a defect.
 *
 * Returns the new origin as well as the new elapsed, so wrapping is expressible
 * — that is the whole point.
 */
export function tick(
  nowMs: number,
  originMs: number,
  rate: number,
  totalMs: number,
  loop: boolean,
): { elapsedMs: number; originMs: number; playing: boolean } {
  const raw = (nowMs - originMs) * rate
  if (raw < totalMs) return { elapsedMs: raw, originMs, playing: true }
  if (!loop) return { elapsedMs: totalMs, originMs, playing: false }
  return { elapsedMs: 0, originMs: nowMs, playing: true }
}
