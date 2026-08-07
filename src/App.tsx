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
import { PanelTitle } from "./shared/components/Label"
import { useTheme } from "./shared/theme"
import EasingEditor from "./components/EasingEditor"
import Preview from "./components/Preview"
import { DurationStrip, InlineNumber, SemanticTable } from "./components/Tokens"
import ExportPanel from "./components/ExportPanel"
import AgentData from "./components/AgentData"
import { DEFAULT_STATE, type DurationName, type Emphasis, type MotionState } from "./lib/tokens"
import { encodeState, isDefaultState, resolveState } from "./lib/params"
import { SITE_URL } from "./lib/site"

/** Which entry in the shared tools manifest is this repo. */
const TOOL_ID = "motion"

/**
 * One of the two rules that shape the whole scale, sitting in the panel header.
 *
 * Ratio and snap were full-size fields beside `base`, which put three equal
 * inputs above a strip that only one of them anchored. They belong with the
 * panel title: they describe how the scale is built, not what any step is.
 */
function Rule({
  label,
  value,
  onChange,
  min,
  max,
  width,
  suffix,
  title,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  width: string
  suffix?: string
  title: string
}) {
  return (
    <span className="flex items-baseline gap-1.5" title={title}>
      <span className="text-ash font-mono text-[10px] tracking-[0.16em] uppercase">
        {label}
      </span>
      <InlineNumber
        ariaLabel={label}
        value={value}
        min={min}
        max={max}
        width={width}
        suffix={suffix}
        className="text-ink font-mono text-xs"
        onChange={onChange}
      />
    </span>
  )
}

/** A labelled slider, for the rules that shape every token. */
function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  title,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  step: number
  suffix: string
  title: string
}) {
  return (
    <label className="flex items-center gap-2" title={title}>
      <span className="text-ash font-mono text-[11px] tracking-[0.16em] uppercase">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-ink h-1 w-24"
      />
      <span className="text-ink w-12 font-mono text-xs">
        {value}
        {suffix}
      </span>
    </label>
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
    >
      {/*
        Left is the system, right is the demonstration.
        
        Not "edit vs output" — that split left the duration scale homeless,
        since it is generated but belongs with the inputs that generate it.
        Framed this way the answer to "what can I change that affects the
        animation?" is simply everything on the left, and the right panel is
        purely about watching. Two controls moved to make it true: stagger was
        in the preview, and exit was duplicated in the band and the table.

        One bordered surface on the left rather than three floating panels, so
        it reads as a single instrument.
      */}
      <div className="mb-12 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <section className="border-line overflow-hidden rounded-lg border">
            <div className="border-line flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2.5">
              <PanelTitle>Timing</PanelTitle>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <Rule
                  label="Ratio"
                  value={state.ratio}
                  min={1.05}
                  max={3}
                  width="w-9"
                  title="How far apart the steps are. Each one is the base multiplied or divided by this. Pinned steps ignore it."
                  onChange={(ratio) => setState({ ...state, ratio })}
                />
                <Rule
                  label="Round to"
                  value={state.snap}
                  min={1}
                  max={100}
                  width="w-6"
                  suffix="ms"
                  title="Generated values land on this grid. 200 ÷ 1.4 is 142.86ms; nobody wants that in a stylesheet, and 10ms is far below what anyone can perceive at these lengths — so the numbers stay legible for free."
                  onChange={(snap) => setState({ ...state, snap })}
                />
              </div>
            </div>

            <div className="p-4">
              <DurationStrip state={state} onChange={setState} />
            </div>

            <div className="border-line flex flex-wrap items-center gap-x-6 gap-y-3 border-t p-4">
              <Slider
                label="Exit"
                value={Math.round(state.exitRatio * 100)}
                min={20}
                max={130}
                step={5}
                suffix="%"
                title="Drives the Exit row above: every exit is this share of its entrance. Exits should be quicker — lingering on something you've finished with reads as lag."
                onChange={(pct) => setState({ ...state, exitRatio: pct / 100 })}
              />
              <Slider
                label="Stagger"
                value={state.staggerMs}
                min={0}
                max={160}
                step={5}
                suffix="ms"
                title="Per-child offset in a list. Falls off sub-linearly so long lists stay bearable."
                onChange={(staggerMs) => setState({ ...state, staggerMs })}
              />
            </div>
          </section>

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
        </div>

        <Preview state={state} editing={emphasis} />
      </div>

      <SemanticTable state={state}>
        <AgentData state={state} url={shareHref} />
      </SemanticTable>
    </ToolShell>
  )
}
