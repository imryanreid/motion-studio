// ==============================================
// FIELDS
// One control, used everywhere.
//
// There were three numeric treatments before this —
// a borderless one for duration and exit, a bordered
// h-8 one for the curve handles, and a third for the
// name — so a row of them lined up on nothing. Every
// input here is the same height, border, padding and
// type size; only the width follows the content, and
// a suffix lives INSIDE the box rather than trailing
// outside it where it read as a separate word.
// ==============================================
import { useState, type ReactNode } from "react"
import { cn } from "../shared/utils"

/** Widths. Numbers share one; text gets more room, being text. */
export const FIELD_NUM = "w-[5.5rem]"
export const FIELD_TEXT = "w-40"

const BOX =
  "border-line bg-paper hover:border-ink/30 focus-within:border-ink/40 flex h-8 items-center gap-1 rounded-md border px-2 font-mono text-xs transition-colors"

/** Readouts right-align too, so a column of values shares a decimal edge. */
/*
  A readout is a VALUE, so it is set in ink like every other value. It was
  `text-ash` — label colour — which left the spring's settling time and damping
  ratio reading as captions of themselves and, on a tinted row, barely reading
  at all. The dashed border is what says "derived"; the text colour never had
  to say it too.
*/
const READOUT =
  "border-line text-ink flex h-8 items-center justify-end rounded-md border border-dashed px-2 font-mono text-xs"

/**
 * A label over a control, at a fixed height so a row of them shares a baseline.
 *
 * The fixed label height is what does the work: some stacks hold an input and
 * some hold a readout, and without it those two kinds sat on different lines in
 * the same row.
 */
export function FieldStack({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex shrink-0 flex-col gap-1", className)}>
      <span className="text-ash h-3 font-mono text-[10px] leading-3 tracking-wide uppercase">
        {label}
      </span>
      <div className="flex h-8 items-center">{children}</div>
    </div>
  )
}

/**
 * A number you type, holding a draft string while you do.
 *
 * `Number("")` is 0, not NaN, so committing every keystroke meant clearing the
 * field wrote a 0 — and then typing 1000 over it produced "01000", with a
 * leading zero that wouldn't go away.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  width = FIELD_NUM,
  boxClassName,
  title,
  ariaLabel,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  /** Only affects arrow-key nudges; typing is unconstrained until commit. */
  step?: number
  suffix?: string
  width?: string
  /** Border and radius overrides — used to join two fields into one group. */
  boxClassName?: string
  title?: string
  ariaLabel: string
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  const commit = (raw: string) => {
    const n = Number(raw)
    if (raw.trim() !== "" && Number.isFinite(n)) onChange(clamp(n))
  }

  return (
    <div className={cn(BOX, width, boxClassName)} title={title}>
      <input
        // Text, not number: no spinner eating half the box, and no
        // browser-specific handling of a half-typed value.
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value)
          commit(e.target.value)
        }}
        onBlur={(e) => {
          setDraft(null)
          commit(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault()
            const by = (step ?? 1) * (e.key === "ArrowUp" ? 1 : -1)
            setDraft(null)
            onChange(clamp(Number((value + by).toFixed(4))))
          }
        }}
        // Right-aligned so the value sits against its unit instead of
        // stranding it at the far edge of the box.
        className="text-ink w-full min-w-0 bg-transparent text-right tabular-nums outline-none"
      />
      {suffix && <span className="text-ash shrink-0">{suffix}</span>}
    </div>
  )
}

/** Text, in the same box. */
export function TextField({
  value,
  onChange,
  maxLength,
  width = FIELD_TEXT,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  maxLength?: number
  width?: string
  ariaLabel: string
}) {
  return (
    <div className={cn(BOX, width)}>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className="text-ink w-full min-w-0 bg-transparent outline-none"
      />
    </div>
  )
}

/** A value you can't type into, sized like one you can. */
export function ReadOut({
  children,
  title,
  width = FIELD_NUM,
}: {
  children: ReactNode
  title?: string
  width?: string
}) {
  return (
    <div className={cn(READOUT, width)} title={title}>
      {children}
    </div>
  )
}
