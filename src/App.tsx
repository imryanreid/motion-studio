// ==============================================
// APP
// Motion-specific wiring. Currently a placeholder:
// the shared shell is in place and proven, and the
// generators land once SPEC.md is approved.
//
// Everything generic (the shell, the utility buttons,
// the modal, labels, segmented controls) lives in
// src/shared and is byte-identical to Ramps Studio.
// Don't edit anything under src/shared here — change
// it upstream and run `pnpm sync`.
// ==============================================
import ToolShell from "./shared/components/ToolShell"
import ThemeToggle from "./shared/components/ThemeToggle"
import { useTheme } from "./shared/theme"

/** Which entry in the shared tools manifest is this repo. */
const TOOL_ID = "motion"

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()

  return (
    <ToolShell
      toolId={TOOL_ID}
      title="Motion Token Generator"
      subtitle="Easing curves, springs and durations you can preview on real UI — and carry across CSS, Framer Motion and SwiftUI honestly."
      actions={<ThemeToggle theme={theme} onToggle={toggleTheme} />}
    >
      <section className="mb-12">
        <p className="text-ash max-w-[60ch] text-sm leading-relaxed">
          Under construction. The shared layer is wired up; the curve editor, duration scale,
          semantic pairs, preview and export panel come next.
        </p>
      </section>
    </ToolShell>
  )
}
