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
import { useTheme } from "./shared/theme"
import Easings from "./components/Easings"
import Preview from "./components/Preview"
import { SemanticTable } from "./components/Tokens"
import ExportPanel from "./components/ExportPanel"
import AgentData from "./components/AgentData"
import { DEFAULT_STATE, staggerDelay, type MotionState } from "./lib/tokens"
import { LIST_ITEMS } from "./lib/preview"
import { encodeState, isDefaultState, resolveState } from "./lib/params"
import { SITE_URL } from "./lib/site"

/** Which entry in the shared tools manifest is this repo. */
const TOOL_ID = "motion"

/** A labelled slider. Stagger is the only thing left that isn't per-motion. */
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
  // Which row is expanded in the Easings list. Also marks the preview
  // scenarios it affects. "" means every row is collapsed.
  const [selectedId, setSelectedId] = useState(() => DEFAULT_STATE.primaryId)

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
        Left is the system. Right is one component in it.

        Not "edit vs watch" — that split couldn't survive letting you assign a
        purpose to a motion, which is simultaneously a token decision and a
        what-am-I-looking-at decision. Framed this way both sides can edit and
        the division still means something: the left holds the set and the one
        rule that applies across it, the right holds one component, what it
        reaches for, and what that looks like.

        There used to be a Timing panel above this one, holding a five-step
        duration scale that the three emphasis levels then mapped onto. Two
        scales, two names for the same idea, and a mapping to reconcile them.
        It's gone: a motion owns its own duration.
      */}
      <div className="mb-12 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Easings
            state={state}
            onChange={setState}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          {/*
            The last thing that isn't per-motion. The number you set is not the
            number you care about — 40ms says nothing; "the fifth row starts at
            130ms" is the decision, and the sequence shows the sub-linear
            falloff without needing a second control for it.
          */}
          <section className="border-line flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-4">
            <Slider
              label="Stagger"
              value={state.staggerMs}
              min={0}
              max={160}
              step={5}
              suffix="ms"
              title={`Per-child offset for anything that enters as a group. Exported as --stagger, and zeroed under prefers-reduced-motion. It falls off sub-linearly (index^${state.staggerDecay}) so a long list doesn't take proportionally longer.`}
              onChange={(staggerMs) => setState({ ...state, staggerMs })}
            />
            <span
              className="text-ash font-mono text-[11px]"
              title={`Where each of the ${LIST_ITEMS} rows starts, relative to the first.`}
            >
              {Array.from({ length: LIST_ITEMS - 1 }, (_, i) => staggerDelay(state, i + 1)).join(
                " · ",
              )}
              ms
            </span>
          </section>
        </div>

        <Preview
          state={state}
          editingId={selectedId}
          onAssign={(purpose, entryId) =>
            setState({
              ...state,
              purposeEntry: { ...state.purposeEntry, [purpose]: entryId },
            })
          }
        />
      </div>

      <SemanticTable state={state}>
        <AgentData state={state} url={shareHref} />
      </SemanticTable>
    </ToolShell>
  )
}
