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
// Every field is a label over an h-8 control and
// every small button is h-7, which is what makes a
// row of them line up.
//
// Top to bottom the row reads as one decision chain:
// what kind of easing this is, which named shape of
// that kind, what it looks like, and only then how
// long it runs. Duration and exit modify a shape you
// have already chosen, so they sit after it.
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
import { CaretDown, CaretRight } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import Segmented from "../shared/components/Segmented"
import { PanelTitle } from "../shared/components/Label"
import CurvePlot from "./CurvePlot"
import { FieldStack, NumberField, ReadOut, TextField } from "./Field"
import Menu, { ChipGroup } from "./Menu"
import { BEZIER_PRESETS } from "../lib/bezier"
import { SPRING_PRESETS, derive, overshoot, motionSettlingTime } from "../lib/spring"
import {
  DEFAULT_BEZIER,
  DEFAULT_SPRING,
  ENTRY_LIMIT,
  NAME_MAX,
  PURPOSE_FALLBACK,
  baseSlug,
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

/** The four spring parameters, in the order they're worth thinking about. */
const SPRING_FIELDS: {
  key: "stiffness" | "damping" | "mass" | "velocity"
  /** Named inside its own box — for a physics parameter the unit IS the name. */
  short: string
  step: number
  min?: number
  max?: number
  title: string
}[] = [
  { key: "stiffness", short: "stiff", step: 10, min: 1, max: 2000, title: "Stiffness — how hard the spring pulls" },
  { key: "damping", short: "damp", step: 1, min: 0, max: 200, title: "Damping — how fast the oscillation dies" },
  {
    key: "mass",
    short: "mass",
    step: 0.1,
    min: 0.1,
    max: 10,
    title: "Mass — only k/m and c/m affect the motion, so this trades against stiffness",
  },
  // Deliberately unbounded: a shove can go either way, and hard.
  { key: "velocity", short: "vel", step: 0.5, title: "Initial velocity — a shove at t=0" },
]

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
  }

  return (
    <section className="border-line flex flex-col overflow-hidden rounded-lg border">
      <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <PanelTitle>Easings</PanelTitle>
        <div className="flex items-center gap-2">
          <span className="text-ash font-mono text-[10px]">
            {state.entries.length} motion{state.entries.length === 1 ? "" : "s"}
          </span>
          {/*
            Generate replaces the whole set, so it asks which motion to build
            from — and naming the source is the confirmation, since picking one
            by name is deliberate enough on its own.
          */}
          <Menu
            label="Generate a set"
            triggerLabel="Generate set"
            groups={[
              {
                heading: `Replace all ${state.entries.length} with`,
                items: state.entries.map((e) => ({
                  id: e.id,
                  label: `a set from ${e.name}`,
                  title: `Build subtle / standard / emphasized from ${e.name}. Siblings inherit its type and differ in duration only.`,
                  onSelect: () => generateFrom(e),
                })),
              },
            ]}
          />
        </div>
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
                  <TextField
                    ariaLabel="Motion name"
                    value={e.name}
                    maxLength={NAME_MAX}
                    onChange={(v) => patch(e.id, { name: sanitizeName(v) })}
                  />
                </FieldStack>

                {/* Type is the decision the presets below hang off. */}
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
                {/*
                  The export name is only worth saying when it isn't the one
                  you'd guess — which is exactly when two motions share a name
                  and the second gets a suffix. Otherwise it repeated what the
                  Name field already says, next to a purpose list the collapsed
                  row and the Output table both already carry.
                */}
                {slug[e.id] !== baseSlug(e.name) && (
                  <p className="text-ash font-mono text-[10px]">
                    Exports as <span className="text-ink">motion.{slug[e.id]}</span> — another
                    motion already claimed <span className="text-ink">{baseSlug(e.name)}</span>.
                  </p>
                )}

                {/*
                  The shape, chosen by name, and a function of the type above.
                  Which chip is lit comes from comparing the current values to
                  each preset, so dragging a handle lands on Custom without
                  anything having to notice.
                */}
                <FieldStack label="Shape" className="shrink">
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
                </FieldStack>

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

                {isCustom && (
                  <FieldStack label={e.easing.kind === "bezier" ? "Handles" : "Physics"}>
                    <div className="flex gap-2">
                      {e.easing.kind === "bezier"
                        ? (["x1", "y1", "x2", "y2"] as const).map((k) => (
                            <NumberField
                              key={k}
                              ariaLabel={`${e.name} ${k}`}
                              suffix={k}
                              value={e.easing.kind === "bezier" ? e.easing.bezier[k] : 0}
                              step={0.01}
                              min={k.startsWith("x") ? 0 : undefined}
                              max={k.startsWith("x") ? 1 : undefined}
                              title={
                                k.startsWith("x")
                                  ? `${k} — handle position in time`
                                  : `${k} — handle position in progress. Outside 0–1 overshoots.`
                              }
                              onChange={(v) =>
                                e.easing.kind === "bezier" &&
                                patch(e.id, {
                                  easing: {
                                    kind: "bezier",
                                    bezier: { ...e.easing.bezier, [k]: v },
                                  },
                                })
                              }
                            />
                          ))
                        : SPRING_FIELDS.map((f) => (
                            <NumberField
                              key={f.key}
                              ariaLabel={`${e.name} ${f.key}`}
                              suffix={f.short}
                              value={spring![f.key]}
                              step={f.step}
                              min={f.min}
                              max={f.max}
                              title={f.title}
                              onChange={(v) =>
                                patch(e.id, {
                                  easing: { kind: "spring", spring: { ...spring!, [f.key]: v } },
                                })
                              }
                            />
                          ))}
                    </div>
                  </FieldStack>
                )}

                {/*
                  Timing sits last because it modifies a shape you have already
                  chosen: kind, then which one, then what it looks like, then
                  how long it runs.

                  A spring has none of it. What it has instead is a settling
                  time — and the explanation for that lives on hover here
                  rather than in a paragraph that was permanently shouting a
                  caveat at someone who had already read it.
                */}
                <div className="border-line/60 flex flex-wrap items-end gap-x-3 gap-y-2 border-t pt-3">
                  {spring ? (
                    <>
                      <FieldStack label="Settles">
                        <ReadOut
                          title={`A spring has no duration — it approaches its target asymptotically and never arrives. ${motionSettlingTime(spring)}ms is where Framer Motion decides it's close enough. Other runtimes pick a different threshold and will honestly report a different number, which is why there is no duration field here.`}
                        >
                          ~{enterMs(e)}ms
                        </ReadOut>
                      </FieldStack>
                      <FieldStack label="ζ damping">
                        <ReadOut
                          width="w-32"
                          title={`Damping ratio: c / (2*sqrt(k*m)). Below 1 the spring overshoots and comes back; at 1 it is critical — the quickest arrival with no bounce at all; above 1 it crawls in.`}
                        >
                          <span className={cn(d!.regime === "underdamped" && "text-amber-500")}>
                            {d!.dampingRatio.toFixed(2)} {REGIME_LABEL[d!.regime]}
                          </span>
                        </ReadOut>
                      </FieldStack>
                      <FieldStack label="Peak">
                        <ReadOut title="How far past its target the spring travels at the top of its first overshoot. 1.0 means it never passes it.">
                          {overshoot(spring).peak.toFixed(3)}
                        </ReadOut>
                      </FieldStack>
                    </>
                  ) : (
                    <>
                      <FieldStack label="Duration">
                        <NumberField
                          ariaLabel={`${e.name} duration in milliseconds`}
                          value={e.durationMs}
                          min={20}
                          max={9000}
                          step={10}
                          suffix="ms"
                          title="How long the entrance runs."
                          onChange={(durationMs) => patch(e.id, { durationMs })}
                        />
                      </FieldStack>
                      <FieldStack label="Exit">
                        <NumberField
                          ariaLabel={`${e.name} exit as a percentage of the entrance`}
                          value={Math.round(e.exitRatio * 100)}
                          min={20}
                          max={130}
                          step={5}
                          suffix="%"
                          title="The exit is this share of the entrance, on the mirrored curve. Exits should be quicker — lingering on something you've finished with reads as lag."
                          onChange={(pct) => patch(e.id, { exitRatio: pct / 100 })}
                        />
                      </FieldStack>
                      <FieldStack label="Exit runs">
                        <ReadOut title="Derived, not authored — the exit share applied to the duration beside it.">
                          {exitMs(e)}ms
                        </ReadOut>
                      </FieldStack>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
