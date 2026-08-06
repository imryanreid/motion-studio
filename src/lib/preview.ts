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
import { easingProgress, staggerDelay, type MotionState, type SemanticToken } from "./tokens.js"

/** A beat of stillness at the end so a loop doesn't read as a stutter. */
export const HOLD_MS = 350

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
): number {
  const lastChildDelay = childCount > 1 ? staggerDelay(state, childCount - 1) : 0
  return token.durationMs + lastChildDelay + HOLD_MS
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
  const delay = staggered ? staggerDelay(state, index) : 0
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
