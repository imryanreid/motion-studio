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
import { DEFAULT_STATE, type MotionState } from "./lib/tokens"
import { encodeState, isDefaultState, resolveState } from "./lib/params"
import { SITE_URL } from "./lib/site"

/** Which entry in the shared tools manifest is this repo. */
const TOOL_ID = "motion"

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const [state, setState] = useState<MotionState>(() =>
    resolveState(typeof window === "undefined" ? "" : window.location.search),
  )
  const [exportOpen, setExportOpen] = useState(false)
  // Which row is expanded in the Easings list. Also marks the preview
  // scenarios it affects. "" means every row is collapsed.
  //
  // The first entry, not a fixed id: a shared link can carry any set, and one
  // that doesn't happen to contain "std" would have opened with everything
  // collapsed and the preview marking nothing.
  const [selectedId, setSelectedId] = useState(() => state.entries[0].id)

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
      subtitle="Easings and semantic tokens, previewed on real UI, built to start a project and hand to your agent."
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
        duration scale that the three emphasis levels then mapped onto, and a
        standalone Stagger bar below it. Both are gone: a motion owns its own
        duration, its own exit and its own stagger, and nothing in the model is
        global any more.
      */}
      <div className="mb-12 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Easings
            state={state}
            onChange={setState}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <Preview state={state} editingId={selectedId} />
      </div>

      <SemanticTable state={state} onChange={setState}>
        <AgentData state={state} url={shareHref} />
      </SemanticTable>
    </ToolShell>
  )
}
