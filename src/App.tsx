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
import EasingCard from "./components/EasingCard"
import Preview from "./components/Preview"
import { DurationScale, SemanticTable } from "./components/Tokens"
import ExportPanel from "./components/ExportPanel"
import AgentData from "./components/AgentData"
import { DEFAULT_STATE, EMPHASIS_NAMES, type MotionState } from "./lib/tokens"
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
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <div>
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
      subtitle="Easing curves, springs and durations — previewed on real UI, and honest about what each export costs."
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
        <div className="flex flex-wrap items-end gap-x-8 gap-y-6">
          <NumberField
            label="Base"
            value={state.base}
            min={20}
            max={2000}
            step={10}
            suffix="ms"
            onChange={(base) => setState({ ...state, base })}
          />
          <NumberField
            label="Ratio"
            value={state.ratio}
            min={1.05}
            max={3}
            step={0.05}
            onChange={(ratio) => setState({ ...state, ratio })}
          />
          <NumberField
            label="Snap"
            value={state.snap}
            min={1}
            max={100}
            step={1}
            suffix="ms"
            onChange={(snap) => setState({ ...state, snap })}
          />
          <NumberField
            label="Exit"
            value={Math.round(state.exitRatio * 100)}
            min={10}
            max={150}
            step={5}
            suffix="%"
            onChange={(pct) => setState({ ...state, exitRatio: pct / 100 })}
          />
          <NumberField
            label="Stagger"
            value={state.staggerMs}
            min={0}
            max={300}
            step={5}
            suffix="ms"
            onChange={(staggerMs) => setState({ ...state, staggerMs })}
          />
        </div>
      }
    >
      <section className="mb-12">
        <h2 className="font-display mb-4 text-xl font-semibold tracking-tight">Easings</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {EMPHASIS_NAMES.map((emphasis) => (
            <EasingCard
              key={emphasis}
              emphasis={emphasis}
              easing={state.easings[emphasis]}
              onChange={(easing) =>
                setState({ ...state, easings: { ...state.easings, [emphasis]: easing } })
              }
            />
          ))}
        </div>
      </section>

      <Preview state={state} />
      <DurationScale state={state} onChange={setState} />
      <SemanticTable state={state} />
      <AgentData state={state} url={shareHref} />
    </ToolShell>
  )
}
