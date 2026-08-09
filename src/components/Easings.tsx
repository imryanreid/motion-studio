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
import { AnimatePresence, motion } from "motion/react"
import { CaretDown, CaretRight, LinkBreak, LinkSimple } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import { DUR, EASE_PANEL } from "../shared/motion"
import Segmented from "../shared/components/Segmented"
import { PanelTitle } from "../shared/components/Label"
import CurvePlot from "./CurvePlot"
import { FIELD_TEXT, FieldStack, NumberField, ReadOut, TextField } from "./Field"
import Menu, { ChipGroup } from "./Menu"
import { BEZIER_PRESETS, Y_MAX, Y_MIN } from "../lib/bezier"
import { SPRING_PRESETS, derive, overshoot, motionSettlingTime } from "../lib/spring"
import {
  DEFAULT_BEZIER,
  DEFAULT_SPRING,
  ENTRY_LIMIT,
  NAME_MAX,
  PURPOSE_FALLBACK,
  PURPOSE_IDS,
  STAGGER_DECAY,
  baseSlug,
  entryForPurpose,
  TRANSFORMS,
  enterMs,
  exitMs,
  generateSet,
  nextId,
  presetIdFor,
  purposesUsing,
  staggerDelay,
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
  // "1:1" rather than "Duplicate": beside Faster and Slower it reads as the
  // ratio it is, and the menu heading already says duplicate.
  { id: "duplicate", label: "1:1", title: "An exact copy" },
  { id: "faster", label: "Faster", title: "Same character, shorter" },
  { id: "slower", label: "Slower", title: "Same character, longer" },
  {
    id: "softer",
    label: "Softer",
    title: "Flatter curve, or a spring with the bounce damped out",
  },
  { id: "sharper", label: "Sharper", title: "More attack, or a springier spring" },
]

const CUSTOM = "custom"

/**
 * Swap one block for another without the layout jumping.
 *
 * `popLayout` takes the outgoing copy out of flow, so the incoming one lands
 * in the same place rather than stacking under it. Switching type used to
 * animate the Bezier/Spring pill and then cut instantly to a different set of
 * presets and a different set of fields — the one control that moved was the
 * one that mattered least.
 */
function Swap({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: DUR.swap, ease: EASE_PANEL }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

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
  {
    key: "stiffness",
    short: "stiff",
    step: 10,
    min: 1,
    max: 2000,
    title: "Stiffness — how hard the spring pulls",
  },
  {
    key: "damping",
    short: "damp",
    step: 1,
    min: 0,
    max: 200,
    title: "Damping — how fast the oscillation dies",
  },
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
      entries: [
        ...state.entries,
        {
          ...base,
          id,
          name: `${from.name} ${how === "duplicate" ? "copy" : how}`.slice(0, NAME_MAX),
        },
      ],
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
      {/*
        A fixed minimum height, matched to the Preview header beside it. The
        two panels sit side by side and their headers were three pixels apart,
        because this one's tallest control is an h-7 button and that one's is a
        small Segmented, which computes to 31. Pinning the header rather than
        the controls means whatever lands in either header later, the two still
        line up. (The underlying mismatch — h-7 everywhere except Segmented sm
        — is a shared-layer fix that belongs upstream in Ramps.)
      */}
      <div className="border-line flex min-h-[3.25rem] flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <PanelTitle>
          Easings <span className="text-ash font-normal">({state.entries.length})</span>
        </PanelTitle>
        <div className="flex items-center gap-2">
          {/*
            Generate replaces the whole set, so it asks which motion to build
            from — and naming the source is the confirmation, since picking one
            by name is deliberate enough on its own.
          */}
          <Menu
            label="Generate a set"
            triggerLabel="Regenerate…"
            width="w-72"
            groups={[
              {
                heading: "Create a new set of easings based on one of your existing variants:",
                items: state.entries.map((e) => ({
                  id: e.id,
                  label: e.name,
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

        return (
          /*
            `layout` earns two things at once: the row animates its own height
            as it expands, and every row below it slides down rather than
            jumping. overflow-hidden is what turns the height change into a
            reveal instead of the new content spilling out of a growing box.

            Reduced motion is handled upstream — ToolShell wraps the app in
            MotionConfig reducedMotion="user", and the CSS block in tokens.css
            covers the non-Motion transitions.
          */
          <div
            key={e.id}
            className={cn(
              "transition-colors",
              // The section draws its own bottom edge, so the last row must
              // not draw one too — two 1px strokes on the same line read as a
              // single heavier one, which is the only place the panel looked
              // bottom-weighted.
              "border-line/60 relative border-b last:border-b-0",
              open && "bg-ink/[0.03]",
            )}
          >
            {/*
              Centred in a band whose height this knows, rather than nudged to
              a magic offset: open, the band is the 16px label row; closed, the
              24px summary row. Both are placed so their centres land on the
              same y, which is what keeps the chevron still when you toggle a
              row AND centred within whatever it sits beside.
            */}
            <button
              type="button"
              onClick={() => onSelect(open ? "" : e.id)}
              aria-expanded={open}
              aria-label={open ? `Collapse ${e.name}` : `Edit ${e.name}`}
              className={cn(
                "text-ash hover:text-ink absolute left-3 z-10 flex items-center transition-colors",
                open ? "top-3 h-4" : "top-2 h-6",
              )}
            >
              {open ? (
                <CaretDown size={11} weight="bold" />
              ) : (
                <CaretRight size={11} weight="bold" />
              )}
            </button>

            {/*
              Two independent height animations rather than one `layout` on the
              row.

              `layout` animates a box by SCALING it, so the body rendered at
              full size and was squashed into a growing frame — which is what
              made expanding look like the content appeared over the page and
              then settled into place. Animating real height means the content
              is genuinely clipped as it grows, and fading it in over the same
              beat means nothing is legible before there is room for it.

              Summary and body animate at once, so as one collapses the other
              grows and the row's height is continuous. Nothing below needs a
              layout animation to follow: real height reflows the page.
            */}
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    height: { duration: DUR.panel, ease: EASE_PANEL },
                    opacity: { duration: DUR.swap, ease: EASE_PANEL },
                  }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-3 py-3 pr-3 pl-8">
                    {/*
                  Labels, chevron and the overflow icon share one 16px band, so
                  all three sit on a single centre line; the controls they name
                  sit under it. The overflow lost its bordered box to make that
                  possible — at h-7 it could only ever centre on the fields.
                */}
                    <div>
                      <div className="text-ash flex h-4 items-center gap-3 font-mono text-[10px] tracking-wide uppercase">
                        <span className={FIELD_TEXT}>Name</span>
                        <span className="w-44">Components</span>
                        <Menu
                          width="w-44"
                          bare
                          wrapperClassName="ml-auto"
                          label={`Actions for ${e.name}`}
                          groups={[
                            {
                              heading: "Duplicate variant",
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

                      <div className="mt-1 flex items-center gap-3">
                        <TextField
                          ariaLabel="Motion name"
                          value={e.name}
                          maxLength={NAME_MAX}
                          onChange={(v) => patch(e.id, { name: sanitizeName(v) })}
                        />
                        {/*
                      A component belongs to exactly one motion, so the two
                      directions are not the same operation and don't get the
                      same interaction.

                      CLAIMING is unambiguous — one click takes a component
                      from wherever it was, and the row says whose it was.

                      RELEASING is not. "This component no longer uses me"
                      leaves it pointing at nothing, which the model has no way
                      to represent and an export has no way to emit. So a row
                      this motion already owns drills into "move it where?"
                      instead of offering a tick you can't untick. The checkbox
                      was promising an operation that doesn't exist.
                    */}
                        <Menu
                          label={`Components using ${e.name}`}
                          triggerLabel={
                            used.length ? `${used.length} · ${used.join(", ")}` : "None"
                          }
                          triggerClassName="w-44 justify-between"
                          align="left"
                          width="w-60"
                          groups={[
                            {
                              heading: `Which components use ${e.name}?`,
                              items: PURPOSE_IDS.map((p) => {
                                const owner = entryForPurpose(state, p)
                                const mine = owner.id === e.id
                                const assign = (entryId: string) =>
                                  onChange({
                                    ...state,
                                    purposeEntry: { ...state.purposeEntry, [p]: entryId },
                                  })
                                return {
                                  id: p,
                                  label: p,
                                  checked: mine,
                                  note: mine ? undefined : owner.name,
                                  keepOpen: !mine,
                                  title: mine
                                    ? `${p} uses ${e.name} — move it to another motion`
                                    : `${p} currently uses ${owner.name} — this moves it here`,
                                  onSelect: () => !mine && assign(e.id),
                                  submenu: mine
                                    ? {
                                        heading: `Move ${p} to…`,
                                        items: state.entries
                                          .filter((v) => v.id !== e.id)
                                          .map((v) => ({
                                            id: v.id,
                                            label: v.name,
                                            title: `${p} will use ${v.name}`,
                                            onSelect: () => assign(v.id),
                                          })),
                                      }
                                    : undefined,
                                }
                              }),
                            },
                          ]}
                        />
                      </div>
                    </div>

                    {slug[e.id] !== baseSlug(e.name) && (
                      <p className="text-ash font-mono text-[10px]">
                        Exports as <span className="text-ink">motion.{slug[e.id]}</span> —
                        another motion already claimed{" "}
                        <span className="text-ink">{baseSlug(e.name)}</span>.
                      </p>
                    )}

                    {/* Kind, then which named shape of that kind — adjacent, because
                    the second is a function of the first. */}
                    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
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
                    </div>

                    {/*
                  The curve and the numbers that describe it are one thing, so
                  they share one surface. Loose on the panel they had no edges,
                  and the handles could be dragged toward a boundary that was
                  not drawn anywhere.

                  `bg-paper`, not a partial. It was `bg-paper/40` over a tinted
                  row — 40% of the way back to base, which is a surface nothing
                  else on the page uses, so it matched neither the row it sat
                  on nor the inputs beside it.

                  Full paper is the base surface, exactly what the inputs use.
                  Which side of the row that lands on does flip by theme, since
                  a tint moves toward ink: a card in light, a well in dark.
                  That flip is inherent to tinting rather than a bug, and it is
                  fine as long as one element doesn't sit on a third surface of
                  its own — which is what the partial was doing.
                */}
                    <div className="border-line/60 bg-paper flex w-full max-w-[420px] flex-col gap-3 rounded-lg border p-3">
                      <CurvePlot
                        easing={e.easing}
                        onChange={
                          e.easing.kind === "bezier"
                            ? (bezier) => patch(e.id, { easing: { kind: "bezier", bezier } })
                            : undefined
                        }
                      />

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
                                    min={k.startsWith("x") ? 0 : Y_MIN}
                                    max={k.startsWith("x") ? 1 : Y_MAX}
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
                                        easing: {
                                          kind: "spring",
                                          spring: { ...spring!, [f.key]: v },
                                        },
                                      })
                                    }
                                  />
                                ))}
                          </div>
                        </FieldStack>
                      )}
                    </div>

                    {/*
                  Timing sits last because it modifies a shape you have already
                  chosen. A spring has no duration and no exit share; what it
                  has instead is a settling time, explained on hover rather
                  than in a paragraph permanently restating the caveat.

                  Stagger is here for both types — it is a delay between
                  children, not a property of the curve.
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
                              title="Damping ratio: c / (2*sqrt(k*m)). Below 1 the spring overshoots and comes back; at 1 it is critical — the quickest arrival with no bounce at all; above 1 it crawls in."
                            >
                              {/*
                            Was amber, which was the only hard-coded palette
                            colour in the app — against the family's five-token
                            rule — and scored about 2:1 on a light background.
                            The word already says it bounces; the colour was
                            saying the same thing less legibly.
                          */}
                              {d!.dampingRatio.toFixed(2)} {REGIME_LABEL[d!.regime]}
                            </ReadOut>
                          </FieldStack>
                          <div
                            className="bg-line mx-1 mb-1 h-6 w-px shrink-0"
                            aria-hidden="true"
                          />
                        </>
                      ) : (
                        <>
                          {/*
                        Linked, the two fields join into one control — the same
                        way Figma joins W and H — and the exit is a share of the
                        entrance that stays proportional when you retime it.
                        Broken, they separate and the exit is its own number.
                        Both values persist, so toggling loses neither.
                      */}
                          {/*
                        Fixed width on the pair, with the fields flexing inside
                        it, so the right edge — and therefore the link button —
                        lands on the same pixel whether they are joined or
                        apart. Sized by content, the 8px gap pushed the button
                        sideways every time you toggled the link.
                      */}
                          <div className="flex w-[11.5rem] items-end">
                            <div
                              className={cn(
                                "flex min-w-0 flex-1 items-end",
                                e.exitLinked ? "gap-0" : "gap-2",
                              )}
                            >
                              <FieldStack label="Enter" className="min-w-0 flex-1 shrink">
                                <NumberField
                                  ariaLabel={`${e.name} duration in milliseconds`}
                                  value={e.durationMs}
                                  min={20}
                                  max={9000}
                                  step={10}
                                  suffix="ms"
                                  width="w-full"
                                  boxClassName={e.exitLinked ? "rounded-r-none" : undefined}
                                  title="How long the entrance runs."
                                  onChange={(durationMs) => patch(e.id, { durationMs })}
                                />
                              </FieldStack>

                              <FieldStack label="Exit" className="min-w-0 flex-1 shrink">
                                {e.exitLinked ? (
                                  <NumberField
                                    ariaLabel={`${e.name} exit as a percentage of the entrance`}
                                    value={Math.round(e.exitRatio * 100)}
                                    min={20}
                                    max={130}
                                    step={5}
                                    suffix="%"
                                    width="w-full"
                                    boxClassName="-ml-px rounded-l-none"
                                    title="The exit is this share of the entrance, on the mirrored curve. Exits should be quicker — lingering on something you've finished with reads as lag."
                                    onChange={(pct) => patch(e.id, { exitRatio: pct / 100 })}
                                  />
                                ) : (
                                  <NumberField
                                    ariaLabel={`${e.name} exit duration in milliseconds`}
                                    value={e.exitAbsoluteMs}
                                    min={20}
                                    max={9000}
                                    step={10}
                                    suffix="ms"
                                    width="w-full"
                                    title="The exit's own duration, on the mirrored curve. It no longer follows the entrance."
                                    onChange={(exitAbsoluteMs) =>
                                      patch(e.id, { exitAbsoluteMs })
                                    }
                                  />
                                )}
                              </FieldStack>
                            </div>

                            <button
                              type="button"
                              onClick={() => patch(e.id, { exitLinked: !e.exitLinked })}
                              aria-pressed={e.exitLinked}
                              aria-label={`Link ${e.name} exit to its entrance`}
                              title={
                                e.exitLinked
                                  ? `Exit follows the entrance — ${exitMs(e)}ms. Click to give it its own duration.`
                                  : "Exit stands alone. Click to make it a share of the entrance."
                              }
                              className={cn(
                                "ml-1.5 flex h-8 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
                                e.exitLinked
                                  ? "border-ink/30 bg-ink/[0.06] text-ink"
                                  : "border-line text-ash hover:border-ink/30 hover:text-ink",
                              )}
                            >
                              {e.exitLinked ? (
                                <LinkSimple size={12} weight="bold" />
                              ) : (
                                <LinkBreak size={12} weight="bold" />
                              )}
                            </button>
                          </div>

                          {/* Stagger is a different kind of thing from the pair
                          beside it, so it gets a rule rather than just a gap. */}
                          <div
                            className="bg-line mx-1 mb-1 h-6 w-px shrink-0"
                            aria-hidden="true"
                          />
                        </>
                      )}

                      <FieldStack label="Stagger">
                        <NumberField
                          ariaLabel={`${e.name} stagger in milliseconds`}
                          value={e.staggerMs}
                          min={0}
                          max={400}
                          step={5}
                          suffix="ms"
                          title={`Per-child offset when this motion enters as a group, falling off as index^${STAGGER_DECAY} so a long list doesn't take proportionally longer. Five rows would start at ${[1, 2, 3, 4].map((i) => staggerDelay(e, i)).join(", ")}ms.`}
                          onChange={(staggerMs) => patch(e.id, { staggerMs })}
                        />
                      </FieldStack>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {!open && (
                <motion.div
                  key="summary"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    height: { duration: DUR.panel, ease: EASE_PANEL },
                    opacity: { duration: DUR.swap, ease: EASE_PANEL },
                  }}
                  className="overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => onSelect(e.id)}
                    aria-expanded={false}
                    className="hover:bg-ink/[0.05] flex h-10 w-full items-center gap-3 py-2 pr-3 pl-8 text-left transition-colors"
                  >
                    <span className="text-ash w-[6.5rem] shrink-0 truncate font-mono text-xs">
                      {e.name}
                    </span>
                    <CurvePlot easing={e.easing} thumb className="w-12 shrink-0" />
                    <span className="text-ink shrink-0 font-mono text-[11px]">
                      {enterMs(e)}ms <span className="text-ash">enter</span> / {exitMs(e)}ms{" "}
                      <span className="text-ash">exit{spring && " settling"}</span>
                    </span>
                    <span className="text-ash ml-auto truncate pl-2 text-right text-[11px]">
                      {used.length ? used.join(", ") : "—"}
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </section>
  )
}
