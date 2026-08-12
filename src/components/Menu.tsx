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
import { CaretDown, CaretLeft, CaretRight, Check, DotsThree } from "@phosphor-icons/react"
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
  /** Renders a tick column. Omit entirely for a plain action list. */
  checked?: boolean
  /** Trailing grey text — used to say who currently owns a togglable item. */
  note?: string
  /**
   * Trailing text revealed on hover or focus — what picking this will do.
   *
   * Hidden until pointed at because it is the same for every row: shown on all
   * of them at once it is a column of repeated text, and the one thing it
   * needs to say is "this row, this outcome".
   */
  hoverNote?: string
  /** Stay open after this one, so a multi-select can be worked through. */
  keepOpen?: boolean
  /**
   * Drill into a second level rather than acting.
   *
   * A drill-down rather than a hover submenu: one popover, content swapped,
   * so there is no second surface to position, no hover-intent timing, and it
   * works on touch and by keyboard without any of that being special-cased.
   */
  submenu?: MenuLevel
}

export type MenuLevel = {
  heading?: string
  items: MenuItem[]
  /**
   * How a checked item is marked.
   *
   * A box means several of these can be true at once; a bare tick means you
   * are choosing one. Using the box for a single choice promises a state the
   * list cannot hold.
   */
  marker?: "checkbox" | "check"
}

export default function Menu({
  label,
  groups,
  triggerLabel,
  triggerClassName,
  bare = false,
  wrapperClassName,
  align = "right",
  width = "w-48",
}: {
  label: string
  /** Each group gets a heading; a group with no heading runs straight on. */
  groups: MenuLevel[]
  /** Set to render a labelled chip instead of the dots icon. */
  triggerLabel?: string
  /** Sizing for the trigger itself — a width to truncate a long label into. */
  triggerClassName?: string
  /**
   * Drop the bordered box and render the glyph alone.
   *
   * For a trigger that has to sit on a line of 10px labels: a 28px box can
   * only ever centre on the fields below, never on the labels beside it.
   */
  bare?: boolean
  /** Positioning for the whole control within its parent row. */
  wrapperClassName?: string
  align?: "left" | "right"
  /** Widen it when a heading is a sentence rather than a label. */
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const [drilled, setDrilled] = useState<MenuLevel | null>(null)
  const root = useRef<HTMLDivElement>(null)

  // Never reopen onto a level the last visit drilled into.
  useEffect(() => {
    if (!open) setDrilled(null)
  }, [open])

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

  // flex, not block: an inline-flex trigger inside a block wrapper sits on a
  // text baseline, which left the glyph two pixels above the label line it was
  // supposed to share.
  return (
    <div ref={root} className={cn("relative flex shrink-0 items-center", wrapperClassName)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={cn(
          "text-ash hover:text-ink inline-flex items-center justify-center transition-colors",
          bare
            ? // Negative margin cancels the extra height, so a 24px hover
              // target still measures 16 in the label band it has to stay
              // centred in.
              // 36px of target on a phone, still centred on the 16px label
              // band by the negative margin.
              "hover:bg-ink/[0.08] -my-2 h-9 w-9 rounded sm:-my-1 sm:h-6 sm:w-6"
            : "border-line bg-paper hover:border-ink/30 h-9 rounded-md border sm:h-7",
          !bare &&
            (triggerLabel ? "min-w-0 gap-1 px-2 font-mono text-sm sm:text-[10px]" : "w-7"),
          triggerClassName,
          open && (bare ? "text-ink" : "border-ink/30 text-ink bg-ink/[0.06]"),
        )}
      >
        {triggerLabel ? (
          <>
            <span className="truncate">{triggerLabel}</span>
            <CaretDown size={9} weight="bold" aria-hidden="true" className="shrink-0" />
          </>
        ) : (
          <DotsThree size={bare ? 16 : 14} weight="bold" aria-hidden="true" />
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
            layout
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -2 }}
            transition={{ duration: DUR.swap, ease: EASE_PANEL }}
            style={{ transformOrigin: align === "right" ? "top right" : "top left" }}
            className={cn(
              "border-line bg-paper absolute z-20 overflow-hidden rounded-lg border shadow-lg",
              // Clear the trigger, which is taller on a phone. A bordered
              // trigger is 36 there and 28 above `sm`; a bare one is 36 either
              // way but hangs off a 16px label band on negative margins, so it
              // bottoms out in the same place a 28px box does.
              bare ? "top-8" : "top-10 sm:top-8",
              width,
              align === "right" ? "right-0" : "left-0",
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {(drilled ? [drilled] : groups).map((g, gi) => (
                <motion.div
                  key={(drilled ? "drilled:" : "root:") + (g.heading ?? gi)}
                  initial={{ opacity: 0, x: drilled ? 12 : -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: drilled ? -12 : 12 }}
                  transition={{ duration: DUR.swap, ease: EASE_PANEL }}
                >
                  {g.heading &&
                    (drilled ? (
                      <button
                        type="button"
                        onClick={() => setDrilled(null)}
                        className="text-ash hover:text-ink border-line/60 flex w-full items-center gap-1.5 border-b px-3 py-2 text-left text-[12px] leading-snug transition-colors"
                      >
                        <CaretLeft
                          size={10}
                          weight="bold"
                          aria-hidden="true"
                          className="shrink-0"
                        />
                        {g.heading}
                      </button>
                    ) : (
                      <div className="text-ash border-line/60 border-b px-3 py-2 text-[12px] leading-snug">
                        {g.heading}
                      </div>
                    ))}
                  {g.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      title={item.title}
                      onClick={() => {
                        if (item.submenu) {
                          setDrilled(item.submenu)
                          return
                        }
                        item.onSelect()
                        if (drilled) setDrilled(null)
                        if (!item.keepOpen) setOpen(false)
                      }}
                      className={cn(
                        "group hover:bg-ink/[0.06] flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        item.separated && "border-line/60 border-t",
                        item.danger ? "text-red-500" : "text-ink",
                      )}
                    >
                      {item.checked !== undefined &&
                        (g.marker === "check" ? (
                          // A fixed slot whether ticked or not, so the labels
                          // still line up on the rows that aren't chosen.
                          <span
                            aria-hidden="true"
                            className="text-ink flex h-3.5 w-3.5 shrink-0 items-center justify-center"
                          >
                            {item.checked && <Check size={11} weight="bold" />}
                          </span>
                        ) : (
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
                              item.checked ? "border-ink bg-ink text-paper" : "border-line",
                            )}
                          >
                            {item.checked && <Check size={9} weight="bold" />}
                          </span>
                        ))}
                      <span className="truncate">{item.label}</span>
                      {/* Who owns it now — a checkbox that silently unticks
                        itself elsewhere is a checkbox lying about what it does. */}
                      {item.note && (
                        <span className="text-ash ml-auto shrink-0 text-[11px]">
                          {item.note}
                        </span>
                      )}
                      {/* Focus as well as hover: a keyboard user arrowing
                          through the list has the same question a pointer
                          user does. */}
                      {item.hoverNote && (
                        <span className="text-ash ml-auto shrink-0 font-mono text-[11px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          {item.hoverNote}
                        </span>
                      )}
                      {item.submenu && (
                        <CaretRight
                          size={10}
                          weight="bold"
                          aria-hidden="true"
                          className={cn("text-ash shrink-0", !item.note && "ml-auto")}
                        />
                      )}
                    </button>
                  ))}
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * A row of mutually exclusive chips. The family's small-selector treatment.
 *
 * Below `sm` it collapses to a single trigger. Six preset chips and seven
 * component chips were most of the noise on a phone: each row wrapped to two
 * or three lines, and together they made the panel read as a pile of buttons
 * rather than a form. One line, one target.
 *
 * That collapse used to be a native `<select>`, and the picker wheel was worth
 * having — but Safari zooms the whole viewport when a form control smaller
 * than 16px takes focus, so the select had to sit at 16 while every control
 * beside it sat at 14. Two rows of a panel rendering a size larger than the
 * rest is a visible break, and it was the only thing left doing it. A button
 * is exempt from that rule entirely, so this uses the same Menu that the
 * Components picker one row up has always used: 14px, no zoom, one pattern.
 */
export function ChipGroup({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string
  options: { id: string; label: string; title?: string; dot?: boolean }[]
  /** `null` selects nothing — used for a value that matches no preset. */
  value: string | null
  onChange: (id: string) => void
}) {
  return (
    <>
      <Menu
        label={ariaLabel}
        // `null` means the value matches no preset — the chips show nothing
        // selected, and the collapsed trigger has to say the same thing.
        triggerLabel={options.find((o) => o.id === value)?.label ?? "Custom"}
        align="left"
        wrapperClassName="w-full sm:hidden"
        triggerClassName="text-ink w-full justify-between"
        width="w-full"
        groups={[
          {
            // One of these, not several — a tick rather than a box.
            marker: "check",
            items: options.map((o) => ({
              id: o.id,
              label: o.label,
              title: o.title,
              checked: o.id === value,
              onSelect: () => onChange(o.id),
            })),
          },
        ]}
      />
      <div role="radiogroup" aria-label={ariaLabel} className="hidden flex-wrap gap-1 sm:flex">
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
              "inline-flex h-9 items-center rounded-md border px-2 font-mono text-sm transition-colors sm:h-7 sm:text-[10px]",
              o.id === value
                ? "border-ink bg-ink text-paper"
                : // Same surface as an input: transparent on a tinted panel, an
                  // unselected option reads as disabled rather than as a choice.
                  "border-line bg-paper text-ash hover:border-ink/30 hover:text-ink",
            )}
          >
            {o.dot && <AffectedDot className={cn("mr-1.5", o.id === value && "bg-paper/70")} />}
            {o.label}
          </button>
        ))}
      </div>
    </>
  )
}

/**
 * "This one is tied to what you're looking at."
 *
 * A different axis from being selected, and used in both directions: on a
 * component chip it means the open easing owns that component, and on an
 * easing row it means the component being previewed uses that easing. One
 * component so the two ends of that relationship can't drift apart visually.
 */
export function AffectedDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("bg-ink/50 inline-block h-1 w-1 shrink-0 rounded-full", className)}
    />
  )
}
