// ==============================================
// OVERFLOW MENU
// A small popover of actions, anchored top-right of
// whatever it sits in.
//
// Set in Inter rather than the mono the rest of the
// panel uses. A menu is prose — labels and a sentence
// of explanation — and mono is the family's face for
// values, not for reading. Inter is already loaded as
// --font-sans, so this adds a register rather than a
// typeface.
//
// Local to Motion for now rather than in src/shared.
// Type and Shape will both want one, but the right
// API for a shared menu is the one a second consumer
// actually asks for — the shared layer earned its
// shape by being used twice, and guessing ahead of
// that is how a component collects options nobody
// needs.
// ==============================================
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { CaretDown, DotsThree } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import { DUR, EASE_PANEL } from "../shared/motion"

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
  triggerLabel,
  align = "right",
  width = "w-48",
}: {
  label: string
  /** Each group gets a heading; a group with no heading runs straight on. */
  groups: { heading?: string; items: MenuItem[] }[]
  /** Set to render a labelled chip instead of the dots icon. */
  triggerLabel?: string
  align?: "left" | "right"
  /** Widen it when a heading is a sentence rather than a label. */
  width?: string
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
          "border-line text-ash hover:border-ink/30 hover:text-ink inline-flex h-7 items-center justify-center rounded-md border transition-colors",
          triggerLabel ? "gap-1 px-2 font-mono text-[10px]" : "w-7",
          open && "border-ink/30 text-ink bg-ink/[0.04]",
        )}
      >
        {triggerLabel ? (
          <>
            {triggerLabel}
            <CaretDown size={9} weight="bold" aria-hidden="true" />
          </>
        ) : (
          <DotsThree size={14} weight="bold" aria-hidden="true" />
        )}
      </button>

      {/*
        Grows from the trigger rather than appearing whole — the small scale
        and offset are what tie the surface to the button it came out of.
      */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -2 }}
            transition={{ duration: DUR.swap, ease: EASE_PANEL }}
            style={{ transformOrigin: align === "right" ? "top right" : "top left" }}
            className={cn(
              "border-line bg-paper absolute top-8 z-20 overflow-hidden rounded-lg border shadow-lg",
              width,
              align === "right" ? "right-0" : "left-0",
            )}
          >
            {groups.map((g, gi) => (
              <div key={g.heading ?? gi}>
                {g.heading && (
                  <div className="text-ash border-line/60 border-b px-3 py-2 text-[12px] leading-snug">
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
                      "hover:bg-ink/[0.05] block w-full px-3 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      item.separated && "border-line/60 border-t",
                      item.danger ? "text-red-500" : "text-ink",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
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
            // h-7 everywhere: same height as the menu trigger and every other
            // small button, so a row of them shares one rhythm.
            "inline-flex h-7 items-center rounded-md border px-2 font-mono text-[10px] transition-colors",
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
