// ==============================================
// EASING CARD
// One of the three easings, editable in place: the
// curve, the mode switch, and the parameters.
//
// Bezier and spring are genuinely different things
// rather than two views of one thing, so switching
// mode replaces the easing rather than converting it.
// A spring with visible bounce has no faithful bezier
// at all, and pretending otherwise is the lie this
// tool exists not to tell.
// ==============================================
import { Warning } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import Segmented from "../shared/components/Segmented"
import { Label } from "../shared/components/Label"
import CurvePlot from "./CurvePlot"
import { BEZIER_PRESETS, type Bezier } from "../lib/bezier"
import { derive, overshoot, motionSettlingTime, type SpringConfig } from "../lib/spring"
import type { Easing, Emphasis } from "../lib/tokens"

const MODE_OPTIONS = [
  { id: "bezier" as const, label: "Bezier", title: "Four control points" },
  { id: "spring" as const, label: "Spring", title: "Mass, stiffness, damping" },
]

const DEFAULT_SPRING: SpringConfig = { stiffness: 210, damping: 20, mass: 1, velocity: 0 }
const DEFAULT_BEZIER: Bezier = { x1: 0.2, y1: 0, x2: 0, y2: 1 }

/** What the damping ratio means, in a word. */
const REGIME_LABEL = {
  underdamped: "bounces",
  critical: "no bounce",
  overdamped: "slow in",
} as const

/** A compact labelled number input, matching the family's control chrome. */
function Num({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-ash font-mono text-[10px] tracking-wide uppercase">{label}</span>
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
        className="border-line bg-paper text-ink hover:border-ink/30 focus-visible:ring-ink/30 h-8 w-full min-w-0 rounded-md border px-2 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
      />
    </label>
  )
}

export default function EasingCard({
  emphasis,
  easing,
  onChange,
}: {
  emphasis: Emphasis
  easing: Easing
  onChange: (e: Easing) => void
}) {
  const spring = easing.kind === "spring" ? easing.spring : null
  const d = spring ? derive(spring) : null
  const peak = spring ? overshoot(spring).peak : null

  return (
    <section className="border-line rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Label as="h2">{emphasis}</Label>
        <Segmented
          ariaLabel={`${emphasis} easing type`}
          layoutId={`easing-mode-${emphasis}`}
          size="sm"
          value={easing.kind}
          onChange={(kind) =>
            onChange(
              kind === "spring"
                ? { kind: "spring", spring: DEFAULT_SPRING }
                : { kind: "bezier", bezier: DEFAULT_BEZIER },
            )
          }
          options={MODE_OPTIONS}
        />
      </div>

      <CurvePlot
        easing={easing}
        onChange={
          easing.kind === "bezier"
            ? (bezier) => onChange({ kind: "bezier", bezier })
            : undefined
        }
        className="mb-3"
      />

      {easing.kind === "bezier" ? (
        <>
          <div className="mb-3 flex gap-2">
            <Num
              label="x1"
              value={easing.bezier.x1}
              step={0.01}
              min={0}
              max={1}
              onChange={(x1) => onChange({ kind: "bezier", bezier: { ...easing.bezier, x1 } })}
            />
            <Num
              label="y1"
              value={easing.bezier.y1}
              step={0.01}
              onChange={(y1) => onChange({ kind: "bezier", bezier: { ...easing.bezier, y1 } })}
            />
            <Num
              label="x2"
              value={easing.bezier.x2}
              step={0.01}
              min={0}
              max={1}
              onChange={(x2) => onChange({ kind: "bezier", bezier: { ...easing.bezier, x2 } })}
            />
            <Num
              label="y2"
              value={easing.bezier.y2}
              step={0.01}
              onChange={(y2) => onChange({ kind: "bezier", bezier: { ...easing.bezier, y2 } })}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {BEZIER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ kind: "bezier", bezier: p.value })}
                className="border-line text-ash hover:border-ink/30 hover:text-ink rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <Num
              label="stiff"
              value={spring!.stiffness}
              min={1}
              max={1000}
              onChange={(stiffness) =>
                onChange({ kind: "spring", spring: { ...spring!, stiffness } })
              }
            />
            <Num
              label="damp"
              value={spring!.damping}
              min={0}
              max={100}
              onChange={(damping) =>
                onChange({ kind: "spring", spring: { ...spring!, damping } })
              }
            />
            <Num
              label="mass"
              value={spring!.mass}
              step={0.1}
              min={0.1}
              max={10}
              onChange={(mass) => onChange({ kind: "spring", spring: { ...spring!, mass } })}
            />
            <Num
              label="vel"
              value={spring!.velocity}
              step={0.5}
              onChange={(velocity) =>
                onChange({ kind: "spring", spring: { ...spring!, velocity } })
              }
            />
          </div>
          {/*
            What the numbers mean, rather than what they are. Damping ratio and
            overshoot predict the feel; stiffness alone doesn't.
          */}
          <dl className="text-ash grid grid-cols-3 gap-x-3 font-mono text-[10px] lowercase">
            <div>
              {/* Not uppercased — CSS text-transform turns ζ into Ζ. */}
              <dt className="tracking-wide">ζ damping</dt>
              <dd className={cn("text-ink", d!.regime === "underdamped" && "text-amber-500")}>
                {d!.dampingRatio.toFixed(2)} {REGIME_LABEL[d!.regime]}
              </dd>
            </div>
            <div>
              <dt className="tracking-wide">peak</dt>
              <dd className="text-ink">{peak!.toFixed(3)}</dd>
            </div>
            <div>
              <dt className="tracking-wide">settles</dt>
              <dd className="text-ink">{motionSettlingTime(spring!)}ms</dd>
            </div>
          </dl>
          <p className="text-ash mt-2 flex items-start gap-1.5 text-[11px] leading-snug">
            <Warning size={12} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              A spring has no duration — {motionSettlingTime(spring!)}ms is where Framer Motion
              decides it's close enough. Other runtimes pick differently.
            </span>
          </p>
        </>
      )}
    </section>
  )
}
