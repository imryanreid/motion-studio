// ==============================================
// EMPHASIS EDITOR
// The three levels every token is built from, as
// three rows — one expanded, all three visible.
//
// This panel used to be called "Easing" and was
// organised around the mechanism rather than the
// thing you author. An emphasis is a curve AND a
// duration AND the purposes that use it; splitting
// those across two panels and a caption left the
// primary object of the tool with no home, and the
// three tokens you actually ship represented by
// three tab labels.
//
// So the row is the unit. Collapsed it still carries
// its shape, its duration and what reaches for it,
// because comparing three curves is the design
// judgement and you cannot make it one at a time.
//
// Bezier and spring are genuinely different things
// rather than two views of one thing, so switching
// mode replaces the easing rather than converting it.
// A spring with visible bounce has no faithful bezier
// at all, and pretending otherwise is the lie this
// tool exists not to tell.
// ==============================================
import { CaretDown, CaretRight, Warning } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import Segmented from "../shared/components/Segmented"
import { PanelTitle } from "../shared/components/Label"
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
  onLink,
}: {
  state: MotionState
  selected: Emphasis
  onSelect: (e: Emphasis) => void
  onChange: (e: Emphasis, easing: Easing) => void
  onPairChange: (e: Emphasis, d: DurationName) => void
  /**
   * Which step of the scale the pointer is currently implicating, so the
   * panel above can light it up. The tie between an emphasis and its duration
   * was the thing nobody could see; a name and a highlight together say it.
   */
  onLink: (d: DurationName | null) => void
}) {
  const durations = resolveDurations(state)

  return (
    <section className="border-line flex flex-col overflow-hidden rounded-lg border">
      <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <PanelTitle>Emphasis</PanelTitle>
        <span className="text-ash font-mono text-[10px]">
          three levels · every token is one of these
        </span>
      </div>

      {EMPHASIS_NAMES.map((e) => {
        const easing = state.easings[e]
        const open = e === selected
        const pairedWith = state.durationFor[e]
        const used = purposesUsing(state, e)
        const spring = easing.kind === "spring" ? easing.spring : null
        const d = spring ? derive(spring) : null
        const set = (next: Easing) => onChange(e, next)
        // A spring settles when it settles; the paired step is not in effect.
        const effectiveMs = spring ? motionSettlingTime(spring) : durations[pairedWith]

        return (
          <div
            key={e}
            onMouseEnter={() => onLink(spring ? null : pairedWith)}
            onMouseLeave={() => onLink(null)}
            className={cn(
              "border-line/60 border-b last:border-b-0",
              open && "bg-ink/[0.02]",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(e)}
              aria-expanded={open}
              className="hover:bg-ink/[0.03] flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
            >
              <span className="text-ash shrink-0">
                {open ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
              </span>

              <span
                className={cn(
                  "w-[5.5rem] shrink-0 font-mono text-xs",
                  open ? "text-ink" : "text-ash",
                )}
              >
                {e}
              </span>

              {/* The shape, at a size where three of them can be compared. */}
              <CurvePlot easing={easing} thumb className="w-12 shrink-0" />

              <span className="text-ink shrink-0 font-mono text-[11px]">
                {spring ? (
                  <>
                    spring · {effectiveMs}ms <span className="text-ash">settling</span>
                  </>
                ) : (
                  <>
                    {pairedWith} · {effectiveMs}ms
                  </>
                )}
              </span>

              <span className="text-ash ml-auto truncate text-right text-[11px]">
                {used.length ? used.join(", ") : "nothing uses this"}
              </span>
            </button>

            {open && (
              <div className="px-4 pt-1 pb-4">
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Segmented
                    ariaLabel={`${e} curve type`}
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

                  {/* Kept visible on a spring rather than hidden, and marked as
                      not in effect — it comes back the moment you switch to a
                      bezier, and hiding it would make that look like data loss. */}
                  <label
                    className={cn(
                      "text-ash flex items-center gap-2 font-mono text-[11px]",
                      spring && "opacity-45",
                    )}
                    title={
                      spring
                        ? "Not in effect: a spring has no duration, it settles. Restored if you switch to a bezier."
                        : "Which step of the scale above this level reaches for."
                    }
                  >
                    <span className="tracking-[0.16em] uppercase">Duration</span>
                    <select
                      value={pairedWith}
                      onChange={(ev) => onPairChange(e, ev.target.value as DurationName)}
                      onFocus={() => onLink(spring ? null : pairedWith)}
                      aria-label={`Duration for ${e}`}
                      className="border-line bg-paper text-ink hover:border-ink/30 cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors"
                    >
                      {DURATION_NAMES.map((n) => (
                        <option key={n} value={n}>
                          {n} · {durations[n]}ms
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mx-auto mb-3 max-w-[380px]">
                  <CurvePlot
                    easing={easing}
                    onChange={
                      easing.kind === "bezier"
                        ? (bezier) => set({ kind: "bezier", bezier })
                        : undefined
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
                        onChange={(x1) =>
                          set({ kind: "bezier", bezier: { ...easing.bezier, x1 } })
                        }
                      />
                      <Num
                        label="y1"
                        value={easing.bezier.y1}
                        step={0.01}
                        title="First handle, progress. Outside 0–1 overshoots."
                        onChange={(y1) =>
                          set({ kind: "bezier", bezier: { ...easing.bezier, y1 } })
                        }
                      />
                      <Num
                        label="x2"
                        value={easing.bezier.x2}
                        step={0.01}
                        min={0}
                        max={1}
                        title="Second handle, time"
                        onChange={(x2) =>
                          set({ kind: "bezier", bezier: { ...easing.bezier, x2 } })
                        }
                      />
                      <Num
                        label="y2"
                        value={easing.bezier.y2}
                        step={0.01}
                        title="Second handle, progress. Outside 0–1 overshoots."
                        onChange={(y2) =>
                          set({ kind: "bezier", bezier: { ...easing.bezier, y2 } })
                        }
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
                        onChange={(damping) =>
                          set({ kind: "spring", spring: { ...spring!, damping } })
                        }
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
                        <dd
                          className={cn(
                            "text-ink",
                            d!.regime === "underdamped" && "text-amber-500",
                          )}
                        >
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
                      <Warning
                        size={12}
                        weight="fill"
                        aria-hidden="true"
                        className="mt-0.5 shrink-0"
                      />
                      <span>
                        A spring has no duration — {motionSettlingTime(spring!)}ms is where
                        Framer Motion decides it's close enough. Other runtimes pick
                        differently.
                      </span>
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
