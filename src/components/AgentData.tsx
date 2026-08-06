// ==============================================
// AGENT DATA
// The full token set as plain text, on the page.
//
// Visible and never behind an interaction, because
// being consumable by agents is a stated goal for
// every tool in this family rather than a
// nice-to-have. Reuses the canonical exporters, so
// there is no second serialization to drift.
// ==============================================
import { useState } from "react"
import { CaretRight } from "@phosphor-icons/react"
import { useCopy } from "../shared/clipboard"
import Segmented from "../shared/components/Segmented"
import { toAgentMarkdown, toCss, toDtcg } from "../lib/export"
import type { MotionState } from "../lib/tokens"

const FORMATS = [
  { id: "md" as const, label: "MD" },
  { id: "css" as const, label: "CSS" },
  { id: "json" as const, label: "JSON" },
]

export default function AgentData({ state, url }: { state: MotionState; url: string }) {
  const [format, setFormat] = useState<"md" | "css" | "json">("md")
  const { copied, copy } = useCopy(1400)
  const code =
    format === "css"
      ? toCss(state)
      : format === "json"
        ? toDtcg(state)
        : toAgentMarkdown(state, url)

  return (
    <section className="mb-12" aria-label="Machine-readable motion tokens for agents">
      <details className="group border-line rounded-lg border">
        <summary className="text-ash hover:text-ink cursor-pointer list-none px-4 py-3 font-mono text-xs transition-colors">
          <span className="inline-flex items-center gap-1.5">
            <CaretRight
              size={12}
              weight="bold"
              aria-hidden="true"
              className="transition-transform duration-200 group-open:rotate-90"
            />
            Machine-readable tokens (for agents)
          </span>
        </summary>
        <div className="border-line border-t">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Segmented
              ariaLabel="Machine-readable format"
              layoutId="agent-format-pill"
              size="sm"
              value={format}
              onChange={setFormat}
              options={FORMATS}
            />
            <button
              type="button"
              onClick={() => copy(code)}
              className="border-ink/20 text-ink hover:bg-ink/[0.04] inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors"
            >
              {copied ? "Copied" : `Copy ${format.toUpperCase()}`}
            </button>
          </div>
          <pre className="border-line text-ink overflow-x-auto border-t px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {code}
          </pre>
        </div>
      </details>
    </section>
  )
}
