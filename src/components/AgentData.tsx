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
import { motion } from "motion/react"
import { CaretRight } from "@phosphor-icons/react"
import { useCopy } from "../shared/clipboard"
import { cn } from "../shared/utils"
import { DUR, EASE_PANEL } from "../shared/motion"
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
  // Collapsed by default: this block is for agents, and a wall of tokens above
  // the fold is not what a person came for.
  const [open, setOpen] = useState(false)
  const { copied, copy } = useCopy(1400)
  const code =
    format === "css"
      ? toCss(state)
      : format === "json"
        ? toDtcg(state)
        : toAgentMarkdown(state, url)

  return (
    <div className="mt-6" aria-label="Machine-readable motion tokens for agents">
      {/*
        A button plus AnimatePresence rather than <details>.

        Native <details> cannot be animated: its content is display:none when
        closed, so there is nothing to transition from and it pops. The caret
        rotated, which only drew attention to the fact that nothing else did.

        Losing <details> costs agents nothing. This block is the HUMAN copy —
        anything fetching this URL reads a separate payload that api/render
        injects into the HTML, so collapsing this one has never been what keeps
        the tokens machine-readable. Checked against production before changing
        it rather than assumed.

        aria-expanded and aria-controls replace the semantics <summary> gave
        for free.
      */}
      <div className="border-line rounded-lg border">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="agent-tokens"
          className="text-ash hover:text-ink w-full cursor-pointer px-4 py-3 text-left font-mono text-xs transition-colors"
        >
          <span className="inline-flex items-center gap-1.5">
            <CaretRight
              size={12}
              weight="bold"
              aria-hidden="true"
              className={cn("transition-transform duration-200", open && "rotate-90")}
            />
            Machine-readable tokens (for agents)
          </span>
        </button>
        {/*
              Always mounted, height-animated — never unmounted.
            
              main.tsx removes the block api/render injects the moment React
              takes over, so once the app is running THIS is the only copy of
              the machine-readable text in the document. An {open && …} here
              would delete it outright for anything that runs JavaScript and
              then reads the DOM.
            
              A <details> kept its content in the document while collapsed, and
              height:0 with overflow:hidden does the same: the nodes stay, they
              are merely not painted. That is the property being preserved, not
              the element.
            */}
        <motion.div
          id="agent-tokens"
          initial={false}
          animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
          transition={{ duration: DUR.panel, ease: EASE_PANEL }}
          className="overflow-hidden"
          aria-hidden={!open}
        >
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
                className="border-ink/20 text-ink hover:bg-ink/[0.06] inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors"
              >
                {copied ? "Copied" : `Copy ${format.toUpperCase()}`}
              </button>
            </div>
            <pre className="border-line text-ink overflow-x-auto border-t px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {code}
            </pre>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
