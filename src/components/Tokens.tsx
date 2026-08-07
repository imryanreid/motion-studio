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
// ==============================================
import { cn } from "../shared/utils"
import CopyText from "../shared/components/CopyText"
import { bezierToCss } from "../lib/bezier"
import {
  purposesUsing,
  resolveSemantics,
  type Easing,
  type MotionState,
} from "../lib/tokens"

const describeEasing = (e: Easing) =>
  e.kind === "bezier"
    ? bezierToCss(e.bezier)
    : `spring(${e.spring.stiffness}, ${e.spring.damping}, ${e.spring.mass})`

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
          {semantics.length} tokens · what exports and what an agent reads
        </span>
      </div>
      <p className="text-ash mb-4 max-w-[62ch] text-xs leading-relaxed">
        Every motion ships in both directions. This is the whole set.
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
            {semantics.map((t) => {
              const used = purposesUsing(state, t.entryId)
              return (
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
                  <td className={cn("text-ash py-2 pr-4 font-mono text-[11px]")}>
                    <CopyText value={describeEasing(t.easing)}>
                      {describeEasing(t.easing)}
                    </CopyText>
                  </td>
                  <td className="text-ash py-2 text-xs">{used.join(", ") || "—"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-ash mt-3 max-w-[62ch] text-xs leading-relaxed">
        Exits are derived, not authored: a share of the entrance, on the mirrored curve — and a
        spring exit loses its bounce entirely, because it goes critically damped. An entrance
        introduces something; an exit removes something you've already finished with, and
        lingering on it reads as lag. It's the one relationship on this page that stays live.
      </p>

      {children}
    </section>
  )
}
