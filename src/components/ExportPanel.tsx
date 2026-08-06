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
import SharedExportPanel, { type ExportFormat } from "../shared/components/ExportPanel"
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

const asNote = (f: FormatFidelity) =>
  f
    ? { summary: f.summary, detail: <p className="whitespace-pre-line">{f.detail}</p> }
    : undefined

export default function ExportPanel({
  state,
  onChange,
  shareHref,
}: {
  state: MotionState
  onChange: (s: MotionState) => void
  shareHref: string
}) {
  // Accuracy changes only what the CSS and DTCG exports emit, never the tokens
  // themselves — so it lives in the panel rather than on the page.
  const accuracy = (
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
    </div>
  )

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
