// ==============================================
// EASINGS
// The list. One row per motion, one expanded at a
// time, each row owning everything about itself.
//
// A row shows only the controls its type actually
// has. A spring has no duration field and no exit
// share — not a greyed one, not one with a footnote.
// It settles when it settles, and nothing here forces
// a slot on it.
//
// Expanding a row REPLACES its summary rather than
// pushing a body underneath it: the same strip of
// space becomes the first row of editable fields, so
// the name and duration appear once instead of twice.
// Every field is a label over an h-8 control, which
// is what makes them line up across the row.
//
// The shape is chosen from named presets, and the
// numbers only appear when you're past them. Which
// preset is selected is DERIVED from the values, not
// stored — drag a handle and "Custom" selects itself,
// because a stored flag could disagree with the curve
// it claims to name.
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
import { CaretDown, CaretRight, Warning, X } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import Segmented from "../shared/components/Segmented"
import { PanelTitle } from "../shared/components/Label"
import CurvePlot from "./CurvePlot"
import { InlineNumber } from "./Field"
import Menu, { ChipGroup, FieldStack } from "./Menu"
import { BEZIER_PRESETS } from "../lib/bezier"
import { SPRING_PRESETS, derive, overshoot, motionSettlingTime } from "../lib/spring"
import {
  DEFAULT_BEZIER,
  DEFAULT_SPRING,
  ENTRY_LIMIT,
  NAME_MAX,
  PURPOSE_FALLBACK,
  TRANSFORMS,
  enterMs,
  exitMs,
  generateSet,
  nextId,
  presetIdFor,
  purposesUsing,
  sanitizeName,
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

const CUSTOM = "custom"

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
  // Generate replaces the whole set, so it asks which motion to build from —
  // which is also the confirmation, since naming the source is a deliberate
  // act. That question used to be a permanent "primary" radio on every row: a
  // persistent control for a momentary decision, in a model whose whole rule
  // is that nothing between entries persists.
  const [picking, setPicking] = useState(false)
  // Which row has had Custom clicked explicitly. A row whose values match no
  // preset is custom regardless — this only covers "I want the numbers" while
  // still sitting exactly on a preset.
  const [customFor, setCustomFor] = useState<string | null>(null)

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
    onChange({
      ...state,
      entries: [...state.entries, { ...base, id, name: `${from.name} ${how}`.slice(0, NAME_MAX) }],
    })
    onSelect(id)
  }

  const remove = (id: string) => {
    if (state.entries.length <= 1) return
    const entries = state.entries.filter((e) => e.id !== id)
    // Nothing may point at a gap: any purpose using it falls back to whatever
    // is left, so a delete can never strand a reference.
    const purposeEntry = { ...state.purposeEntry }
    for (const k of Object.keys(purposeEntry) as (keyof typeof purposeEntry)[]) {
      if (purposeEntry[k] === id) purposeEntry[k] = entries[0].id
    }
    onChange({ ...state, entries, purposeEntry })
    if (selectedId === id) onSelect(entries[0].id)
  }

  const generateFrom = (source: MotionEntry) => {
    onChange({
      ...state,
      entries: generateSet(source),
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
    onSelect(PURPOSE_FALLBACK)
    setPicking(false)
  }

  return (
    <section className="border-line flex flex-col overflow-hidden rounded-lg border">
      <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <PanelTitle>Easings</PanelTitle>
        {picking ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-ash mr-1 font-mono text-[10px]">
              Replace all {state.entries.length} with a set from
            </span>
            {state.entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => generateFrom(e)}
                title={`Build subtle / standard / emphasized from ${e.name}. Siblings inherit its type.`}
                className={cn(chip, "max-w-[7rem] truncate")}
              >
                {e.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicking(false)}
              aria-label="Cancel"
              className="text-ash hover:text-ink ml-0.5"
            >
              <X size={11} weight="bold" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-ash font-mono text-[10px]">
              {state.entries.length} motion{state.entries.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setPicking(true)}
              title="Build the three-level set from one of these motions. Siblings inherit its type and differ in duration only."
              className={chip}
            >
              Generate set
            </button>
          </div>
        )}
      </div>

      {state.entries.map((e) => {
        const open = e.id === selectedId
        const spring = e.easing.kind === "spring" ? e.easing.spring : null
        const d = spring ? derive(spring) : null
        const used = purposesUsing(state, e.id)
        const presetId = presetIdFor(e.easing)
        const isCustom = presetId === null || customFor === e.id
        const presets = spring ? SPRING_PRESETS : BEZIER_PRESETS

        const caret = (
          <button
            type="button"
            onClick={() => onSelect(open ? "" : e.id)}
            aria-expanded={open}
            aria-label={open ? `Collapse ${e.name}` : `Edit ${e.name}`}
            className="text-ash hover:text-ink shrink-0 transition-colors"
          >
            {open ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
          </button>
        )

        return (
          <div key={e.id} className={cn("border-line/60 border-b", open && "bg-ink/[0.02]")}>
            {open ? (
              /* The header IS the first row of fields — no summary above it. */
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2 px-3 pt-3 pb-2">
                <div className="flex h-8 shrink-0 items-center">{caret}</div>

                <FieldStack label="Name">
                  <input
                    type="text"
                    value={e.name}
                    maxLength={NAME_MAX}
                    aria-label="Motion name"
                    onChange={(ev) => patch(e.id, { name: sanitizeName(ev.target.value) })}
                    className="border-line bg-paper text-ink hover:border-ink/30 focus-visible:ring-ink/30 h-8 w-36 rounded-md border px-2 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  />
                </FieldStack>

                <FieldStack label="Type">
                  <Segmented
                    ariaLabel={`${e.name} curve type`}
                    layoutId={`kind-${e.id}`}
                    size="sm"
                    value={e.easing.kind}
                    onChange={(kind) => {
                      // Both defaults are named presets, so a type switch has
                      // to drop a sticky Custom or it would land on a preset
                      // and claim not to be on one.
                      setCustomFor(null)
                      patch(e.id, {
                        easing:
                          kind === "spring"
                            ? { kind: "spring", spring: DEFAULT_SPRING }
                            : { kind: "bezier", bezier: DEFAULT_BEZIER },
                      })
                    }}
                    options={MODE_OPTIONS}
                  />
                </FieldStack>

                {/* Duration and exit exist only where they mean something. */}
                {spring ? (
                  <FieldStack label="Settles">
                    <span
                      className="text-ash font-mono text-xs"
                      title="A spring has no duration. This is where Framer Motion decides it's close enough — other runtimes pick differently."
                    >
                      ~{enterMs(e)}ms
                    </span>
                  </FieldStack>
                ) : (
                  <>
                    <FieldStack label="Duration">
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
                    </FieldStack>
                    <FieldStack label="Exit">
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
                    </FieldStack>
                  </>
                )}

                <div className="ml-auto flex h-8 items-center">
                  <Menu
                    label={`Actions for ${e.name}`}
                    groups={[
                      {
                        heading: "New from this",
                        items: DERIVATIONS.map((t) => ({
                          id: t.id,
                          label: t.label,
                          title: full ? `${ENTRY_LIMIT} motions is the limit` : t.title,
                          disabled: full,
                          onSelect: () => derived(e, t.id),
                        })),
                      },
                      {
                        items: [
                          {
                            id: "delete",
                            label: "Delete",
                            danger: true,
                            separated: true,
                            disabled: state.entries.length <= 1,
                            title:
                              state.entries.length <= 1
                                ? "The last motion can't be deleted"
                                : `Delete ${e.name}`,
                            onSelect: () => remove(e.id),
                          },
                        ],
                      },
                    ]}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(e.id)}
                aria-expanded={false}
                className="hover:bg-ink/[0.03] flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
              >
                <CaretRight size={11} weight="bold" className="text-ash shrink-0" />
                <span className="text-ash w-[6.5rem] shrink-0 truncate font-mono text-xs">
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
            )}

            {open && (
              <div className="flex flex-col gap-3 px-4 pb-4">
                <p className="text-ash font-mono text-[10px]">
                  <span title="What this exports as">motion.{slug[e.id]}</span>
                  {" · "}
                  {used.length ? `used for ${used.join(", ")}` : "nothing uses this yet"}
                </p>

                {/*
                  The shape, chosen by name. Which chip is lit comes from
                  comparing the current values to each preset, so dragging a
                  handle lands on Custom without anything having to notice.
                */}
                <ChipGroup
                  ariaLabel={`${e.name} shape`}
                  value={isCustom ? CUSTOM : presetId}
                  options={[
                    ...presets.map((p) => ({
                      id: p.id,
                      label: p.label,
                      title: "zeta" in p ? `damping ratio ${p.zeta}` : undefined,
                    })),
                    { id: CUSTOM, label: "Custom", title: "Type the numbers yourself" },
                  ]}
                  onChange={(id) => {
                    if (id === CUSTOM) {
                      setCustomFor(e.id)
                      return
                    }
                    setCustomFor(null)
                    const preset = presets.find((p) => p.id === id)!
                    patch(e.id, {
                      easing:
                        "zeta" in preset
                          ? { kind: "spring", spring: preset.value }
                          : { kind: "bezier", bezier: preset.value },
                    })
                  }}
                />

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

                {isCustom &&
                  (e.easing.kind === "bezier" ? (
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
                  ) : (
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
                  ))}

                {spring && (
                  <>
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
                        <dd className="text-ink">{overshoot(spring).peak.toFixed(3)}</dd>
                      </div>
                      <div>
                        <dt className="tracking-wide">settles</dt>
                        <dd className="text-ink">{motionSettlingTime(spring)}ms</dd>
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
                        A spring has no duration — {motionSettlingTime(spring)}ms is where Framer
                        Motion decides it's close enough. Other runtimes pick differently, which
                        is why there's no duration field here.
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
