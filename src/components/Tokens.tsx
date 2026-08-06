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
    <div className="min-w-0 flex-1">
      <FieldLabel
        aside={
          <span
            className="text-ash font-mono text-[10px]"
            title="Each step is the base multiplied by the ratio, rounded to the snap. Pin a step to hold it while the ratio moves the others."
          >
            {state.base}ms × {state.ratio}
          </span>
        }
      >
        Durations
      </FieldLabel>

      {/*
        Below ~620px five columns crush to ~78px and the labels collide, so the
        strip scrolls instead — the same thing Ramps does with an 11-step ramp
        row and with the semantic token table.
      */}
      <div className="overflow-x-auto pb-1">
        <div className="border-line grid min-w-[620px] grid-cols-5 overflow-hidden rounded-md border">
          {DURATION_NAMES.map((name) => {
            const ms = durations[name]
            const derived = isDerived(state, name)
            const used = emphasisUsing(state, name)
            return (
              <div
                key={name}
                onMouseEnter={() => setHovered(name)}
                onMouseLeave={() => setHovered((h) => (h === name ? null : h))}
                className="border-line relative flex flex-col gap-1 border-r px-2.5 py-2 last:border-r-0"
              >
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-ash font-mono text-[10px] tracking-wide">{name}</span>
                  <button
                    type="button"
                    onClick={() => togglePin(name)}
                    title={
                      derived
                        ? `Pin at ${ms}ms — holds this value while the ratio moves the others`
                        : `Release back onto the generated curve`
                    }
                    aria-label={derived ? `Pin ${name}` : `Release ${name}`}
                    className={cn(
                      "shrink-0 transition-colors",
                      derived ? "text-line hover:text-ash" : "text-ink",
                    )}
                  >
                    {derived ? <PushPin size={11} /> : <PushPin size={11} weight="fill" />}
                  </button>
                </div>

                <span className="text-ink font-mono text-sm">{ms}ms</span>

                {/*
                Relative length, and on hover a marker crosses it at exactly
                this duration — a number is not a feel. The global
                reduced-motion rule in tokens.css already flattens this.
              */}
                <div className="bg-ink/[0.06] relative h-1 overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full", derived ? "bg-ink/50" : "bg-ink")}
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

                <span
                  className={cn(
                    "font-mono text-[10px]",
                    used.length ? "text-ash" : "text-line",
                  )}
                  title={
                    used.length
                      ? `${used.join(", ")} reaches for this duration`
                      : "No semantic token uses this — it ships in exports with nothing referencing it"
                  }
                >
                  {used.length ? used.join(", ") : "unused"}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-ash mt-2 text-[11px] leading-snug">
        Pinned steps keep their value when you change the base or ratio.
      </p>
    </div>
  )
}

export function SemanticTable({
  state,
  onChange,
}: {
  state: MotionState
  onChange: (s: MotionState) => void
}) {
  const semantics = resolveSemantics(state)

  return (
    <section className="mb-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Semantic motion</h2>
        {/* The exit ratio governs this table and nothing else, so it lives here
            rather than in the global band. */}
        <label
          className="text-ash flex items-center gap-2 font-mono text-[11px]"
          title="Exit duration as a share of the entrance. Exits should be quicker — lingering on something you've finished with reads as lag."
        >
          exit
          <input
            type="range"
            min={20}
            max={130}
            step={5}
            value={Math.round(state.exitRatio * 100)}
            onChange={(e) => onChange({ ...state, exitRatio: Number(e.target.value) / 100 })}
            className="accent-ink h-1 w-24"
          />
          <span className="text-ink w-9">{Math.round(state.exitRatio * 100)}%</span>
        </label>
      </div>

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
    </section>
  )
}
