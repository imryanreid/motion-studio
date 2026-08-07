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
import { PushPin } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import CopyText from "../shared/components/CopyText"
import { bezierToCss } from "../lib/bezier"
import {
  DERIVED_NAMES,
  DURATION_NAMES,
  DURATION_STEPS,
  derivationLabel,
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
 * A number you type straight into the surface it belongs to — no field chrome.
 *
 * Holds a draft string while you're typing rather than round-tripping every
 * keystroke through a number: `Number("")` is 0, not NaN, so clearing used to
 * commit a 0 and then typing 1000 over it produced "01000".
 */
export function InlineNumber({
  value,
  onChange,
  min,
  max,
  width = "w-10",
  suffix,
  className,
  title,
  ariaLabel,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  /** Tailwind width for the input, sized to the digits it will hold. */
  width?: string
  suffix?: string
  className?: string
  title?: string
  ariaLabel: string
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))

  return (
    <span className={cn("inline-flex items-baseline", className)} title={title}>
      <input
        // Text, not number: no spinner, and no browser-specific handling of a
        // half-typed value in a control this small.
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(clamp(n))
        }}
        onBlur={(e) => {
          setDraft(null)
          const n = Number(e.target.value)
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(clamp(n))
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
        className={cn(
          "border-b border-dashed border-current/30 bg-transparent tabular-nums outline-none",
          "focus:border-solid focus:border-current",
          width,
        )}
      />
      {suffix && <span className="opacity-60">{suffix}</span>}
    </span>
  )
}

/**
 * The duration scale — the one input, then everything it produces.
 *
 * `base` sits leftmost in its own bordered box rather than in scale position,
 * because reading order beats numeric order for the thing you actually type:
 * the eye lands top-left, and that is where the cause should be. The four
 * derived steps stay in scale order to the right of a gap, each labelled with
 * the arithmetic that produced it — a gap between an input and four outputs
 * only reads as cause and effect if the outputs say what was done to them.
 *
 * Two aligned rows, enter over exit. The exit row is what names the enter
 * durations as entrances, and it puts the exit slider directly under the
 * numbers it drives.
 *
 * Bordered means authored, filled means generated. That is the whole legend.
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

  const exitOf = (ms: number) => Math.max(1, Math.round(ms * state.exitRatio))
  const rowTag =
    "text-ash flex items-center pr-2.5 font-mono text-[10px] tracking-[0.16em] uppercase"

  /** The travelling marker: a number is not a feel. */
  const bar = (name: DurationName) => (
    <div className="bg-ink/[0.07] relative h-1 overflow-hidden rounded-full">
      <div
        className="bg-ink/70 h-full rounded-full"
        style={{ width: `${(durations[name] / longest) * 100}%` }}
      />
      <div
        aria-hidden="true"
        className="bg-paper absolute top-0 bottom-0 w-1 rounded-full transition-transform ease-[cubic-bezier(0.2,0,0,1)]"
        style={{
          left: 0,
          transitionDuration: `${durations[name]}ms`,
          transform: hovered === name ? "translateX(1000%)" : "none",
          opacity: hovered === name ? 1 : 0,
        }}
      />
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[540px] grid-cols-[3.25rem_8rem_2rem_repeat(4,minmax(0,1fr))]">
        {/* ── enter ─────────────────────────────────────────────────────── */}
        <span className={rowTag} title="Entrance durations. Everything else derives from these.">
          Enter
        </span>

        <div
          onMouseEnter={() => setHovered("base")}
          onMouseLeave={() => setHovered((h) => (h === "base" ? null : h))}
          className={cn(
            "border-line bg-paper flex flex-col gap-1 rounded-t-md border border-b-0 px-2.5 py-2",
            emphasisUsing(state, "base").length === 0 && "opacity-45",
          )}
        >
          <span className="text-ink font-mono text-[10px] tracking-wide">base</span>
          <span className="text-ink font-mono text-sm">
            <InlineNumber
              ariaLabel="Base duration in milliseconds"
              title="The anchor you type. Every other step is this multiplied or divided by the ratio, so changing it moves the whole scale."
              value={state.base}
              min={20}
              max={2000}
              width="w-10"
              suffix="ms"
              onChange={(base) => onChange({ ...state, base })}
            />
          </span>
          {bar("base")}
        </div>

        <div
          aria-hidden="true"
          className="text-ash flex items-center justify-center font-mono text-xs"
        >
          →
        </div>

        {DERIVED_NAMES.map((name, i) => {
          const ms = durations[name]
          const derived = isDerived(state, name)
          const step = DURATION_STEPS[name]
          const unrounded = state.base * Math.pow(state.ratio, step)
          // Dimmed rather than labelled: nothing reaches for this step, so it
          // ships in exports with no token referencing it.
          const unused = emphasisUsing(state, name).length === 0
          return (
            <div
              key={name}
              onMouseEnter={() => setHovered(name)}
              onMouseLeave={() => setHovered((h) => (h === name ? null : h))}
              className={cn(
                "bg-ink/[0.03] border-line/60 flex flex-col gap-1 border-l px-2.5 py-2",
                i === 0 && "rounded-tl-md border-l-0",
                i === DERIVED_NAMES.length - 1 && "rounded-tr-md",
                unused && "opacity-45",
              )}
              title={
                derived
                  ? `${state.base} ${step < 0 ? "÷" : "×"} ${Math.pow(state.ratio, Math.abs(step)).toFixed(2)} = ${unrounded.toFixed(2)}ms, rounded to ${ms}ms` +
                    (unused ? " · no emphasis uses this" : ` · used by ${emphasisUsing(state, name).join(", ")}`)
                  : `Pinned at ${ms}ms — held here instead of following the base and ratio`
              }
            >
              <div className="flex items-baseline gap-1">
                <span className="text-ash truncate font-mono text-[10px] tracking-wide">
                  {name}
                </span>
                <button
                  type="button"
                  onClick={() => togglePin(name)}
                  title={
                    derived
                      ? `Pin at ${ms}ms — holds this value when you change the base or ratio`
                      : "Release back onto the generated scale"
                  }
                  aria-label={derived ? `Pin ${name}` : `Release ${name}`}
                  className={cn(
                    "ml-auto shrink-0 transition-opacity",
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

              {/* The factor rides with the number it produced, not with the
                  step name — it reads as "280ms, and that's base ×1.4", and
                  it's the only place there's room for it. Absent when pinned:
                  a pinned step was reached by no arithmetic at all. */}
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-ink font-mono text-sm">{ms}ms</span>
                {derived && (
                  <span className="text-ash/60 shrink-0 font-mono text-[10px]">
                    {derivationLabel(state.ratio, step)}
                  </span>
                )}
              </div>
              {bar(name)}
            </div>
          )
        })}

        {/* ── exit ──────────────────────────────────────────────────────── */}
        <span
          className={rowTag}
          title={`${Math.round(state.exitRatio * 100)}% of the entrance beside it. A spring token ignores this — it settles when it settles.`}
        >
          Exit
        </span>

        <div
          className={cn(
            "border-line bg-paper rounded-b-md border border-t-0 px-2.5 py-1.5",
            emphasisUsing(state, "base").length === 0 && "opacity-45",
          )}
        >
          <span className="text-ash font-mono text-xs">{exitOf(durations.base)}ms</span>
        </div>

        <div />

        {DERIVED_NAMES.map((name, i) => {
          const unused = emphasisUsing(state, name).length === 0
          return (
            <div
              key={name}
              className={cn(
                "bg-ink/[0.03] border-line/60 border-t border-l px-2.5 py-1.5",
                i === 0 && "rounded-bl-md border-l-0",
                i === DERIVED_NAMES.length - 1 && "rounded-br-md",
                unused && "opacity-45",
              )}
            >
              <span className="text-ash font-mono text-xs">{exitOf(durations[name])}ms</span>
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
