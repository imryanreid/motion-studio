// ==============================================
// OUTPUT
// Every token the page produces, in one table.
//
// Two rows per motion, an entrance and an exit, which
// is exactly what the Easings list shows — the panel
// you edit and the table you ship have the same
// shape. They didn't used to: the editor had five
// duration steps and three mappings, the output had
// six tokens, and nothing lined up.
//
// The Export column is the only control here. Rows
// are otherwise a readout: this is the last place to
// see what you've made before it leaves the page.
// ==============================================
import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { CaretDown, Info } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import CopyText from "../shared/components/CopyText"
import { DUR, EASE_PANEL } from "../shared/motion"
import { bezierToCss } from "../lib/bezier"
import {
  purposesUsing,
  resolveSemantics,
  tokenKey,
  type Easing,
  type MotionState,
} from "../lib/tokens"

const describeEasing = (e: Easing) =>
  e.kind === "bezier"
    ? bezierToCss(e.bezier)
    : `spring(${e.spring.stiffness}, ${e.spring.damping}, ${e.spring.mass})`

export function SemanticTable({
  state,
  onChange,
  children,
}: {
  state: MotionState
  onChange: (next: MotionState) => void
  /** The machine-readable block — part of the output, so it lives here. */
  children?: React.ReactNode
}) {
  const semantics = resolveSemantics(state)
  const [note, setNote] = useState(false)

  const toggle = (key: string) =>
    onChange({
      ...state,
      excluded: state.excluded.includes(key)
        ? state.excluded.filter((k) => k !== key)
        : [...state.excluded, key],
    })

  return (
    <section className="mb-12">
      <h2 className="font-display mb-1 text-xl font-semibold tracking-tight">Output</h2>
      <p className="text-ash mb-4 max-w-[62ch] text-sm leading-relaxed sm:text-xs">
        Every motion ships in both directions. Untick anything you don't want in the export.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="text-ash text-left font-mono text-[11px] tracking-wide uppercase">
              {/* Narrow and first, so unticking a run of rows is one column
                  of travel rather than a hunt across the table. */}
              <th className="w-16 py-2 pr-4 font-medium">Export</th>
              <th className="py-2 pr-4 font-medium">Token</th>
              <th className="py-2 pr-4 font-medium">Duration</th>
              <th className="py-2 pr-4 font-medium">Easing</th>
              <th className="py-2 font-medium">Used for</th>
            </tr>
          </thead>
          <tbody>
            {semantics.map((t) => {
              const used = purposesUsing(state, t.entryId)
              const key = tokenKey(t.entryId, t.direction)
              return (
                <tr
                  key={t.id}
                  className={cn(
                    "border-line-soft border-t transition-opacity",
                    // Still readable, plainly not shipping. Hiding the row
                    // instead would make the set you're deciding about
                    // shrink as you decide, which is the worst of both.
                    !t.exported && "opacity-40",
                  )}
                >
                  <td className="py-2 pr-4">
                    <input
                      type="checkbox"
                      checked={t.exported}
                      onChange={() => toggle(key)}
                      aria-label={`Export motion.${t.id}`}
                      className="accent-ink h-3.5 w-3.5 cursor-pointer align-middle"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <CopyText
                      value={`motion.${t.id}`}
                      className="font-mono text-sm sm:text-[13px]"
                    >
                      motion.{t.id}
                    </CopyText>
                  </td>
                  <td className="text-ink py-2 pr-4 font-mono text-sm sm:text-xs">
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
                  <td className={cn("text-ash py-2 pr-4 font-mono text-sm sm:text-[11px]")}>
                    <CopyText value={describeEasing(t.easing)}>
                      {describeEasing(t.easing)}
                    </CopyText>
                  </td>
                  <td className="text-ash py-2 text-sm sm:text-xs">{used.join(", ") || "—"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/*
        Folded away by default. It explains a rule rather than a control, and
        a paragraph of reasoning sitting open under a table you've already read
        is the kind of thing you learn to scroll past — which is also how you
        learn to scroll past the sentence that matters.
      */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setNote((n) => !n)}
          aria-expanded={note}
          className="text-ash hover:text-ink inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <Info size={13} weight="bold" aria-hidden="true" className="shrink-0" />
          Why exits are derived
          <CaretDown
            size={9}
            weight="bold"
            aria-hidden="true"
            className={cn("shrink-0 transition-transform", note && "rotate-180")}
          />
        </button>
        <AnimatePresence initial={false}>
          {note && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: DUR.panel, ease: EASE_PANEL }}
              className="overflow-hidden"
            >
              <p className="text-ash max-w-[62ch] pt-2 text-xs leading-relaxed">
                Exits are derived, not authored: a share of the entrance, on the mirrored curve
                — and a spring exit loses its bounce entirely, because it goes critically
                damped. An entrance introduces something; an exit removes something you've
                already finished with, and lingering on it reads as lag. It's the one
                relationship on this page that stays live.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {children}
    </section>
  )
}
