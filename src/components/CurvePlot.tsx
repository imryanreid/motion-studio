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
import { useRef, type PointerEvent as ReactPointerEvent } from "react"
import { cn } from "../shared/utils"
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

const toX = (t: number) => t * W
const toY = (v: number) => PAD + (1 - v) * H

function pathFor(easing: Easing, durationMs: number): string {
  const steps = 120
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const v =
      easing.kind === "bezier"
        ? bezierValue(easing.bezier, t)
        : springValue(easing.spring, t * durationMs)
    pts.push(`${i === 0 ? "M" : "L"}${toX(t).toFixed(2)},${toY(v).toFixed(2)}`)
  }
  return pts.join(" ")
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
  const duration = easing.kind === "spring" ? motionSettlingTime(easing.spring) : 1

  const editable = easing.kind === "bezier" && Boolean(onChange)

  const move = (e: ReactPointerEvent) => {
    if (!dragging.current || easing.kind !== "bezier" || !onChange) return
    const box = svgRef.current?.getBoundingClientRect()
    if (!box) return
    const t = (e.clientX - box.left) / box.width
    // Invert the y mapping, including the padding that gives overshoot room.
    const v = 1 - ((e.clientY - box.top) / box.height) * ((H + PAD * 2) / H) + PAD / H
    const next =
      dragging.current === 1
        ? { ...easing.bezier, x1: t, y1: v }
        : { ...easing.bezier, x2: t, y2: v }
    onChange(clampBezier(next))
  }

  const handle = (n: 1 | 2) => (e: ReactPointerEvent) => {
    if (!editable) return
    dragging.current = n
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  // A thumbnail carries the shape and nothing else: at 54px the guides and
  // handles are noise, and the row it sits in is for comparing three shapes.
  const b = easing.kind === "bezier" && !thumb ? easing.bezier : null

  return (
    <svg
      ref={svgRef}
      viewBox={`0 ${0} ${W} ${H + PAD * 2}`}
      className={cn("w-full touch-none select-none", editable && "cursor-crosshair", className)}
      onPointerMove={move}
      onPointerUp={() => (dragging.current = null)}
      onPointerLeave={() => (dragging.current = null)}
      role="img"
      aria-label="Easing curve"
    >
      {!thumb && (
        <>
          {/* The 0 and 1 lines. Anything outside them is overshoot. */}
          <line x1={0} y1={toY(0)} x2={W} y2={toY(0)} className="stroke-line" strokeWidth={1} />
          <line x1={0} y1={toY(1)} x2={W} y2={toY(1)} className="stroke-line" strokeWidth={1} />
          <line
            x1={0}
            y1={toY(0)}
            x2={W}
            y2={toY(1)}
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
            y1={toY(0)}
            x2={toX(b.x1)}
            y2={toY(b.y1)}
            className="stroke-ash/40"
            strokeWidth={1}
          />
          <line
            x1={toX(1)}
            y1={toY(1)}
            x2={toX(b.x2)}
            y2={toY(b.y2)}
            className="stroke-ash/40"
            strokeWidth={1}
          />
        </>
      )}

      <path
        d={pathFor(easing, duration)}
        fill="none"
        className="stroke-ink"
        strokeWidth={thumb ? 5 : 2}
        strokeLinecap="round"
      />

      {b && (
        <>
          <circle
            cx={toX(b.x1)}
            cy={toY(b.y1)}
            r={editable ? 6 : 4}
            className={cn("fill-paper stroke-ink", editable && "cursor-grab")}
            strokeWidth={2}
            onPointerDown={handle(1)}
          />
          <circle
            cx={toX(b.x2)}
            cy={toY(b.y2)}
            r={editable ? 6 : 4}
            className={cn("fill-paper stroke-ink", editable && "cursor-grab")}
            strokeWidth={2}
            onPointerDown={handle(2)}
          />
        </>
      )}
    </svg>
  )
}
