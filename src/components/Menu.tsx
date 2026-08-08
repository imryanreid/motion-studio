// ==============================================
// OVERFLOW MENU
// A small popover of actions, anchored top-right of
// whatever it sits in.
//
// Local to Motion for now rather than in src/shared.
// Type and Shape will both want one, but the right
// API for a shared menu is the one a second consumer
// actually asks for — the shared layer earned its
// shape by being used twice, and guessing ahead of
// that is how a component collects options nobody
// needs.
// ==============================================
import { useEffect, useRef, useState, type ReactNode } from "react"
import { DotsThree } from "@phosphor-icons/react"
import { cn } from "../shared/utils"

export type MenuItem = {
  id: string
  label: string
  title?: string
  onSelect: () => void
  disabled?: boolean
  /** Draws a rule above this item — for a destructive action at the bottom. */
  separated?: boolean
  danger?: boolean
}

export default function Menu({
  label,
  groups,
}: {
  label: string
  /** Each group gets a heading; a group with no heading runs straight on. */
  groups: { heading?: string; items: MenuItem[] }[]
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Close on anything that means "I'm done here": a click elsewhere, Escape,
  // or focus leaving the menu entirely (which covers tabbing out).
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={cn(
          "border-line text-ash hover:border-ink/30 hover:text-ink inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
          open && "border-ink/30 text-ink bg-ink/[0.04]",
        )}
      >
        <DotsThree size={14} weight="bold" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="border-line bg-paper absolute top-8 right-0 z-20 w-44 overflow-hidden rounded-md border shadow-lg"
        >
          {groups.map((g, gi) => (
            <div key={g.heading ?? gi}>
              {g.heading && (
                <div className="text-ash border-line/60 border-b px-2.5 py-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
                  {g.heading}
                </div>
              )}
              {g.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    item.onSelect()
                    setOpen(false)
                  }}
                  className={cn(
                    "hover:bg-ink/[0.05] block w-full px-2.5 py-1.5 text-left font-mono text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    item.separated && "border-line/60 border-t",
                    item.danger ? "text-red-500" : "text-ink",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** A row of mutually exclusive chips. The family's small-selector treatment. */
export function ChipGroup({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string
  options: { id: string; label: string; title?: string }[]
  /** `null` selects nothing — used for a value that matches no preset. */
  value: string | null
  onChange: (id: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
            o.id === value
              ? "border-ink bg-ink text-paper"
              : "border-line text-ash hover:border-ink/30 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Something that isn't a control, laid out like one. */
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
