// ==============================================
// EASINGS
// The list. One row per motion, one expanded at a
// time, each row owning everything about itself.
//
// This replaced a fixed three-level model sitting on
// top of a five-step duration scale. The two scales
// were two names for one idea, and every legibility
// complaint the tool ever got was about the seam
// between them.
//
// A row shows only the controls its type actually
// has. A spring has no duration field and no exit
// share — not a greyed one, not one with a footnote.
// It settles when it settles, and nothing here forces
// a slot on it.
//
// New entries are seeded from an existing one by a
// named transform rather than by a multiplier, and
// then let go. That is what makes springs work:
// "×1.4" on a settling threshold is meaningless,
// "slower" is not — it scales the frequency and holds
// the damping ratio, so it takes longer and feels
// identical.
// ==============================================
import { useState } from "react"
import { CaretDown, CaretRight, Circle, CircleNotch, Trash, Warning } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import Segmented from "../shared/components/Segmented"
import { PanelTitle } from "../shared/components/Label"
import CurvePlot from "./CurvePlot"
import { InlineNumber, NameField } from "./Field"
import { BEZIER_PRESETS } from "../lib/bezier"
import { derive, overshoot, motionSettlingTime } from "../lib/spring"
import {
  DEFAULT_BEZIER,
  DEFAULT_SPRING,
  ENTRY_LIMIT,
  TRANSFORMS,
  enterMs,
  exitMs,
  generateSet,
  nextId,
  purposesUsing,
  slugs,
  type MotionEntry,
  type MotionState,
  type TransformId,
} from "../lib/tokens"

const MODE_OPTIONS = [
  { id: "bezier" as const, label: "Bezier", title: "Four control points" },
  { id: "spring" as const, label: "Spring", title: "Mass, stiffness, damping" },
]

/** What the damping ratio means, in a word. */
const REGIME_LABEL = {
  underdamped: "bounces",
  critical: "no bounce",
  overdamped: "slow in",
} as const

/**
 * The derivations, in the order they read as a sentence: two about how long,
 * two about how it feels, then an exact copy.
 */
const DERIVATIONS: { id: TransformId | "duplicate"; label: string; title: string }[] = [
  { id: "faster", label: "Faster", title: "Same character, shorter" },
  { id: "slower", label: "Slower", title: "Same character, longer" },
  { id: "softer", label: "Softer", title: "Flatter curve, or a spring with the bounce damped out" },
  { id: "sharper", label: "Sharper", title: "More attack, or a springier spring" },
  { id: "duplicate", label: "Duplicate", title: "An exact copy" },
]

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

/** A quiet action, the family's small-button treatment. */
const chip =
  "border-line text-ash hover:border-ink/30 hover:text-ink rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"

export default function Easings({
  state,
  onChange,
  selectedId,
  onSelect,
}: {
  state: MotionState
  onChange: (s: MotionState) => void
  /** Which row is expanded. Also what the preview marks as affected. */
  selectedId: string
  onSelect: (id: string) => void
}) {
  // Generate replaces the whole set, so it asks first — a confirmation at the
  // one instant it matters, rather than per-entry "don't touch this" state.
  const [confirmGenerate, setConfirmGenerate] = useState(false)
  const slug = slugs(state.entries)
  const full = state.entries.length >= ENTRY_LIMIT

  const patch = (id: string, next: Partial<MotionEntry>) =>
    onChange({
      ...state,
      entries: state.entries.map((e) => (e.id === id ? { ...e, ...next } : e)),
    })

  /** Seed a new entry from an existing one, then let go of the relationship. */
  const derived = (from: MotionEntry, how: TransformId | "duplicate") => {
    if (full) return
    const base = how === "duplicate" ? from : TRANSFORMS[how](from)
    const id = nextId(state.entries)
    const entry: MotionEntry = { ...base, id, name: `${from.name} ${how}`.slice(0, 24) }
    onChange({ ...state, entries: [...state.entries, entry] })
    onSelect(id)
  }

  const remove = (id: string) => {
    if (state.entries.length <= 1) return
    const entries = state.entries.filter((e) => e.id !== id)
    // Nothing may point at a gap: the primary and any purpose using it fall
    // back to whatever is left.
    const primaryId = state.primaryId === id ? entries[0].id : state.primaryId
    const purposeEntry = { ...state.purposeEntry }
    for (const k of Object.keys(purposeEntry) as (keyof typeof purposeEntry)[]) {
      if (purposeEntry[k] === id) purposeEntry[k] = primaryId
    }
    onChange({ ...state, entries, primaryId, purposeEntry })
    if (selectedId === id) onSelect(entries[0].id)
  }

  const generate = () => {
    const primary = state.entries.find((e) => e.id === state.primaryId) ?? state.entries[0]
    const entries = generateSet(primary)
    onChange({
      ...state,
      entries,
      primaryId: "std",
      purposeEntry: {
        state: "sub",
        dropdown: "std",
        tooltip: "std",
        list: "std",
        drawer: "emp",
        modal: "emp",
        toast: "emp",
      },
    })
    onSelect("std")
    setConfirmGenerate(false)
  }

  return (
    <section className="border-line flex flex-col overflow-hidden rounded-lg border">
      <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <PanelTitle>Easings</PanelTitle>
        <div className="flex items-center gap-2">
          <span className="text-ash font-mono text-[10px]">
            {state.entries.length} motion{state.entries.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => (confirmGenerate ? generate() : setConfirmGenerate(true))}
            onBlur={() => setConfirmGenerate(false)}
            title="Build the three-level set from the primary motion. Siblings inherit its type and differ in duration only."
            className={cn(chip, confirmGenerate && "border-ink/40 text-ink")}
          >
            {confirmGenerate ? `Replace all ${state.entries.length}?` : "Generate set"}
          </button>
        </div>
      </div>

      {state.entries.map((e) => {
        const open = e.id === selectedId
        const isPrimary = e.id === state.primaryId
        const spring = e.easing.kind === "spring" ? e.easing.spring : null
        const d = spring ? derive(spring) : null
        const used = purposesUsing(state, e.id)

        return (
          <div key={e.id} className={cn("border-line/60 border-b", open && "bg-ink/[0.02]")}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              {/*
                The primary is not an anchor — nothing tracks it and nothing
                links to it. It is only the entry Generate reads from, which is
                why switching it costs nothing and deleting it is survivable.
              */}
              <button
                type="button"
                onClick={() => onChange({ ...state, primaryId: e.id })}
                aria-pressed={isPrimary}
                title={
                  isPrimary
                    ? "The primary — Generate builds the set from this one"
                    : "Make this the primary Generate reads from"
                }
                className={cn(
                  "shrink-0 transition-colors",
                  isPrimary ? "text-ink" : "text-ash/40 hover:text-ash",
                )}
              >
                {isPrimary ? (
                  <Circle size={10} weight="fill" />
                ) : (
                  <CircleNotch size={10} weight="bold" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onSelect(open ? "" : e.id)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="text-ash shrink-0">
                  {open ? (
                    <CaretDown size={11} weight="bold" />
                  ) : (
                    <CaretRight size={11} weight="bold" />
                  )}
                </span>
                <span
                  className={cn(
                    "w-[6.5rem] shrink-0 truncate font-mono text-xs",
                    open ? "text-ink" : "text-ash",
                  )}
                >
                  {e.name}
                </span>
                <CurvePlot easing={e.easing} thumb className="w-12 shrink-0" />
                <span className="text-ink shrink-0 font-mono text-[11px]">
                  {enterMs(e)}ms
                  {spring && <span className="text-ash"> settling</span>}
                  <span className="text-ash"> · {exitMs(e)} out</span>
                </span>
                <span className="text-ash ml-auto truncate pl-2 text-right text-[11px]">
                  {used.length ? used.join(", ") : "nothing uses this"}
                </span>
              </button>
            </div>

            {open && (
              <div className="flex flex-col gap-3 px-4 pb-4">
                <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                  <NameField
                    value={e.name}
                    slug={slug[e.id]}
                    onChange={(name) => patch(e.id, { name })}
                  />
                  <div className="flex flex-col gap-1">
                    <span className="text-ash font-mono text-[10px] tracking-wide uppercase">
                      Type
                    </span>
                    <Segmented
                      ariaLabel={`${e.name} curve type`}
                      layoutId={`kind-${e.id}`}
                      size="sm"
                      value={e.easing.kind}
                      onChange={(kind) =>
                        patch(e.id, {
                          easing:
                            kind === "spring"
                              ? { kind: "spring", spring: DEFAULT_SPRING }
                              : { kind: "bezier", bezier: DEFAULT_BEZIER },
                        })
                      }
                      options={MODE_OPTIONS}
                    />
                  </div>

                  {/* Duration and exit exist only where they mean something. */}
                  {!spring && (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="text-ash font-mono text-[10px] tracking-wide uppercase">
                          Duration
                        </span>
                        <span className="text-ink font-mono text-sm">
                          <InlineNumber
                            ariaLabel={`${e.name} duration in milliseconds`}
                            value={e.durationMs}
                            min={20}
                            max={9000}
                            width="w-11"
                            suffix="ms"
                            onChange={(durationMs) => patch(e.id, { durationMs })}
                          />
                        </span>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-ash font-mono text-[10px] tracking-wide uppercase">
                          Exit
                        </span>
                        <span
                          className="text-ink font-mono text-sm"
                          title="The exit is this share of the entrance, on the mirrored curve. Exits should be quicker — lingering on something you've finished with reads as lag."
                        >
                          <InlineNumber
                            ariaLabel={`${e.name} exit as a percentage of the entrance`}
                            value={Math.round(e.exitRatio * 100)}
                            min={20}
                            max={130}
                            width="w-7"
                            suffix="%"
                            onChange={(pct) => patch(e.id, { exitRatio: pct / 100 })}
                          />
                        </span>
                      </label>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => remove(e.id)}
                    disabled={state.entries.length <= 1}
                    title={
                      state.entries.length <= 1
                        ? "The last motion can't be deleted"
                        : `Delete ${e.name}`
                    }
                    className={cn(chip, "ml-auto self-end")}
                  >
                    <Trash size={11} weight="regular" aria-hidden="true" />
                  </button>
                </div>

                <div className="mx-auto w-full max-w-[380px]">
                  <CurvePlot
                    easing={e.easing}
                    onChange={
                      e.easing.kind === "bezier"
                        ? (bezier) => patch(e.id, { easing: { kind: "bezier", bezier } })
                        : undefined
                    }
                  />
                </div>

                {e.easing.kind === "bezier" ? (
                  <>
                    <div className="flex gap-2">
                      {(["x1", "y1", "x2", "y2"] as const).map((k) => (
                        <Num
                          key={k}
                          label={k}
                          value={e.easing.kind === "bezier" ? e.easing.bezier[k] : 0}
                          step={0.01}
                          min={k.startsWith("x") ? 0 : undefined}
                          max={k.startsWith("x") ? 1 : undefined}
                          title={
                            k.startsWith("x")
                              ? "Handle position in time"
                              : "Handle position in progress. Outside 0–1 overshoots."
                          }
                          onChange={(v) =>
                            e.easing.kind === "bezier" &&
                            patch(e.id, {
                              easing: { kind: "bezier", bezier: { ...e.easing.bezier, [k]: v } },
                            })
                          }
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {BEZIER_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            patch(e.id, { easing: { kind: "bezier", bezier: p.value } })
                          }
                          className={chip}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Num
                        label="stiff"
                        value={spring!.stiffness}
                        min={1}
                        max={2000}
                        title="Stiffness — how hard the spring pulls"
                        onChange={(stiffness) =>
                          patch(e.id, {
                            easing: { kind: "spring", spring: { ...spring!, stiffness } },
                          })
                        }
                      />
                      <Num
                        label="damp"
                        value={spring!.damping}
                        min={0}
                        max={200}
                        title="Damping — how fast the oscillation dies"
                        onChange={(damping) =>
                          patch(e.id, {
                            easing: { kind: "spring", spring: { ...spring!, damping } },
                          })
                        }
                      />
                      <Num
                        label="mass"
                        value={spring!.mass}
                        step={0.1}
                        min={0.1}
                        max={10}
                        title="Mass — only k/m and c/m affect the motion, so this trades against stiffness"
                        onChange={(mass) =>
                          patch(e.id, { easing: { kind: "spring", spring: { ...spring!, mass } } })
                        }
                      />
                      <Num
                        label="vel"
                        value={spring!.velocity}
                        step={0.5}
                        title="Initial velocity — a shove at t=0"
                        onChange={(velocity) =>
                          patch(e.id, {
                            easing: { kind: "spring", spring: { ...spring!, velocity } },
                          })
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
                    <p className="text-ash flex items-start gap-1.5 text-[11px] leading-snug">
                      <Warning
                        size={12}
                        weight="fill"
                        aria-hidden="true"
                        className="mt-0.5 shrink-0"
                      />
                      <span>
                        A spring has no duration — {motionSettlingTime(spring!)}ms is where
                        Framer Motion decides it's close enough. Other runtimes pick
                        differently, which is why there's no duration field here.
                      </span>
                    </p>
                  </>
                )}

                {/*
                  One-time seeds, not links. The new entry starts from this one
                  and is then entirely its own — change this row later and
                  nothing follows.
                */}
                <div className="border-line/60 flex flex-wrap items-center gap-1 border-t pt-3">
                  <span className="text-ash mr-1 font-mono text-[10px] tracking-wide uppercase">
                    New from this
                  </span>
                  {DERIVATIONS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => derived(e, t.id)}
                      disabled={full}
                      title={full ? `${ENTRY_LIMIT} motions is the limit` : t.title}
                      className={chip}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
