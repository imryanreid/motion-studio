// ==============================================
// CURVE PLOT
// The shape of an easing, drawn. Progress up, time
// across, with the 0 and 1 lines marked so overshoot
// is visible as the curve leaving the box rather than
// as a number.
//
// For a bezier the two control handles are draggable.
// A spring has no handles — its shape comes from
// physics, not from points you can grab — so it draws
// read-only and is edited through its parameters.
// ==============================================
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { cn } from "../shared/utils"
import { DUR, EASE_PANEL } from "../shared/motion"
import { clampBezier, bezierValue, type Bezier } from "../lib/bezier"
import { springValue, motionSettlingTime } from "../lib/spring"
import type { Easing } from "../lib/tokens"

// Deliberately wide. A near-square viewBox scaled to the column width made the
// plot 500px tall and pushed everything else off screen; 2:1 keeps the curve
// readable at a height that leaves room for the rest of the page.
const W = 300
const H = 112
/** Room above and below the box so overshoot has somewhere to go. */
const PAD = 22

/** The family's panel easing, as a curve this file can evaluate. */
const PANEL_CURVE = {
  x1: EASE_PANEL[0],
  y1: EASE_PANEL[1],
  x2: EASE_PANEL[2],
  y2: EASE_PANEL[3],
}

/** The whole drawable box, in viewBox units. */
const VB_H = H + PAD * 2

/**
 * Slack around the drawable box, so a handle sitting on an edge is drawn whole.
 *
 * A handle at t = 0 is centred on x = 0, and the viewBox used to start there —
 * so half the circle fell outside it and got clipped into a half-moon. The
 * same happened vertically at the top of the range. The mapping is unchanged;
 * the canvas is simply bigger than the area things are mapped into.
 */
const EDGE = 12

/**
 * The value range the box shows, and what it defaults to.
 *
 * Expressed in progress units so the mapping has one definition. The defaults
 * reproduce the original fixed layout exactly: v = 1 lands on PAD, v = 0 lands
 * on PAD + H.
 */
export type View = { lo: number; hi: number }
const DEFAULT_VIEW: View = { lo: -PAD / H, hi: 1 + PAD / H }

/**
 * Fit the box to whatever the curve and its handles actually need.
 *
 * A curve that overshoots past the default range used to be drawn off-canvas —
 * you could see neither the arc nor the handle that made it, and a handle you
 * cannot see is a handle you cannot drag back. The box now rescales instead,
 * so nothing is ever outside it. In the common case nothing exceeds the
 * defaults and this returns them unchanged, so the plot doesn't breathe while
 * you work inside the normal range.
 */
function fitView(samples: number[], handles: number[]): View {
  let { lo, hi } = DEFAULT_VIEW
  for (const v of samples) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  for (const v of handles) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  // Breathing room, but only on a side that actually grew.
  const span = DEFAULT_VIEW.hi - DEFAULT_VIEW.lo
  if (lo < DEFAULT_VIEW.lo) lo -= span * 0.08
  if (hi > DEFAULT_VIEW.hi) hi += span * 0.08
  return { lo, hi }
}

const toX = (t: number) => t * W
const toY = (v: number, view: View) => ((view.hi - v) / (view.hi - view.lo)) * VB_H
/** The inverse, for turning a pointer position back into a value. */
const fromY = (frac: number, view: View) => view.hi - frac * (view.hi - view.lo)

const STEPS = 120

/** Progress at each sample. Always the same length, whatever the easing is. */
function samplesFor(easing: Easing, durationMs: number): number[] {
  const out = new Array<number>(STEPS + 1)
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    out[i] =
      easing.kind === "bezier"
        ? bezierValue(easing.bezier, t)
        : springValue(easing.spring, t * durationMs)
  }
  return out
}

const pathFrom = (samples: number[], view: View): string =>
  samples
    .map(
      (v, i) => `${i === 0 ? "M" : "L"}${toX(i / STEPS).toFixed(2)},${toY(v, view).toFixed(2)}`,
    )
    .join(" ")

/**
 * Travel to a new curve rather than cutting to it.
 *
 * Motion cannot do this for us: `animate={{ d }}` leaves the attribute
 * undefined, because the `d` attribute isn't one of the SVG properties it
 * interpolates. But every curve here is sampled at the same fixed count, so
 * the two shapes are just two arrays of the same length — lerping them
 * pointwise is exact, and it's what lets a bezier morph into a spring.
 *
 * Eased with the family's own panel curve, evaluated by the same bezier code
 * the tool exports.
 *
 * Skipped entirely while dragging (a curve easing toward your cursor feels
 * broken) and under reduced motion, which the rest of the app honours too.
 */
function useMorphingSamples(target: number[], animate: boolean): number[] {
  // Null except mid-flight, and the target is what renders otherwise. That
  // ordering is the point: an animation that fails to run leaves the correct
  // curve on screen rather than a stale one. Holding the tween as the source
  // of truth made the drawing depend on requestAnimationFrame actually firing
  // — and in a throttled or backgrounded tab it doesn't, which stranded the
  // plot on the previous shape while every number beside it had moved on.
  const [morph, setMorph] = useState<number[] | null>(null)
  const previous = useRef(target)
  const key = target.length + ":" + target.map((v) => v.toFixed(4)).join(",")

  useEffect(() => {
    const start = previous.current
    previous.current = target
    if (!animate || start.length !== target.length) {
      setMorph(null)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const ms = DUR.panel * 1000
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      if (p >= 1) {
        setMorph(null)
        return
      }
      const e = bezierValue(PANEL_CURVE, p)
      setMorph(target.map((v, i) => start[i] + (v - start[i]) * e))
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the values, not the array identity
  }, [key, animate])

  return morph ?? target
}

export default function CurvePlot({
  easing,
  onChange,
  thumb = false,
  className,
}: {
  easing: Easing
  /** Omit to render read-only. */
  onChange?: (b: Bezier) => void
  /** Shape only — no guides, no handles. For a collapsed row. */
  thumb?: boolean
  className?: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<1 | 2 | null>(null)
  // Mirrored into state only so the path can drop its animation mid-drag; a
  // curve that eases toward your cursor is a curve that feels broken.
  const [isDragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState<1 | 2 | null>(null)
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const duration = easing.kind === "spring" ? motionSettlingTime(easing.spring) : 1

  const editable = easing.kind === "bezier" && Boolean(onChange)

  const move = (e: ReactPointerEvent) => {
    if (!dragging.current || easing.kind !== "bezier" || !onChange) return
    const box = svgRef.current?.getBoundingClientRect()
    if (!box) return
    // The element spans the padded viewBox, so a pointer fraction has to be
    // mapped back through the slack before it means anything in curve units.
    const vbX = -EDGE + ((e.clientX - box.left) / box.width) * (W + EDGE * 2)
    const vbY = -EDGE + ((e.clientY - box.top) / box.height) * (VB_H + EDGE * 2)
    const t = vbX / W
    const v = fromY(vbY / VB_H, frozenView.current)
    const next =
      dragging.current === 1
        ? { ...easing.bezier, x1: t, y1: v }
        : { ...easing.bezier, x2: t, y2: v }
    onChange(clampBezier(next))
  }

  const handle = (n: 1 | 2) => (e: ReactPointerEvent) => {
    if (!editable) return
    dragging.current = n
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const endDrag = () => {
    dragging.current = null
    setDragging(false)
  }

  // A thumbnail carries the shape and nothing else: at 54px the guides and
  // handles are noise, and the row it sits in is for comparing three shapes.
  const b = easing.kind === "bezier" && !thumb ? easing.bezier : null

  const shown = useMorphingSamples(samplesFor(easing, duration), !isDragging && !reduced)

  /*
    The view follows the drawn curve, so it grows smoothly as a morph plays.

    But it is FROZEN for the duration of a drag, and that is not an
    optimisation — it breaks a feedback loop. Pointer position maps to a value
    through the view; if the view then rescaled to fit that value, the same
    pointer would map to a different one on the next frame, and near the top
    edge it diverges rather than settling. Frozen, a drag is exactly 1:1, and
    the box re-fits when you let go.
  */
  const liveView = fitView(shown, b ? [b.y1, b.y2] : [])
  const frozenView = useRef(liveView)
  if (!isDragging) frozenView.current = liveView
  const view = isDragging ? frozenView.current : liveView

  return (
    <svg
      ref={svgRef}
      viewBox={
        thumb ? `0 0 ${W} ${VB_H}` : `${-EDGE} ${-EDGE} ${W + EDGE * 2} ${VB_H + EDGE * 2}`
      }
      className={cn("w-full touch-none select-none", editable && "cursor-crosshair", className)}
      onPointerMove={move}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      role="img"
      aria-label="Easing curve"
    >
      {!thumb && (
        <>
          {/* The 0 and 1 lines. Anything outside them is overshoot. */}
          <line
            x1={0}
            y1={toY(0, view)}
            x2={W}
            y2={toY(0, view)}
            className="stroke-line"
            strokeWidth={1}
          />
          <line
            x1={0}
            y1={toY(1, view)}
            x2={W}
            y2={toY(1, view)}
            className="stroke-line"
            strokeWidth={1}
          />
          <line
            x1={0}
            y1={toY(0, view)}
            x2={W}
            y2={toY(1, view)}
            className="stroke-line"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
        </>
      )}

      {b && (
        <>
          <line
            x1={toX(0)}
            y1={toY(0, view)}
            x2={toX(b.x1)}
            y2={toY(b.y1, view)}
            className="stroke-ash/40"
            strokeWidth={1}
          />
          <line
            x1={toX(1)}
            y1={toY(1, view)}
            x2={toX(b.x2)}
            y2={toY(b.y2, view)}
            className="stroke-ash/40"
            strokeWidth={1}
          />
        </>
      )}

      <path
        d={pathFrom(shown, view)}
        fill="none"
        className="stroke-ink"
        strokeWidth={thumb ? 5 : 2}
        strokeLinecap="round"
      />

      {b &&
        ([1, 2] as const).map((n) => {
          const x = n === 1 ? b.x1 : b.x2
          const y = n === 1 ? b.y1 : b.y2
          const active = dragging.current === n && isDragging
          const warm = active || hovered === n
          return (
            /*
              An invisible ring around each handle, so the target is 22px
              across while the dot stays 12. Grabbing a 12px circle exactly is
              a game, not a control — and the hit area is where the hover
              state comes from too, which is why it carries the listeners.
            */
            <g
              key={n}
              onPointerEnter={() => editable && setHovered(n)}
              onPointerLeave={() => setHovered((h) => (h === n ? null : h))}
              onPointerDown={handle(n)}
              className={cn(editable && (active ? "cursor-grabbing" : "cursor-grab"))}
            >
              <circle cx={toX(x)} cy={toY(y, view)} r={11} fill="transparent" />
              <circle
                cx={toX(x)}
                cy={toY(y, view)}
                r={editable ? (active ? 7.5 : warm ? 7 : 6) : 4}
                className={cn(
                  "transition-[r,fill] duration-100",
                  active ? "fill-ink stroke-ink" : "fill-paper stroke-ink",
                )}
                strokeWidth={2}
              />
            </g>
          )
        })}
    </svg>
  )
}
