// ==============================================
// EXPORT PANEL — MOTION
// What this tool puts into the shared export shell:
// four destinations, the accuracy control, and the
// prompt handed to an agent.
//
// No Figma tab, for a real reason rather than an
// oversight: Figma variables have no easing type, so
// there is nothing to export there.
//
// The fidelity notes are the point of this tool, and
// this is where they surface.
// ==============================================
import { cn } from "../shared/utils"
import SharedExportPanel, {
  TerminalNote,
  type ExportFormat,
} from "../shared/components/ExportPanel"
import {
  toCss,
  toTailwind,
  toFramer,
  toDtcg,
  toAgentMarkdown,
  agentPrompt,
  cssFidelity,
  tailwindFidelity,
  dtcgFidelity,
  type FormatFidelity,
} from "../lib/export"
import type { MotionState } from "../lib/tokens"

/** How close the sampled linear() has to stay to the true curve. */
const TOLERANCES = [
  { value: 0.03, label: "3%" },
  { value: 0.01, label: "1%" },
  { value: 0.003, label: "0.3%" },
]

/**
 * The one explanation the tool owes for a control that changes nothing you can
 * see. Kept out of the component body so the JSX stays readable.
 */
const ACCURACY_NOTE = (
  <div className="space-y-2">
    <p>
      Accuracy is the error budget for approximating a spring in CSS. It applies to springs
      only, and only to these three exports — your tokens don't change, the Framer Motion export
      doesn't change, and neither does the preview.
    </p>
    <p>
      CSS has no spring. A <code className="font-mono">cubic-bezier()</code> is one curve with
      two control points; a spring can overshoot and come back, which no bezier can draw. So the
      export samples the real physics and writes a <code className="font-mono">linear()</code>{" "}
      polyline that traces it, spending points where the curve bends and coasting through the
      settle.
    </p>
    <p>
      At 1%, that polyline stays within 1% of the element's total travel from the true curve at
      every moment. Tighter costs string length, and a bouncy spring costs far more than a calm
      one — roughly 150 characters at 1% for a critically damped spring against 400 for a lively
      one. 1% is right almost always.
    </p>
    <p>
      The consequence worth knowing: Framer Motion runs the real physics and is exact, so the
      same token animates slightly differently depending on which export you took. This is how
      far apart you'll let them drift.
    </p>
  </div>
)

const asNote = (f: FormatFidelity) =>
  f
    ? { summary: f.summary, detail: <p className="whitespace-pre-line">{f.detail}</p> }
    : undefined

/**
 * The accuracy control and the sentence explaining it.
 *
 * Accuracy changes only what the CSS, Tailwind and DTCG exports emit, never
 * the tokens themselves — so it lives in the panel rather than on the page.
 * Its own component because a control whose effect is invisible is exactly the
 * one that needs its explanation to travel with it.
 */
export function AccuracyControl({
  state,
  onChange,
}: {
  state: MotionState
  onChange: (s: MotionState) => void
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-white/45">Accuracy</span>
        <div className="inline-flex rounded border border-white/15 p-0.5">
          {TOLERANCES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onChange({ ...state, tolerance: t.value })}
              title={`Keep the sampled curve within ${t.label} of the true one`}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[10px] transition-colors",
                state.tolerance === t.value
                  ? "text-paper bg-white/15"
                  : "text-white/45 hover:text-white/80",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Same disclosure as a fidelity note, because it answers the same kind
          of question — what is this costing me — and a second visual language
          for that would be one too many. */}
        <TerminalNote summary="what's this?" detail={ACCURACY_NOTE} />
      </div>
    </div>
  )
}

export default function ExportPanel({
  state,
  onChange,
  shareHref,
}: {
  state: MotionState
  onChange: (s: MotionState) => void
  shareHref: string
}) {
  const accuracy = <AccuracyControl state={state} onChange={onChange} />

  const formats: ExportFormat[] = [
    {
      id: "css",
      label: "CSS",
      filename: "motion.css",
      mime: "text/css",
      render: () => toCss(state),
      options: accuracy,
      fidelity: asNote(cssFidelity(state)),
    },
    {
      id: "tailwind",
      label: "Tailwind",
      filename: "motion-theme.css",
      mime: "text/css",
      render: () => toTailwind(state),
      options: accuracy,
      fidelity: asNote(tailwindFidelity(state)),
    },
    {
      id: "framer",
      label: "Framer Motion",
      filename: "motion.ts",
      mime: "text/typescript",
      render: () => toFramer(state),
    },
    {
      id: "json",
      label: "JSON",
      filename: "motion.tokens.json",
      mime: "application/json",
      render: () => toDtcg(state),
      options: accuracy,
      fidelity: asNote(dtcgFidelity(state)),
    },
    {
      id: "agent",
      label: "Markdown",
      filename: "MOTION.md",
      mime: "text/markdown",
      render: () => toAgentMarkdown(state, shareHref),
    },
  ]

  return (
    <SharedExportPanel
      formats={formats}
      codeBlurb="CSS variables, a Tailwind v4 theme, Framer Motion transitions, DTCG JSON, or markdown for an agent. Copy or download."
      promptBlurb="A ready-to-paste prompt with a link to these tokens, for Claude, GPT, or any coding agent."
      agentPrompt={agentPrompt(shareHref)}
    />
  )
}
