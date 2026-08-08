// ==============================================
// INLINE FIELDS
// Numbers and names you type straight into the
// surface they belong to.
//
// The box is the legend: a box around a number means
// that number was authored. It goes on the number and
// never on the cell — a box around a region claims
// everything inside it is editable, and there is
// always a derived value in there somewhere.
// ==============================================
import { useState } from "react"
import { cn } from "../shared/utils"

/**
 * A number field that holds a draft string while you type.
 *
 * `Number("")` is 0, not NaN, so committing every keystroke meant clearing the
 * field wrote a 0 — and then typing 1000 over it produced "01000", with a
 * leading zero that wouldn't go away.
 */
export function InlineNumber({
  value,
  onChange,
  min,
  max,
  width = "w-10",
  suffix,
  variant = "field",
  className,
  title,
  ariaLabel,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  /** Tailwind width for the input, sized to the digits it will hold. */
  width?: string
  suffix?: string
  /** `field` for an authored value, `ghost` for one you could author. */
  variant?: "field" | "ghost"
  className?: string
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
    <span className={cn("inline-flex items-baseline gap-0.5", className)} title={title}>
      <input
        // Text, not number: no spinner, and no browser-specific handling of a
        // half-typed value in a control this small.
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
        }}
        className={cn(
          "-mx-1 rounded border px-1 tabular-nums outline-none transition-colors",
          variant === "field"
            ? "border-line bg-paper focus:border-ink/40"
            : "hover:border-line/70 border-transparent bg-transparent hover:border-dashed focus:border-solid focus:border-ink/40",
          width,
        )}
      />
      {suffix && <span className="opacity-60">{suffix}</span>}
    </span>
  )
}
