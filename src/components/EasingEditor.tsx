// ==============================================
// EASING EDITOR
// Three curves, one open at a time.
//
// Showing all three expanded pushed the preview
// below the fold, which made the easing controls
// useless — you can't judge a curve you can't watch.
// So the three shapes stay visible as thumbnails,
// and only the selected one expands into parameters.
//
// Bezier and spring are genuinely different things
// rather than two views of one thing, so switching
// mode replaces the easing rather than converting it.
// A spring with visible bounce has no faithful bezier
// at all, and pretending otherwise is the lie this
// tool exists not to tell.
// ==============================================
import { Warning } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import Segmented from "../shared/components/Segmented"
import { Label } from "../shared/components/Label"
import CurvePlot from "./CurvePlot"
import { BEZIER_PRESETS, type Bezier } from "../lib/bezier"
import { derive, overshoot, motionSettlingTime, type SpringConfig } from "../lib/spring"
import {
  DURATION_NAMES,
  EMPHASIS_NAMES,
  resolveDurations,
  purposesUsing,
  type DurationName,
  type Easing,
  type Emphasis,
  type MotionState,
} from "../lib/tokens"

const MODE_OPTIONS = [
  { id: "bezier" as const, label: "Bezier", title: "Four control points" },
  { id: "spring" as const, label: "Spring", title: "Mass, stiffness, damping" },
]

const DEFAULT_SPRING: SpringConfig = { stiffness: 210, damping: 20, mass: 1, velocity: 0 }
const DEFAULT_BEZIER: Bezier = { x1: 0.2, y1: 0, x2: 0, y2: 1 }

/** What the damping ratio means, in a word. */
const REGIME_LABEL = {
  underdamped: "bounces",
  critical: "no bounce",
  overdamped: "slow in",
} as const

function Num({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  title,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  max?: number
  title?: string
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1" title={title}>
      <span className="text-ash font-mono text-[10px] tracking-wide uppercase">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        className="border-line bg-paper text-ink hover:border-ink/30 focus-visible:ring-ink/30 h-8 w-full min-w-0 rounded-md border px-2 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
      />
    </label>
  )
}

export default function EasingEditor({
  state,
  selected,
  onSelect,
  onChange,
  onPairChange,
}: {
  state: MotionState
  selected: Emphasis
  onSelect: (e: Emphasis) => void
  onChange: (e: Emphasis, easing: Easing) => void
  onPairChange: (e: Emphasis, d: DurationName) => void
}) {
  const easing = state.easings[selected]
  const durations = resolveDurations(state)
  const pairedWith = state.durationFor[selected]
  const used = purposesUsing(state, selected)
  const spring = easing.kind === "spring" ? easing.spring : null
  const d = spring ? derive(spring) : null
  const set = (next: Easing) => onChange(selected, next)

  return (
    <section className="flex flex-col">
      <div className="border-line flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <Label as="h2">Easing</Label>
        <Segmented
          ariaLabel={`${selected} easing type`}
          layoutId="easing-mode"
          size="sm"
          value={easing.kind}
          onChange={(kind) =>
            set(
              kind === "spring"
                ? { kind: "spring", spring: DEFAULT_SPRING }
                : { kind: "bezier", bezier: DEFAULT_BEZIER },
            )
          }
          options={MODE_OPTIONS}
        />
      </div>

      {/* All three shapes stay comparable; one at a time opens for editing. */}
      <div className="border-line grid grid-cols-3 border-b">
        {EMPHASIS_NAMES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onSelect(e)}
            aria-pressed={e === selected}
            title={`Edit the ${e} curve`}
            className={cn(
              "border-line flex flex-col items-center gap-1 border-r px-2 py-2 transition-colors last:border-r-0",
              e === selected ? "bg-ink/[0.05]" : "hover:bg-ink/[0.02]",
            )}
          >
            <CurvePlot easing={state.easings[e]} className="h-9 w-full" />
            <span
              className={cn(
                "font-mono text-[10px] tracking-wide uppercase",
                e === selected ? "text-ink" : "text-ash",
              )}
            >
              {e}
            </span>
          </button>
        ))}
      </div>

      {/*
        The duration this curve is paired with, on the panel where you're
        working. The mapping used to be a hardcoded constant stated only in the
        duration strip on the other side of the page — you could look at both
        and never learn they were connected. Making it a choice explains it, and
        lets `instant` and `deliberate` be reached at all.
      */}
      <div className="border-line flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2">
        <label className="text-ash flex items-center gap-1.5 font-mono text-[11px]">
          uses
          <select
            value={pairedWith}
            onChange={(e) => onPairChange(selected, e.target.value as DurationName)}
            aria-label={`Duration for ${selected}`}
            className="border-line bg-paper text-ink hover:border-ink/30 cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors"
          >
            {DURATION_NAMES.map((n) => (
              <option key={n} value={n}>
                {n} · {durations[n]}ms
              </option>
            ))}
          </select>
        </label>
        <span className="text-ash font-mono text-[11px]">
          {used.length ? `for ${used.join(", ")}` : "no purpose uses this yet"}
        </span>
      </div>

      <div className="flex-1 p-4">
        <div className="mx-auto mb-3 max-w-[380px]">
          <CurvePlot
            easing={easing}
            onChange={
              easing.kind === "bezier" ? (bezier) => set({ kind: "bezier", bezier }) : undefined
            }
          />
        </div>

        {easing.kind === "bezier" ? (
          <>
            <div className="mb-3 flex gap-2">
              <Num
                label="x1"
                value={easing.bezier.x1}
                step={0.01}
                min={0}
                max={1}
                title="First handle, time"
                onChange={(x1) => set({ kind: "bezier", bezier: { ...easing.bezier, x1 } })}
              />
              <Num
                label="y1"
                value={easing.bezier.y1}
                step={0.01}
                title="First handle, progress. Outside 0–1 overshoots."
                onChange={(y1) => set({ kind: "bezier", bezier: { ...easing.bezier, y1 } })}
              />
              <Num
                label="x2"
                value={easing.bezier.x2}
                step={0.01}
                min={0}
                max={1}
                title="Second handle, time"
                onChange={(x2) => set({ kind: "bezier", bezier: { ...easing.bezier, x2 } })}
              />
              <Num
                label="y2"
                value={easing.bezier.y2}
                step={0.01}
                title="Second handle, progress. Outside 0–1 overshoots."
                onChange={(y2) => set({ kind: "bezier", bezier: { ...easing.bezier, y2 } })}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {BEZIER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set({ kind: "bezier", bezier: p.value })}
                  className="border-line text-ash hover:border-ink/30 hover:text-ink rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              <Num
                label="stiff"
                value={spring!.stiffness}
                min={1}
                max={1000}
                title="Stiffness — how hard the spring pulls"
                onChange={(stiffness) =>
                  set({ kind: "spring", spring: { ...spring!, stiffness } })
                }
              />
              <Num
                label="damp"
                value={spring!.damping}
                min={0}
                max={100}
                title="Damping — how fast the oscillation dies"
                onChange={(damping) => set({ kind: "spring", spring: { ...spring!, damping } })}
              />
              <Num
                label="mass"
                value={spring!.mass}
                step={0.1}
                min={0.1}
                max={10}
                title="Mass — only k/m and c/m affect the motion, so this trades against stiffness"
                onChange={(mass) => set({ kind: "spring", spring: { ...spring!, mass } })}
              />
              <Num
                label="vel"
                value={spring!.velocity}
                step={0.5}
                title="Initial velocity — a shove at t=0"
                onChange={(velocity) =>
                  set({ kind: "spring", spring: { ...spring!, velocity } })
                }
              />
            </div>
            <dl className="text-ash grid grid-cols-3 gap-x-3 font-mono text-[10px] lowercase">
              <div>
                {/* Not uppercased — CSS text-transform turns ζ into Ζ. */}
                <dt className="tracking-wide">ζ damping</dt>
                <dd className={cn("text-ink", d!.regime === "underdamped" && "text-amber-500")}>
                  {d!.dampingRatio.toFixed(2)} {REGIME_LABEL[d!.regime]}
                </dd>
              </div>
              <div>
                <dt className="tracking-wide">peak</dt>
                <dd className="text-ink">{overshoot(spring!).peak.toFixed(3)}</dd>
              </div>
              <div>
                <dt className="tracking-wide">settles</dt>
                <dd className="text-ink">{motionSettlingTime(spring!)}ms</dd>
              </div>
            </dl>
            <p className="text-ash mt-2 flex items-start gap-1.5 text-[11px] leading-snug">
              <Warning size={12} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                A spring has no duration — {motionSettlingTime(spring!)}ms is where Framer
                Motion decides it's close enough. Other runtimes pick differently.
              </span>
            </p>
          </>
        )}
      </div>
    </section>
  )
}
