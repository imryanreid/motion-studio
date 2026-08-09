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
// Nothing in here edits a token any more. Assignment
// briefly lived on the purpose, here, and it has moved
// onto the motion — where one control sets all of a
// variant's components at once instead of one at a
// time from seven different scenarios. What stays is
// the readout: which motion this scenario plays, and
// how long it runs.
// ==============================================
import { useEffect, useRef, useState } from "react"
import { ArrowClockwise, Pause, Play } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import Segmented from "../shared/components/Segmented"
import Menu, { ChipGroup } from "./Menu"
import { PanelTitle } from "../shared/components/Label"
import {
  PURPOSE_IDS,
  entryForPurpose,
  resolveSemantics,
  type MotionState,
  type PurposeId,
} from "../lib/tokens"
import {
  LEAD_MS,
  LIST_ITEMS,
  childProgress,
  sequenceProgress,
  sequenceTotal,
  timelineTotal,
  tick,
} from "../lib/preview"

/**
 * A draggable timeline.
 *
 * The clock was already seekable — `elapsed` is state and `tick` returns its
 * own origin — so this is wiring, not new machinery. Scrubbing pauses and
 * release resumes only if it was playing when you grabbed it, which is what
 * every media control does and what makes a scrub feel borrowed rather than
 * learned.
 *
 * A slider rather than a bar with a click handler: it answers to arrow keys,
 * Home and End, and announces its position, none of which a div does.
 */
function Scrubber({
  elapsed,
  total,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  elapsed: number
  total: number
  onSeek: (ms: number) => void
  onScrubStart: () => void
  onScrubEnd: () => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0

  const seekTo = (clientX: number) => {
    const box = track.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const frac = Math.min(1, Math.max(0, (clientX - box.left) / box.width))
    onSeek(frac * total)
  }

  const step = (by: number) => onSeek(Math.min(total, Math.max(0, elapsed + by)))

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label="Timeline"
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(elapsed)}
      aria-valuetext={`${Math.round(elapsed)} of ${Math.round(total)} milliseconds`}
      onPointerDown={(e) => {
        setScrubbing(true)
        onScrubStart()
        // Seek before capturing, and never let capture failing take the seek
        // down with it — the jump to where you clicked is the part that has to
        // happen, and pointer capture is only what keeps the drag alive once
        // the cursor leaves the track.
        seekTo(e.clientX)
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Some pointer ids can't be captured; dragging still works while the
          // cursor stays over the track.
        }
      }}
      onPointerMove={(e) => scrubbing && seekTo(e.clientX)}
      onPointerUp={() => {
        setScrubbing(false)
        onScrubEnd()
      }}
      onPointerCancel={() => {
        setScrubbing(false)
        onScrubEnd()
      }}
      onKeyDown={(e) => {
        const nudge = Math.max(10, total / 100)
        if (e.key === "ArrowLeft") step(-nudge)
        else if (e.key === "ArrowRight") step(nudge)
        else if (e.key === "Home") onSeek(0)
        else if (e.key === "End") onSeek(total)
        else return
        e.preventDefault()
      }}
      className={cn(
        // The bar is 4px; the target is the whole 20px strip around it, because
        // a 4px pointer target is a dare rather than a control.
        "group focus-visible:ring-ink/30 relative flex h-5 flex-1 cursor-pointer touch-none items-center rounded outline-none focus-visible:ring-2",
        scrubbing && "cursor-grabbing",
      )}
    >
      <div className="bg-ink/10 relative h-1 w-full overflow-hidden rounded-full">
        <div
          className="bg-ink absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        aria-hidden="true"
        style={{ left: `${pct}%` }}
        className={cn(
          "bg-ink border-paper absolute h-3 w-3 -translate-x-1/2 rounded-full border-2 transition-opacity",
          scrubbing
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      />
    </div>
  )
}

/**
 * How large to draw the component, for reading it on the screen you're on.
 *
 * A view setting, not a token: it never reaches the URL or an export, the same
 * as speed, loop and which scenario is showing.
 */
const ZOOMS = [0.5, 0.75, 1, 1.5, 2]

const TRANSPORT =
  "border-line bg-paper text-ink hover:border-ink/30 hover:bg-ink/[0.08] inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors"

const SPEEDS = [
  { id: "1" as const, label: "1×" },
  { id: "0.5" as const, label: "½×" },
  { id: "0.25" as const, label: "¼×" },
]

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
  editingId,
}: {
  state: MotionState
  /** The row open in the editor. Marks affected scenarios; never moves you. */
  editingId: string
}) {
  const [purpose, setPurpose] = useState<PurposeId>("list")
  const [mode, setMode] = useState<Mode>("both")
  const [speed, setSpeed] = useState<"1" | "0.5" | "0.25">("1")
  const [playing, setPlaying] = useState(true)
  const [loop, setLoop] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [elapsed, setElapsed] = useState(0)

  const entry = entryForPurpose(state, purpose)
  const semantics = resolveSemantics(state)
  const enterToken = semantics.find((t) => t.entryId === entry.id && t.direction === "enter")!
  const exitToken = semantics.find((t) => t.entryId === entry.id && t.direction === "exit")!
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
  // Whether a scrub interrupted playback, so releasing can put it back.
  const resumeAfterScrub = useRef(false)

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
      <div className="border-line flex min-h-[3.25rem] flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <PanelTitle>Preview</PanelTitle>
        {/*
          Zoom scales the component, not the panel. Worth saying out loud in
          the tooltip, because it moves the one variable this tool exists to
          make legible: the same curve over twice the travel reads slower, so
          100% is the honest one and the rest are for seeing detail.
        */}
        <Menu
          label="Zoom"
          triggerLabel={`${Math.round(zoom * 100)}%`}
          width="w-44"
          groups={[
            {
              heading: "Draw the component at",
              items: ZOOMS.map((z) => ({
                id: String(z),
                label: `${Math.round(z * 100)}%`,
                checked: z === zoom,
                title:
                  z === 1
                    ? "Actual size — the only one that reads at true travel distance"
                    : `${Math.round(z * 100)}% — easier to see, but the travel scales with it`,
                onSelect: () => setZoom(z),
              })),
            },
          ]}
        />
        {/*
          Everything else moved: what to play sits with what you're playing it
          on, and the transport sits with the timeline it drives. A control
          belongs next to the thing it changes, not in a header because there
          was room there.
        */}
      </div>

      <div className="flex flex-1 flex-col">
        <div className="border-line flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3 py-2">
          {/*
            The scenarios are the purposes, styled as the shape presets are —
            one chip treatment for "pick one of these" wherever it appears.

            A dot marks the ones using the motion open in the editor. That is a
            different axis from being selected, so it gets its own mark rather
            than a second selected state: selection is where you're looking,
            the dot is what you're editing.
          */}
          <ChipGroup
            ariaLabel="Scenario"
            value={purpose}
            onChange={(id) => setPurpose(id as PurposeId)}
            options={PURPOSE_IDS.map((id) => ({
              id,
              label: id,
              dot: entryForPurpose(state, id).id === editingId,
              title: `${id} — uses ${entryForPurpose(state, id).name}`,
            }))}
          />
          <Segmented
            ariaLabel="What to play"
            layoutId="preview-mode"
            size="sm"
            value={mode}
            onChange={setMode}
            options={MODES}
          />
        </div>

        <div className="bg-ink/[0.03] relative flex min-h-[280px] flex-1 items-center justify-center overflow-hidden p-6">
          {/*
            The wrapper keeps the flex context Stage relies on — the drawer,
            modal and toast scenarios size themselves against it with h-full —
            so scaling can't quietly collapse them.
          */}
          <div
            className="flex h-full w-full items-center justify-center transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          >
            <Stage purpose={purpose} progressAt={progressAt} />
          </div>
        </div>

        {/* Transport, timeline and playback settings in one strip, in the
            order a media control has them. */}
        <div className="border-line flex flex-wrap items-center gap-2 border-t px-3 py-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            title={playing ? "Pause" : "Play"}
            aria-label={playing ? "Pause" : "Play"}
            className={TRANSPORT}
          >
            {playing ? <Pause size={12} weight="fill" /> : <Play size={12} weight="fill" />}
          </button>
          <button
            type="button"
            onClick={replay}
            title="Replay from the start"
            aria-label="Replay"
            className={TRANSPORT}
          >
            <ArrowClockwise size={12} weight="bold" />
          </button>

          <Scrubber
            elapsed={elapsed}
            total={total}
            onSeek={(ms) => {
              setElapsed(ms)
              // Keep the clock's origin under the new position, or resuming
              // would snap back to wherever it had got to on its own.
              start.current = performance.now() - ms / rate
            }}
            onScrubStart={() => {
              resumeAfterScrub.current = playing
              setPlaying(false)
            }}
            onScrubEnd={() => setPlaying(resumeAfterScrub.current)}
          />

          <span className="text-ash w-14 shrink-0 text-right font-mono text-[10px] tabular-nums">
            {Math.round(elapsed)}ms
          </span>

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
              "h-7 rounded-md border px-2 font-mono text-[10px] transition-colors",
              loop
                ? "border-ink/30 bg-ink/[0.06] text-ink"
                : "border-line bg-paper text-ash hover:border-ink/30 hover:text-ink",
            )}
          >
            loop
          </button>
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
