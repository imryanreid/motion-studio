// ==============================================
// TOKEN TABLES
// The generated duration scale and the six semantic
// tokens it composes into.
//
// Durations show whether each step is derived or
// pinned, because the system is the point: the ratio
// is the lesson and the pin is the escape hatch, and
// you can't see either if they look identical.
// ==============================================
import { useState } from "react"
import { PushPin, PushPinSlash } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import CopyText from "../shared/components/CopyText"
import { FieldLabel } from "../shared/components/Label"
import { bezierToCss } from "../lib/bezier"
import {
  DURATION_NAMES,
  emphasisUsing,
  purposes,
  isDerived,
  resolveDurations,
  resolveSemantics,
  type DurationName,
  type Easing,
  type MotionState,
} from "../lib/tokens"

const describeEasing = (e: Easing) =>
  e.kind === "bezier"
    ? bezierToCss(e.bezier)
    : `spring(${e.spring.stiffness}, ${e.spring.damping}, ${e.spring.mass})`

/**
 * The duration scale, as a horizontal strip.
 *
 * Five equal cells rather than five stacked bars, which is how Ramps renders an
 * 11-step ramp — same family idiom, and it collapses the block from ~200px to
 * ~80px. That's what makes it affordable to sit directly under the controls
 * that generate it, which in turn is what lets the redundant "Generates" echo
 * go away: the generator and the generated are simply adjacent.
 */
/**
 * The generated duration scale.
 *
 * Filled rather than bordered, and carrying no input chrome, because that is
 * the family's signal for "this is output". It replaces four separate ways of
 * saying the same thing — an indent, a left rule, a "generated" label and a
 * caption — none of which said it as directly as simply not looking editable.
 *
 * The only thing you author here is a pin, so that is the only affordance, and
 * it stays hidden until you hover the cell it belongs to.
 */
export function DurationStrip({
  state,
  onChange,
}: {
  state: MotionState
  onChange: (s: MotionState) => void
}) {
  const durations = resolveDurations(state)
  const longest = Math.max(...DURATION_NAMES.map((n) => durations[n]))
  const [hovered, setHovered] = useState<DurationName | null>(null)

  const togglePin = (name: DurationName) => {
    const pins = { ...state.pins }
    if (pins[name] === undefined) pins[name] = durations[name]
    else delete pins[name]
    onChange({ ...state, pins })
  }

  return (
    <div className="overflow-x-auto">
      <div className="bg-ink/[0.03] divide-line/60 grid min-w-[460px] grid-cols-5 divide-x rounded-md">
        {DURATION_NAMES.map((name) => {
          const ms = durations[name]
          const derived = isDerived(state, name)
          // Dimmed rather than labelled: nothing reaches for this step, so it
          // ships in exports with no token referencing it.
          const unused = emphasisUsing(state, name).length === 0
          return (
            <div
              key={name}
              onMouseEnter={() => setHovered(name)}
              onMouseLeave={() => setHovered((h) => (h === name ? null : h))}
              className={cn("flex flex-col gap-1 px-2.5 py-2", unused && "opacity-45")}
              title={
                unused
                  ? `${name} — no emphasis uses this, so nothing references it`
                  : `${name} — used by ${emphasisUsing(state, name).join(", ")}`
              }
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-ash font-mono text-[10px] tracking-wide">{name}</span>
                <button
                  type="button"
                  onClick={() => togglePin(name)}
                  title={
                    derived
                      ? `Pin at ${ms}ms — keeps this value when you change the base or ratio`
                      : "Release back onto the generated curve"
                  }
                  aria-label={derived ? `Pin ${name}` : `Release ${name}`}
                  className={cn(
                    "shrink-0 transition-opacity",
                    derived
                      ? cn(
                          "text-ash hover:text-ink opacity-0 focus-visible:opacity-100",
                          hovered === name && "opacity-100",
                        )
                      : "text-ink opacity-100",
                  )}
                >
                  <PushPin size={11} weight={derived ? "regular" : "fill"} />
                </button>
              </div>

              <span className="text-ink font-mono text-sm">{ms}ms</span>

              {/* Relative length, and on hover a marker crosses at exactly this
                  duration — a number is not a feel. */}
              <div className="bg-ink/[0.07] relative h-1 overflow-hidden rounded-full">
                <div
                  className="bg-ink/70 h-full rounded-full"
                  style={{ width: `${(ms / longest) * 100}%` }}
                />
                <div
                  aria-hidden="true"
                  className="bg-paper absolute top-0 bottom-0 w-1 rounded-full transition-transform ease-[cubic-bezier(0.2,0,0,1)]"
                  style={{
                    left: 0,
                    transitionDuration: `${ms}ms`,
                    transform: hovered === name ? "translateX(1000%)" : "none",
                    opacity: hovered === name ? 1 : 0,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SemanticTable({
  state,
  children,
}: {
  state: MotionState
  /** The machine-readable block — part of the output, so it lives here. */
  children?: React.ReactNode
}) {
  const semantics = resolveSemantics(state)

  return (
    <section className="mb-12">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Output</h2>
        <span className="text-ash font-mono text-[11px]">
          six tokens · what exports and what an agent reads
        </span>
      </div>
      <p className="text-ash mb-4 max-w-[62ch] text-xs leading-relaxed">
        Every emphasis ships, in both directions. This is the whole set.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="text-ash text-left font-mono text-[11px] tracking-wide uppercase">
              <th className="py-2 pr-4 font-medium">Token</th>
              <th className="py-2 pr-4 font-medium">Duration</th>
              <th className="py-2 pr-4 font-medium">Easing</th>
              <th className="py-2 font-medium">Used for</th>
            </tr>
          </thead>
          <tbody>
            {semantics.map((t) => (
              <tr key={t.id} className="border-line-soft border-t">
                <td className="py-2 pr-4">
                  <CopyText value={`motion.${t.id}`} className="font-mono text-[13px]">
                    motion.{t.id}
                  </CopyText>
                </td>
                <td className="text-ink py-2 pr-4 font-mono text-xs">
                  {t.durationMs}ms
                  {t.easing.kind === "spring" && (
                    <span
                      className="text-ash"
                      title="A spring has no duration — this is where Framer Motion decides it's close enough."
                    >
                      {" "}
                      settling
                    </span>
                  )}
                </td>
                <td className="text-ash py-2 pr-4 font-mono text-[11px]">
                  <CopyText value={describeEasing(t.easing)}>
                    {describeEasing(t.easing)}
                  </CopyText>
                </td>
                <td className="text-ash py-2 text-xs">
                  {purposes(state)
                    .filter((p) => p.aliasOf === t.emphasis)
                    .map((p) => p.id)
                    .join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ash mt-3 max-w-[62ch] text-xs leading-relaxed">
        Exits are derived, not authored: {Math.round(state.exitRatio * 100)}% of the entrance
        duration, on the mirrored curve — and a spring exit loses its bounce entirely. An
        entrance introduces something; an exit removes something you've already finished with,
        and lingering on it reads as lag.
      </p>

      {children}
    </section>
  )
}
