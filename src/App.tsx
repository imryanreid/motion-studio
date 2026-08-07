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
import {
  DEFAULT_STATE,
  staggerDelay,
  type DurationName,
  type Emphasis,
  type MotionState,
} from "./lib/tokens"
import { LIST_ITEMS } from "./lib/preview"
import { encodeState, isDefaultState, resolveState } from "./lib/params"
import { SITE_URL } from "./lib/site"

/** Which entry in the shared tools manifest is this repo. */
const TOOL_ID = "motion"

/**
 * One of the three multipliers, sitting in the panel header.
 *
 * Ratio, exit and round-to are the same kind of thing — rules that turn one
 * duration into another — so they get one row and one treatment. They were
 * scattered: two in the header and one heading a row of exit values, which
 * grouped that one by what it produced rather than by what it is.
 *
 * None of them is a value in the scale, which is why none of them sits in it.
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
  // Which curve is open in the editor. Also marks the preview scenarios it
  // affects.
  const [emphasis, setEmphasis] = useState<Emphasis>("standard")
  // The step of the scale the emphasis panel is currently pointing at, so the
  // scale can light it up. Two panels, one relationship, drawn rather than
  // described.
  const [linked, setLinked] = useState<DurationName | null>(null)

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
        purpose to an emphasis, which is simultaneously a token decision and a
        what-am-I-looking-at decision. Framed this way both sides can edit and
        the division still means something: the left holds the rules and the
        three levels every token is built from, the right holds one component,
        what it reaches for, and what that looks like.

        It also isn't "edit vs output" — that framing left the duration scale
        homeless, since it is generated but belongs beside what generates it.
      */}
      <div className="mb-12 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <section className="border-line overflow-hidden rounded-lg border">
            <div className="border-line flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2.5">
              <PanelTitle>Timing</PanelTitle>
              {/*
                Three multipliers, one row, one treatment — because they are
                one kind of thing. Ratio generates sideways (step to step) and
                exit generates downward (entrance to exit); round-to quantises
                both. Exit used to sit apart from these, heading a row of exit
                values, which grouped it by what it produced rather than by
                what it is.
              */}
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <Rule
                  label="Ratio"
                  value={state.ratio}
                  min={1.05}
                  max={3}
                  width="w-8"
                  title="How far apart the steps are. Each one is the base multiplied or divided by this. A step you've typed a value into ignores it."
                  onChange={(ratio) => setState({ ...state, ratio })}
                />
                <Rule
                  label="Exit"
                  value={Math.round(state.exitRatio * 100)}
                  min={20}
                  max={130}
                  width="w-6"
                  suffix="%"
                  title="Every exit is this share of its entrance — the 'out' figure on each step. Exits should be quicker; lingering on something you've finished with reads as lag. A spring ignores it: a spring settles when it settles."
                  onChange={(pct) => setState({ ...state, exitRatio: pct / 100 })}
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
              <DurationStrip state={state} onChange={setState} highlight={linked} />
            </div>

            {/*
              The number you set is not the number you care about. 40ms says
              nothing; "the fifth row starts at 130ms" is the thing you're
              deciding, and the sequence shows the sub-linear falloff without
              needing a second control for it.
            */}
            <div className="border-line flex flex-wrap items-center gap-x-4 gap-y-2 border-t p-4">
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
            onLink={setLinked}
          />
        </div>

        <Preview
          state={state}
          editing={emphasis}
          onAssign={(purpose, e) =>
            setState({ ...state, purposeEmphasis: { ...state.purposeEmphasis, [purpose]: e } })
          }
        />
      </div>

      <SemanticTable state={state}>
        <AgentData state={state} url={shareHref} />
      </SemanticTable>
    </ToolShell>
  )
}
