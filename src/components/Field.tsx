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
import { NAME_MAX, sanitizeName } from "../lib/tokens"

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

/**
 * The name of a motion.
 *
 * Sanitized as you type rather than validated on blur, because the charset
 * isn't arbitrary strictness — the name becomes a CSS custom property and a
 * field in the URL, and finding that out after typing is worse than being
 * quietly prevented from typing it.
 */
export function NameField({
  value,
  onChange,
  slug,
}: {
  value: string
  onChange: (name: string) => void
  /** What this actually exports as, shown because it may have been suffixed. */
  slug: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-ash font-mono text-[10px] tracking-wide uppercase">Name</span>
      <input
        type="text"
        value={value}
        maxLength={NAME_MAX}
        aria-label="Motion name"
        onChange={(e) => onChange(sanitizeName(e.target.value))}
        className="border-line bg-paper text-ink hover:border-ink/30 focus-visible:ring-ink/30 h-8 w-44 rounded-md border px-2 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
      />
      <span className="text-ash font-mono text-[10px]" title="What this exports as">
        motion.{slug}
      </span>
    </label>
  )
}
