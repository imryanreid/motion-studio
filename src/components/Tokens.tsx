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
import { ArrowCounterClockwise } from "@phosphor-icons/react"
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
 * A number you type straight into the surface it belongs to.
 *
 * Two looks, and the difference between them is the panel's entire legend:
 * `field` draws a box, and a box around a number means that number was typed.
 * `ghost` is indistinguishable from static text until you hover it — used for
 * generated values, which you *may* override but have not.
 *
 * Bordering the cell instead of the number was the bug that kept coming back:
 * a box around a region says everything inside it is editable, and there was
 * always a derived value in there.
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
  variant = "field",
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
  /** `field` for an authored value, `ghost` for one you could author. */
  variant?: "field" | "ghost"
  className?: string
  title?: string
  ariaLabel: string
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  const commit = (raw: string) => {
    const n = Number(raw)
    if (raw.trim() !== "" && Number.isFinite(n)) onChange(clamp(n))
  }

  return (
    <span className={cn("inline-flex items-baseline gap-0.5", className)} title={title}>
      <input
        // Text, not number: no spinner, and no browser-specific handling of a
        // half-typed value in a control this small.
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value)
          commit(e.target.value)
        }}
        onBlur={(e) => {
          setDraft(null)
          commit(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
        className={cn(
          "-mx-1 rounded border px-1 tabular-nums outline-none transition-colors",
          variant === "field"
            ? "border-line bg-paper focus:border-ink/40"
            : "hover:border-line/70 border-transparent bg-transparent hover:border-dashed focus:border-solid focus:border-ink/40",
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
 * `base` leads rather than sitting in numeric position, because reading order
 * beats numeric order for the value you actually type: the eye lands top-left,
 * and that is where the cause should be. The four generated steps stay in
 * scale order after a gap, each carrying the arithmetic that produced it — a
 * gap between an input and four outputs only reads as cause and effect if the
 * outputs say what was done to them.
 *
 * Enter and exit are paired inside each step rather than split into two rows.
 * The pair anyone reasons about is "fast in, fast out", not "all the exits" —
 * and pairing them here is a tighter tie than putting the exit share next to a
 * row of exits ever was, so that control moves up to the header with the other
 * two multipliers, which are the same kind of thing.
 *
 * Every value here is typeable, and the box that appears when you type one is
 * the whole legend: a box around a number means that number was authored. The
 * box is on the number and never on the cell — a box around a region claims
 * everything inside it is editable, and there is always a derived value inside.
 * This replaces pinning, which needed an icon in every cell and a verb nobody
 * asked for to say the same thing.
 */
export function DurationStrip({
  state,
  onChange,
  highlight,
}: {
  state: MotionState
  onChange: (s: MotionState) => void
  /** A step some other panel is currently pointing at. Draws the tie. */
  highlight?: DurationName | null
}) {
  const durations = resolveDurations(state)
  const longest = Math.max(...DURATION_NAMES.map((n) => durations[n]))
  const [hovered, setHovered] = useState<DurationName | null>(null)

  const exitOf = (ms: number) => Math.max(1, Math.round(ms * state.exitRatio))

  /** Typing into a generated step authors it; the arrow gives it back. */
  const author = (name: DurationName, ms: number) =>
    onChange({ ...state, pins: { ...state.pins, [name]: ms } })
  const release = (name: DurationName) => {
    const pins = { ...state.pins }
    delete pins[name]
    onChange({ ...state, pins })
  }

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

  /** One step: its name, its duration, the exit it implies, its length. */
  const cell = (name: DurationName) => {
    const ms = durations[name]
    const derived = isDerived(state, name)
    const isBase = name === "base"
    const step = DURATION_STEPS[name]
    const unrounded = state.base * Math.pow(state.ratio, step)
    // Which levels reach for this step. Reported on hover, never by dimming
    // the cell: an unused step is not broken, and greying it out was the
    // loudest possible way to say the quietest thing on the panel.
    const users = emphasisUsing(state, name)

    return (
      <div
        key={name}
        onMouseEnter={() => setHovered(name)}
        onMouseLeave={() => setHovered((h) => (h === name ? null : h))}
        className={cn(
          "flex flex-col gap-1 px-2 py-2 transition-colors",
          !isBase && "bg-ink/[0.03] border-line/60 border-l",
          name === DERIVED_NAMES[0] && "rounded-l-md border-l-0",
          name === DERIVED_NAMES[DERIVED_NAMES.length - 1] && "rounded-r-md",
          highlight === name && "bg-ink/[0.09]",
        )}
        title={
          (isBase
            ? "The anchor you type. Every other step is this multiplied or divided by the ratio."
            : derived
              ? `${state.base} ${step < 0 ? "÷" : "×"} ${Math.pow(state.ratio, Math.abs(step)).toFixed(2)} = ${unrounded.toFixed(2)}ms, rounded to ${ms}ms`
              : `Authored at ${ms}ms — held here instead of following the base and ratio`) +
          (users.length ? ` · used by ${users.join(", ")}` : " · no emphasis reaches for this step")
        }
      >
        <div className="flex items-baseline justify-between gap-1">
          <span
            className={cn(
              "truncate font-mono text-[10px] tracking-wide",
              isBase ? "text-ink" : "text-ash",
            )}
          >
            {name}
          </span>
          {/* The factor, or — where there is no factor because you overrode
              it — the way back onto the curve. */}
          {!isBase &&
            (derived ? (
              <span className="text-ash/60 shrink-0 font-mono text-[10px]">
                {derivationLabel(state.ratio, step)}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => release(name)}
                title="Release back onto the generated scale"
                aria-label={`Release ${name}`}
                className="text-ash hover:text-ink shrink-0"
              >
                <ArrowCounterClockwise size={11} weight="bold" />
              </button>
            ))}
        </div>

        <span className="text-ink font-mono text-sm">
          <InlineNumber
            ariaLabel={`${name} duration in milliseconds`}
            value={isBase ? state.base : ms}
            min={20}
            max={9000}
            width="w-10"
            suffix="ms"
            variant={isBase || !derived ? "field" : "ghost"}
            onChange={(v) => (isBase ? onChange({ ...state, base: v }) : author(name, v))}
          />
        </span>

        {/* The exit this step implies, beside the entrance it came from. */}
        <span className="text-ash font-mono text-[11px]">{exitOf(ms)} out</span>

        {bar(name)}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[500px] grid-cols-[6.5rem_1.75rem_repeat(4,minmax(0,1fr))]">
        {cell("base")}
        <div
          aria-hidden="true"
          className="text-ash flex items-center justify-center font-mono text-xs"
        >
          →
        </div>
        {DERIVED_NAMES.map((n) => cell(n))}
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
