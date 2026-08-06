// ==============================================
// PREVIEW
// Motion on real UI, not a dot on a track. A curve
// that looks lively on a 300px track feels sluggish
// on a 40px toggle and frantic on a full-height
// drawer, and you can't tell until it's in the
// product.
//
// Driven by a clock we own rather than by CSS
// transitions, because a transition can't be seeked
// and slow-motion is where easing differences
// actually become legible.
//
// Consequence, stated rather than hidden: this shows
// the true curve. The CSS export is an approximation
// of it, and the export panel says by how much.
// ==============================================
import { useEffect, useRef, useState } from "react"
import { ArrowClockwise, Pause, Play } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import Segmented from "../shared/components/Segmented"
import { resolveSemantics, type Direction, type MotionState } from "../lib/tokens"
import { childProgress, timelineTotal } from "../lib/preview"

const SCENARIOS = [
  { id: "list" as const, label: "List" },
  { id: "drawer" as const, label: "Drawer" },
  { id: "modal" as const, label: "Modal" },
  { id: "toggle" as const, label: "Toggle" },
  { id: "toast" as const, label: "Toast" },
]
type Scenario = (typeof SCENARIOS)[number]["id"]

/** Which emphasis each scenario is demonstrating. */
const SCENARIO_EMPHASIS: Record<Scenario, "subtle" | "standard" | "emphasized"> = {
  list: "standard",
  drawer: "emphasized",
  modal: "emphasized",
  toggle: "subtle",
  toast: "emphasized",
}

const SPEEDS = [
  { id: "1" as const, label: "1×" },
  { id: "0.5" as const, label: "½×" },
  { id: "0.25" as const, label: "¼×" },
]

const LIST_ITEMS = 5

export default function Preview({ state }: { state: MotionState }) {
  const [scenario, setScenario] = useState<Scenario>("list")
  const [direction, setDirection] = useState<Direction>("enter")
  const [speed, setSpeed] = useState<"1" | "0.5" | "0.25">("1")
  const [playing, setPlaying] = useState(true)
  const [elapsed, setElapsed] = useState(0)

  const emphasis = SCENARIO_EMPHASIS[scenario]
  const token = resolveSemantics(state).find((t) => t.id === `${emphasis}.${direction}`)!

  // The list is the only scenario with per-child offsets, so it's the only one
  // whose timeline runs past the token's own duration.
  const staggered = scenario === "list"
  const total = timelineTotal(state, token, staggered ? LIST_ITEMS : 1)

  const raf = useRef<number | null>(null)
  const start = useRef<number>(0)

  useEffect(() => {
    if (!playing) return
    const rate = Number(speed)
    let cancelled = false
    start.current = performance.now() - elapsed / rate

    const tick = (now: number) => {
      if (cancelled) return
      const next = (now - start.current) * rate
      setElapsed(next >= total ? 0 : next)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      if (raf.current) cancelAnimationFrame(raf.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- elapsed is the output, not an input
  }, [playing, speed, total, scenario, direction])

  const progressAt = (index = 0) => childProgress(state, token, elapsed, index, staggered)

  return (
    <section className="mb-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Preview</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Direction"
            layoutId="preview-direction"
            size="sm"
            value={direction}
            onChange={setDirection}
            options={[
              { id: "enter" as Direction, label: "Enter" },
              { id: "exit" as Direction, label: "Exit" },
            ]}
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
            onClick={() => setPlaying((p) => !p)}
            title={playing ? "Pause" : "Play"}
            aria-label={playing ? "Pause" : "Play"}
            className="border-line text-ink hover:border-ink/30 hover:bg-ink/[0.04] inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
          >
            {playing ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setElapsed(0)
              start.current = performance.now()
              setPlaying(true)
            }}
            title="Replay"
            aria-label="Replay"
            className="border-line text-ink hover:border-ink/30 hover:bg-ink/[0.04] inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
          >
            <ArrowClockwise size={13} weight="bold" />
          </button>
        </div>
      </div>

      <div className="border-line overflow-hidden rounded-lg border">
        <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <Segmented
            ariaLabel="Scenario"
            layoutId="preview-scenario"
            size="sm"
            value={scenario}
            onChange={setScenario}
            options={SCENARIOS}
          />
          <span className="text-ash font-mono text-[10px]">
            {emphasis}.{direction} · {token.durationMs}ms
            {token.easing.kind === "spring" ? " settling" : ""}
          </span>
        </div>

        <div className="bg-ink/[0.02] relative flex h-[260px] items-center justify-center overflow-hidden p-6">
          <Stage scenario={scenario} progressAt={progressAt} />
        </div>

        {/* A read-only timeline for now — scrubbing is the next thing here. */}
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
  scenario,
  progressAt,
}: {
  scenario: Scenario
  progressAt: (index?: number) => number
}) {
  if (scenario === "list") {
    return (
      <div className="flex w-full max-w-[320px] flex-col gap-2">
        {Array.from({ length: LIST_ITEMS }, (_, i) => {
          const p = progressAt(i)
          return (
            <div
              key={i}
              className={cn(card, "h-9")}
              style={{ opacity: p, transform: `translateY(${(1 - p) * 14}px)` }}
            />
          )
        })}
      </div>
    )
  }

  if (scenario === "drawer") {
    const p = progressAt()
    return (
      <div className="border-line relative h-full w-full overflow-hidden rounded-md border">
        <div
          className={cn(card, "absolute inset-y-0 left-0 w-1/2 rounded-r-none")}
          style={{ transform: `translateX(${(1 - p) * -100}%)` }}
        />
      </div>
    )
  }

  if (scenario === "modal") {
    const p = progressAt()
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

  if (scenario === "toggle") {
    const p = progressAt()
    return (
      <div className="border-line flex h-8 w-14 items-center rounded-full border px-1">
        <div
          className="bg-ink h-6 w-6 rounded-full"
          style={{ transform: `translateX(${p * 24}px)` }}
        />
      </div>
    )
  }

  // toast
  const p = progressAt()
  return (
    <div className="relative h-full w-full">
      <div
        className={cn(card, "absolute right-0 bottom-0 h-12 w-52")}
        style={{ opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}
      />
    </div>
  )
}
