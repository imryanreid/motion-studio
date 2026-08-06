// ==============================================
// APP
// Motion-specific wiring. Holds the one state object
// everything derives from, keeps the URL in sync with
// it, and hands the page layout to ToolShell.
//
// Everything generic — the shell, the utility
// buttons, the modal, labels, segmented controls, the
// export shell — lives in src/shared and is
// byte-identical to Ramps Studio. Don't edit anything
// under src/shared here: change it upstream and run
// `pnpm sync`.
// ==============================================
import { useEffect, useRef, useState } from "react"
import { DownloadSimple } from "@phosphor-icons/react"
import ToolShell from "./shared/components/ToolShell"
import IconButton from "./shared/components/IconButton"
import ThemeToggle from "./shared/components/ThemeToggle"
import ResetButton from "./shared/components/ResetButton"
import ShareButton from "./shared/components/ShareButton"
import ExportModal from "./shared/components/ExportModal"
import { FieldLabel } from "./shared/components/Label"
import { useTheme } from "./shared/theme"
import EasingEditor from "./components/EasingEditor"
import Preview from "./components/Preview"
import { DurationStrip, SemanticTable } from "./components/Tokens"
import ExportPanel from "./components/ExportPanel"
import AgentData from "./components/AgentData"
import { DEFAULT_STATE, type DurationName, type Emphasis, type MotionState } from "./lib/tokens"
import { encodeState, isDefaultState, resolveState } from "./lib/params"
import { SITE_URL } from "./lib/site"

/** Which entry in the shared tools manifest is this repo. */
const TOOL_ID = "motion"

/** A compact numeric control for the scale inputs. */
function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  title,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  title?: string
}) {
  return (
    <div title={title}>
      <FieldLabel>{label}</FieldLabel>
      <div className="border-line bg-paper focus-within:border-ink/30 flex h-9 items-center rounded-md border px-2.5 font-mono text-xs transition-colors">
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
          className="text-ink w-16 bg-transparent outline-none"
        />
        {suffix && <span className="text-ash shrink-0">{suffix}</span>}
      </div>
    </div>
  )
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const [state, setState] = useState<MotionState>(() =>
    resolveState(typeof window === "undefined" ? "" : window.location.search),
  )
  const [exportOpen, setExportOpen] = useState(false)
  // Which curve is open in the editor. Also drives the preview scenario.
  const [emphasis, setEmphasis] = useState<Emphasis>("standard")

  // What reset threw away, kept just long enough to offer it back.
  const undoSnapshot = useRef<MotionState | null>(null)

  const isDefault = isDefaultState(state)
  const shareHref = `${SITE_URL}/?${encodeState(state)}`

  // Keep the address bar in sync so a copy/paste also reproduces the tokens.
  useEffect(() => {
    try {
      window.history.replaceState(null, "", isDefault ? "/" : `?${encodeState(state)}`)
    } catch {
      // Ignore — some browsers disallow history writes in restricted contexts.
    }
  }, [state, isDefault])

  return (
    <ToolShell
      toolId={TOOL_ID}
      title="Motion Token Generator"
      subtitle="Easing curves, springs and durations, previewed on real UI — and honest about what each export costs."
      actions={
        <>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <ResetButton
            onReset={() => {
              undoSnapshot.current = state
              setState(DEFAULT_STATE)
            }}
            onUndo={() => {
              if (undoSnapshot.current) setState(undoSnapshot.current)
              undoSnapshot.current = null
            }}
          />
          <ShareButton url={shareHref} title="Copy a shareable link to these tokens" />
          <IconButton onClick={() => setExportOpen(true)} title="Export tokens" variant="solid">
            <DownloadSimple size={18} weight="regular" aria-hidden="true" />
          </IconButton>
        </>
      }
      overlay={
        exportOpen && (
          <ExportModal key="export" onClose={() => setExportOpen(false)}>
            <ExportPanel state={state} onChange={setState} shareHref={shareHref} />
          </ExportModal>
        )
      }
      controls={
        <div className="flex flex-wrap items-end gap-x-6 gap-y-5">
          <NumberField
            label="Base"
            value={state.base}
            min={20}
            max={2000}
            step={10}
            suffix="ms"
            title="The middle of the scale. Every other duration is derived from it."
            onChange={(base) => setState({ ...state, base })}
          />
          <NumberField
            label="Ratio"
            value={state.ratio}
            min={1.05}
            max={3}
            step={0.05}
            title="Multiplier between steps. Pinned steps ignore it."
            onChange={(ratio) => setState({ ...state, ratio })}
          />
          <NumberField
            label="Snap"
            value={state.snap}
            min={1}
            max={100}
            step={1}
            suffix="ms"
            title="Generated values round to this."
            onChange={(snap) => setState({ ...state, snap })}
          />
          <NumberField
            label="Exit"
            value={Math.round(state.exitRatio * 100)}
            min={20}
            max={130}
            step={5}
            suffix="%"
            title="Exit duration as a share of the entrance. Exits should be quicker — lingering on something you've finished with reads as lag."
            onChange={(pct) => setState({ ...state, exitRatio: pct / 100 })}
          />
        </div>
      }
    >
      {/*
        Left is what you touch, right is what comes out. The split is the answer
        to "which of these am I supposed to be changing?" — spatial and
        permanent, rather than something to infer per control. Generated things
        deliberately wear no input chrome.

        Only the output you watch *while* tweaking lives here. The semantic
        table and the agent block are read afterwards, so they stay full width
        below rather than being squeezed into half.
      */}
      <div className="mb-12 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <EasingEditor
          state={state}
          selected={emphasis}
          onSelect={setEmphasis}
          onChange={(e, easing) =>
            setState({ ...state, easings: { ...state.easings, [e]: easing } })
          }
          onPairChange={(e, d) =>
            setState({ ...state, durationFor: { ...state.durationFor, [e]: d } })
          }
        />
        {/*
          Preview first. It is the hero and the thing that explains the tool, so
          nothing generated goes above it. The strip used to sit here, on the
          grounds that a generated scale belongs next to the inputs that
          generate it — but the easing panel's "uses base · 200ms" control now
          carries that tie directly, which frees the strip to drop below.
        */}
        <div className="flex flex-col gap-4">
          <Preview
            state={state}
            editing={emphasis}
            onStaggerChange={(staggerMs) => setState({ ...state, staggerMs })}
          />
          <DurationStrip state={state} onChange={setState} />
        </div>
      </div>

      <SemanticTable state={state} onChange={setState} />
      <AgentData state={state} url={shareHref} />
    </ToolShell>
  )
}
