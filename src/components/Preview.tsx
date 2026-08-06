// ==============================================
// PREVIEW
// Motion on real UI, not a dot on a track. A curve
// that looks lively on a 300px track feels sluggish
// on a 40px toggle and frantic on a full-height
// drawer, and you can't tell until it's in the
// product.
//
// The scenarios are the purposes — one vocabulary,
// so what you are watching is named the same thing
// you'd reach for at a call site.
//
// Driven by a clock we own rather than by CSS
// transitions, because a transition can't be seeked
// and slow-motion is where easing differences
// actually become legible.
//
// Consequence, stated rather than hidden: this shows
// the true curve. The CSS export is an approximation
// of it, and the export panel says by how much.
//
// Every control in here changes what you are WATCHING
// — mode, speed, loop, which scenario. Nothing in here
// changes a token. Anything that would is on the left,
// which is the whole point of the split: stagger used
// to live here and had to move, because it is part of
// the system rather than part of the view.
// ==============================================
import { useEffect, useRef, useState } from "react"
import { ArrowClockwise, Pause, Play } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import Segmented from "../shared/components/Segmented"
import { PanelTitle } from "../shared/components/Label"
import {
  PURPOSE_IDS,
  resolveSemantics,
  type Emphasis,
  type MotionState,
  type PurposeId,
} from "../lib/tokens"
import {
  LEAD_MS,
  childProgress,
  sequenceProgress,
  sequenceTotal,
  timelineTotal,
  tick,
} from "../lib/preview"

const SPEEDS = [
  { id: "1" as const, label: "1×" },
  { id: "0.5" as const, label: "½×" },
  { id: "0.25" as const, label: "¼×" },
]

const LIST_ITEMS = 5

/**
 * Both is the default.
 *
 * The rule this tool teaches is that exits are faster and flatter than
 * entrances. Toggling between two directions makes you compare from memory,
 * which is the thing a preview is supposed to replace — so the whole life of
 * the element is what you see first.
 */
const MODES = [
  { id: "both" as const, label: "Both" },
  { id: "enter" as const, label: "Enter" },
  { id: "exit" as const, label: "Exit" },
]
type Mode = (typeof MODES)[number]["id"]

/** Only the list has per-child offsets. */
const STAGGERS: PurposeId = "list"

export default function Preview({
  state,
  editing,
}: {
  state: MotionState
  /** The curve open in the editor. Marks affected scenarios; never moves you. */
  editing: Emphasis
}) {
  const [purpose, setPurpose] = useState<PurposeId>("list")
  const [mode, setMode] = useState<Mode>("both")
  const [speed, setSpeed] = useState<"1" | "0.5" | "0.25">("1")
  const [playing, setPlaying] = useState(true)
  const [loop, setLoop] = useState(true)
  const [elapsed, setElapsed] = useState(0)

  const emphasis = state.purposeEmphasis[purpose]
  const semantics = resolveSemantics(state)
  const enterToken = semantics.find((t) => t.id === `${emphasis}.enter`)!
  const exitToken = semantics.find((t) => t.id === `${emphasis}.exit`)!
  const token = mode === "exit" ? exitToken : enterToken
  const staggered = purpose === STAGGERS
  const children = staggered ? LIST_ITEMS : 1
  const rate = Number(speed)
  const total =
    mode === "both"
      ? sequenceTotal(state, enterToken, exitToken, children, rate)
      : timelineTotal(state, token, children, rate)

  const raf = useRef<number | null>(null)
  const start = useRef(0)

  useEffect(() => {
    if (!playing) return
    let cancelled = false
    start.current = performance.now() - elapsed / rate

    const frame = (now: number) => {
      if (cancelled) return
      const r = tick(now, start.current, rate, total, loop)
      start.current = r.originMs
      setElapsed(r.elapsedMs)
      if (!r.playing) {
        setPlaying(false)
        return
      }
      raf.current = requestAnimationFrame(frame)
    }
    raf.current = requestAnimationFrame(frame)
    return () => {
      cancelled = true
      if (raf.current) cancelAnimationFrame(raf.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- elapsed is the output, not an input
  }, [playing, speed, total, purpose, mode, loop])

  const replay = () => {
    setElapsed(0)
    start.current = performance.now()
    setPlaying(true)
  }

  const progressAt = (index = 0) =>
    mode === "both"
      ? sequenceProgress(
          state,
          enterToken,
          exitToken,
          elapsed,
          index,
          staggered,
          rate,
          children,
        )
      : childProgress(state, token, Math.max(0, elapsed - LEAD_MS * rate), index, staggered)

  return (
    <section className="border-line flex flex-col overflow-hidden rounded-lg border">
      <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <PanelTitle>Preview</PanelTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="What to play"
            layoutId="preview-mode"
            size="sm"
            value={mode}
            onChange={setMode}
            options={MODES}
          />
          <Segmented
            ariaLabel="Playback speed"
            layoutId="preview-speed"
            size="sm"
            value={speed}
            onChange={setSpeed}
            options={SPEEDS}
          />
          <button
            type="button"
            onClick={() => setLoop((l) => !l)}
            aria-pressed={loop}
            title={loop ? "Looping — click to play once" : "Plays once — click to loop"}
            className={cn(
              "rounded-md border px-2 py-1 font-mono text-[10px] transition-colors",
              loop
                ? "border-ink/30 bg-ink/[0.05] text-ink"
                : "border-line text-ash hover:text-ink",
            )}
          >
            loop
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            title={playing ? "Pause" : "Play"}
            aria-label={playing ? "Pause" : "Play"}
            className="border-line text-ink hover:border-ink/30 hover:bg-ink/[0.04] inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
          >
            {playing ? <Pause size={12} weight="fill" /> : <Play size={12} weight="fill" />}
          </button>
          <button
            type="button"
            onClick={replay}
            title="Replay"
            aria-label="Replay"
            className="border-line text-ink hover:border-ink/30 hover:bg-ink/[0.04] inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
          >
            <ArrowClockwise size={12} weight="bold" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          {/*
            Scenario tabs are the purposes. Selecting a curve in the editor
            marks the ones it affects rather than jumping you somewhere else —
            moving the view under you implied each curve belonged to one
            element, which is the opposite of what this tool teaches.
          */}
          <div className="flex flex-wrap gap-0.5">
            {PURPOSE_IDS.map((id) => {
              const affected = state.purposeEmphasis[id] === editing
              const active = id === purpose
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPurpose(id)}
                  aria-pressed={active}
                  title={`${id} — uses ${state.purposeEmphasis[id]}`}
                  className={cn(
                    "relative rounded px-2 py-1 font-mono text-[11px] transition-colors",
                    active ? "bg-ink text-paper" : "text-ash hover:text-ink",
                  )}
                >
                  {id}
                  {affected && !active && (
                    <span
                      aria-hidden="true"
                      className="bg-ink/40 absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                    />
                  )}
                </button>
              )
            })}
          </div>
          <span className="text-ash font-mono text-[10px]">
            {emphasis} ·{" "}
            {mode === "both"
              ? `${enterToken.durationMs}ms in / ${exitToken.durationMs}ms out`
              : `${token.durationMs}ms`}
            {token.easing.kind === "spring" ? " settling" : ""}
          </span>
        </div>

        <div className="bg-ink/[0.02] relative flex min-h-[280px] flex-1 items-center justify-center overflow-hidden p-6">
          <Stage purpose={purpose} progressAt={progressAt} />
        </div>

        <div className="border-line flex items-center gap-3 border-t px-3 py-2">
          <div className="bg-ink/10 relative h-1 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-ink absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }}
            />
          </div>
          <span className="text-ash w-16 shrink-0 text-right font-mono text-[10px]">
            {Math.round(elapsed)}ms
          </span>
        </div>
      </div>
    </section>
  )
}

const card = "bg-paper border-line rounded-md border shadow-sm"

function Stage({
  purpose,
  progressAt,
}: {
  purpose: PurposeId
  progressAt: (index?: number) => number
}) {
  const p = progressAt()

  if (purpose === "list") {
    return (
      <div className="flex w-full max-w-[320px] flex-col gap-2">
        {Array.from({ length: LIST_ITEMS }, (_, i) => {
          const v = progressAt(i)
          return (
            <div
              key={i}
              className={cn(card, "h-9")}
              style={{ opacity: v, transform: `translateY(${(1 - v) * 14}px)` }}
            />
          )
        })}
      </div>
    )
  }

  if (purpose === "drawer") {
    return (
      <div className="border-line relative h-full w-full overflow-hidden rounded-md border">
        <div
          className={cn(card, "absolute inset-y-0 left-0 w-1/2 rounded-r-none")}
          style={{ transform: `translateX(${(1 - p) * -100}%)` }}
        />
      </div>
    )
  }

  if (purpose === "modal") {
    return (
      <div className="relative h-full w-full">
        <div className="absolute inset-0 rounded-md bg-black/40" style={{ opacity: p * 0.6 }} />
        <div
          className={cn(card, "absolute top-1/2 left-1/2 h-28 w-56")}
          style={{
            opacity: p,
            transform: `translate(-50%, -50%) scale(${0.94 + p * 0.06}) translateY(${(1 - p) * 10}px)`,
          }}
        />
      </div>
    )
  }

  if (purpose === "state") {
    return (
      <div className="border-line flex h-8 w-14 items-center rounded-full border px-1">
        <div
          className="bg-ink h-6 w-6 rounded-full"
          style={{ transform: `translateX(${p * 24}px)` }}
        />
      </div>
    )
  }

  if (purpose === "dropdown") {
    return (
      <div className="flex w-full max-w-[240px] flex-col items-start">
        <div className={cn(card, "mb-1 h-8 w-28")} />
        <div
          className={cn(card, "h-24 w-40 origin-top")}
          style={{
            opacity: p,
            transform: `scaleY(${0.85 + p * 0.15}) translateY(${(1 - p) * -6}px)`,
          }}
        />
      </div>
    )
  }

  if (purpose === "tooltip") {
    return (
      <div className="relative flex flex-col items-center gap-2">
        <div
          className="bg-ink text-paper rounded px-2 py-1 font-mono text-[10px]"
          style={{ opacity: p, transform: `scale(${0.92 + p * 0.08})` }}
        >
          tooltip
        </div>
        <div className={cn(card, "h-7 w-7")} />
      </div>
    )
  }

  // toast
  return (
    <div className="relative h-full w-full">
      <div
        className={cn(card, "absolute right-0 bottom-0 h-12 w-52")}
        style={{ opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}
      />
    </div>
  )
}
