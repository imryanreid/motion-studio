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
import { PushPin, PushPinSlash } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import CopyText from "../shared/components/CopyText"
import { bezierToCss } from "../lib/bezier"
import {
  DURATION_NAMES,
  PURPOSES,
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

export function DurationScale({
  state,
  onChange,
}: {
  state: MotionState
  onChange: (s: MotionState) => void
}) {
  const durations = resolveDurations(state)
  const longest = Math.max(...DURATION_NAMES.map((n) => durations[n]))

  const togglePin = (name: DurationName) => {
    const pins = { ...state.pins }
    if (pins[name] === undefined) pins[name] = durations[name]
    else delete pins[name]
    onChange({ ...state, pins })
  }

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Durations</h2>
        <span className="text-ash font-mono text-[11px]">
          {state.base}ms × {state.ratio} · snapped to {state.snap}ms
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {DURATION_NAMES.map((name) => {
          const ms = durations[name]
          const derived = isDerived(state, name)
          return (
            <div key={name} className="flex items-center gap-3">
              <span className="text-ash w-24 shrink-0 font-mono text-xs">{name}</span>
              <div className="bg-ink/[0.04] relative h-8 flex-1 overflow-hidden rounded-md">
                <div
                  className={cn("absolute inset-y-0 left-0", derived ? "bg-ink/70" : "bg-ink")}
                  style={{ width: `${(ms / longest) * 100}%` }}
                />
              </div>
              <CopyText
                value={`${ms}ms`}
                title={`Copy ${ms}ms`}
                className="text-ink w-14 shrink-0 text-right font-mono text-xs"
              >
                {ms}ms
              </CopyText>
              <button
                type="button"
                onClick={() => togglePin(name)}
                title={
                  derived
                    ? `Pin ${name} at ${ms}ms so the ratio stops driving it`
                    : `Release ${name} back to the generated curve`
                }
                aria-label={derived ? `Pin ${name}` : `Release ${name}`}
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors",
                  derived
                    ? "border-line text-ash hover:border-ink/30 hover:text-ink"
                    : "border-ink/30 text-ink bg-ink/[0.05]",
                )}
              >
                {derived ? <PushPin size={12} /> : <PushPinSlash size={12} weight="fill" />}
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-ash mt-3 max-w-[62ch] text-xs leading-relaxed">
        Generated from the base and ratio. A pinned step holds its value instead —{" "}
        <span className="text-ink">instant</span> ships pinned because it isn't a point on the
        same perceptual curve as the others. Feedback meant to read as cause and effect needs to
        sit under roughly 100ms whatever the rest of the scale does.
      </p>
    </section>
  )
}

export function SemanticTable({ state }: { state: MotionState }) {
  const semantics = resolveSemantics(state)

  return (
    <section className="mb-12">
      <h2 className="font-display mb-4 text-xl font-semibold tracking-tight">
        Semantic motion
      </h2>

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
                  {PURPOSES.filter((p) => p.aliasOf === t.emphasis)
                    .map((p) => p.id)
                    .join(", ")}
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
