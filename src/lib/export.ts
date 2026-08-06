// ==============================================
// EXPORTERS
// The canonical output. Everything the export panel
// and the agent-readable block render comes from
// here — don't add a second serialization anywhere
// else.
//
// Reduced motion is emitted in every CSS export,
// unconditionally. Not a checkbox, because the
// accessible thing should be what you get by default
// rather than what you remember to tick.
// ==============================================
import { bezierToArray, bezierToCss } from "./bezier.js"
import { approximateToTolerance, describeApproximation } from "./linear.js"
import { derive, springValue, type SpringConfig } from "./spring.js"
import {
  DURATION_NAMES,
  EMPHASIS_NAMES,
  PURPOSES,
  resolveDurations,
  resolveSemantics,
  type Easing,
  type MotionState,
  type SemanticToken,
} from "./tokens.js"

/** A spring rendered for CSS: sampled to a linear(), with what that cost. */
function springCss(spring: SpringConfig, durationMs: number, tolerance: number) {
  return approximateToTolerance(
    (t) => springValue(spring, t * durationMs),
    durationMs,
    tolerance,
  )
}

function easingCss(easing: Easing, durationMs: number, tolerance: number): string {
  return easing.kind === "bezier"
    ? bezierToCss(easing.bezier)
    : springCss(easing.spring, durationMs, tolerance).css
}

const kebab = (id: string) => id.replace(".", "-")

// ---------- CSS ----------

export function toCss(s: MotionState): string {
  const durations = resolveDurations(s)
  const semantics = resolveSemantics(s)

  const lines: string[] = [":root {", "  /* Durations */"]
  for (const n of DURATION_NAMES) lines.push(`  --duration-${n}: ${durations[n]}ms;`)

  lines.push("", "  /* Easings */")
  for (const e of EMPHASIS_NAMES) {
    const enter = semantics.find((t) => t.id === `${e}.enter`)!
    const exit = semantics.find((t) => t.id === `${e}.exit`)!
    lines.push(`  --ease-${e}: ${easingCss(enter.easing, enter.durationMs, s.tolerance)};`)
    lines.push(`  --ease-${e}-exit: ${easingCss(exit.easing, exit.durationMs, s.tolerance)};`)
  }

  lines.push("", "  /* Semantic motion — duration and easing together */")
  for (const t of semantics) {
    const easeVar =
      t.direction === "exit" ? `--ease-${t.emphasis}-exit` : `--ease-${t.emphasis}`
    const note = t.easing.kind === "spring" ? "  /* spring settling time */" : ""
    lines.push(`  --motion-${kebab(t.id)}: ${t.durationMs}ms var(${easeVar});${note}`)
  }

  lines.push("", "  /* Purposes — aliases, not copies */")
  for (const p of PURPOSES) {
    for (const dir of ["enter", "exit"] as const) {
      lines.push(`  --motion-${p.id}-${dir}: var(--motion-${p.aliasOf}-${dir});`)
    }
  }

  lines.push(`  --stagger: ${s.staggerMs}ms;`)
  lines.push("}")

  lines.push(
    "",
    "/*",
    "  Always emitted. Every duration collapses and every curve goes linear, so",
    "  nothing animates for someone who asked it not to. The shorthands are",
    "  overridden directly rather than only the duration variables, because a",
    "  spring's duration is baked into its shorthand.",
    "*/",
    "@media (prefers-reduced-motion: reduce) {",
    "  :root {",
  )
  for (const n of DURATION_NAMES) lines.push(`    --duration-${n}: 1ms;`)
  for (const t of semantics) lines.push(`    --motion-${kebab(t.id)}: 1ms linear;`)
  lines.push("    --stagger: 0ms;", "  }", "}")

  return lines.join("\n")
}

// ---------- Tailwind ----------

export function toTailwind(s: MotionState): string {
  const durations = resolveDurations(s)
  const semantics = resolveSemantics(s)
  const lines = ["@theme {", "  /* Generates ease-* utilities. */"]
  for (const e of EMPHASIS_NAMES) {
    const enter = semantics.find((t) => t.id === `${e}.enter`)!
    const exit = semantics.find((t) => t.id === `${e}.exit`)!
    lines.push(`  --ease-${e}: ${easingCss(enter.easing, enter.durationMs, s.tolerance)};`)
    lines.push(`  --ease-${e}-exit: ${easingCss(exit.easing, exit.durationMs, s.tolerance)};`)
  }
  lines.push(
    "",
    "  /* Durations have no theme namespace in v4, so these are plain custom",
    "     properties. Use them as duration-[var(--duration-base)]. */",
  )
  for (const n of DURATION_NAMES) lines.push(`  --duration-${n}: ${durations[n]}ms;`)
  lines.push("}")
  return lines.join("\n")
}

// ---------- Framer Motion ----------

function framerTransition(t: SemanticToken): string {
  if (t.easing.kind === "spring") {
    const { stiffness, damping, mass, velocity } = t.easing.spring
    const v = velocity ? `, velocity: ${velocity}` : ""
    return `{ type: "spring", stiffness: ${stiffness}, damping: ${damping}, mass: ${mass}${v} }`
  }
  // Motion takes seconds, CSS takes milliseconds. Getting this wrong is a
  // silent 1000x error, so the conversion happens in exactly one place.
  return `{ duration: ${(t.durationMs / 1000).toFixed(3)}, ease: [${bezierToArray(t.easing.bezier).join(", ")}] }`
}

export function toFramer(s: MotionState): string {
  const semantics = resolveSemantics(s)
  const lines = [
    "// Durations are in SECONDS here — Motion's unit, not CSS's.",
    "// Reduced motion is handled by the runtime: wrap your app in",
    '// <MotionConfig reducedMotion="user"> rather than branching per animation.',
    "export const motion = {",
  ]
  for (const e of EMPHASIS_NAMES) {
    const enter = semantics.find((t) => t.id === `${e}.enter`)!
    const exit = semantics.find((t) => t.id === `${e}.exit`)!
    lines.push(`  ${e}: {`)
    lines.push(`    enter: ${framerTransition(enter)},`)
    lines.push(`    exit: ${framerTransition(exit)},`)
    lines.push("  },")
  }
  lines.push("} as const", "")
  lines.push("// Aliases, pointing at the same objects.")
  lines.push("export const purpose = {")
  for (const p of PURPOSES) lines.push(`  ${p.id}: motion.${p.aliasOf},`)
  lines.push("} as const", "")
  lines.push(`export const stagger = ${(s.staggerMs / 1000).toFixed(3)}`)
  lines.push(`export const staggerDecay = ${s.staggerDecay}`)
  return lines.join("\n")
}

// ---------- DTCG ----------

export function toDtcg(s: MotionState): string {
  const durations = resolveDurations(s)
  const semantics = resolveSemantics(s)

  const duration: Record<string, unknown> = {}
  for (const n of DURATION_NAMES) {
    duration[n] = { $type: "duration", $value: { value: durations[n], unit: "ms" } }
  }

  const easing: Record<string, unknown> = {}
  for (const t of semantics) {
    const key = t.direction === "exit" ? `${t.emphasis}-exit` : t.emphasis
    if (easing[key]) continue
    if (t.easing.kind === "bezier") {
      easing[key] = { $type: "cubicBezier", $value: bezierToArray(t.easing.bezier) }
    } else {
      // DTCG has no spring type. Emit the sampled approximation as the value so
      // the file is still valid and usable, and carry the real parameters in an
      // extension so nothing is actually lost — then say so in the export UI,
      // because the format itself has no way to warn.
      const approx = springCss(t.easing.spring, t.durationMs, s.tolerance)
      easing[key] = {
        $type: "cubicBezier",
        $value: [0, 0, 1, 1],
        $description:
          "Spring. DTCG has no spring type, so $value is a linear fallback — " +
          "use $extensions for the real parameters, or the CSS export for the " +
          `sampled linear() (max error ${(approx.maxDeviation * 100).toFixed(1)}% of travel).`,
        $extensions: {
          "studio.motion.spring": t.easing.spring,
          "studio.motion.linear": approx.css,
        },
      }
    }
  }

  const motion: Record<string, unknown> = {}
  for (const t of semantics) {
    const easeKey = t.direction === "exit" ? `${t.emphasis}-exit` : t.emphasis
    motion[t.emphasis] ??= {} as Record<string, unknown>
    ;(motion[t.emphasis] as Record<string, unknown>)[t.direction] = {
      $type: "transition",
      $value: {
        duration: `{duration.${nearestDurationName(durations, t.durationMs)}}`,
        delay: { value: 0, unit: "ms" },
        timingFunction: `{easing.${easeKey}}`,
      },
    }
  }

  const purpose: Record<string, unknown> = {}
  for (const p of PURPOSES) {
    purpose[p.id] = {
      enter: { $type: "transition", $value: `{motion.${p.aliasOf}.enter}` },
      exit: { $type: "transition", $value: `{motion.${p.aliasOf}.exit}` },
    }
  }

  return JSON.stringify({ duration, easing, motion, purpose }, null, 2)
}

/** DTCG transitions reference a duration token, so map back to the nearest. */
function nearestDurationName(durations: Record<string, number>, ms: number): string {
  let best = DURATION_NAMES[0] as string
  let bestDiff = Infinity
  for (const n of DURATION_NAMES) {
    const diff = Math.abs(durations[n] - ms)
    if (diff < bestDiff) {
      bestDiff = diff
      best = n
    }
  }
  return best
}

// ---------- Fidelity ----------

export type FormatFidelity = { summary: string; detail: string } | undefined

/** What the CSS export costs, or nothing when every conversion was exact. */
export function cssFidelity(s: MotionState): FormatFidelity {
  const semantics = resolveSemantics(s)
  const springs = semantics.filter((t) => t.easing.kind === "spring")
  if (!springs.length) return undefined

  let worst = springs[0]
  let worstApprox = springCss(
    (worst.easing as { spring: SpringConfig }).spring,
    worst.durationMs,
    s.tolerance,
  )
  for (const t of springs) {
    const a = springCss(
      (t.easing as { spring: SpringConfig }).spring,
      t.durationMs,
      s.tolerance,
    )
    if (a.maxDeviation > worstApprox.maxDeviation) {
      worst = t
      worstApprox = a
    }
  }

  return {
    summary: describeApproximation(worstApprox),
    detail:
      `CSS cannot run spring physics, so ${springs.length === 1 ? "this spring is" : `all ${springs.length} springs are`} ` +
      `sampled into a linear() polyline. The figure above is the worst case across them (${worst.id}), ` +
      `measured against the exact closed-form curve rather than estimated.\n\n` +
      `Framer Motion runs the real physics, so its export is exact — the same token will differ ` +
      `slightly depending on which one you took. Tighten the accuracy control to close the gap at ` +
      `the cost of a longer string.`,
  }
}

export function tailwindFidelity(s: MotionState): FormatFidelity {
  const css = cssFidelity(s)
  return {
    summary: css
      ? `${css.summary} · durations are plain custom properties`
      : "Durations are plain custom properties",
    detail:
      `Tailwind v4 has an --ease-* theme namespace, so the easings generate ease-* utilities ` +
      `directly. It has no equivalent namespace for transition duration, so durations are emitted ` +
      `as plain custom properties and used as duration-[var(--duration-base)].` +
      (css ? `\n\n${css.detail}` : ""),
  }
}

export function dtcgFidelity(s: MotionState): FormatFidelity {
  const hasSpring = resolveSemantics(s).some((t) => t.easing.kind === "spring")
  if (!hasSpring) return undefined
  return {
    summary: "DTCG has no spring type · springs carry an extension",
    detail:
      `The spec defines duration, cubicBezier and transition, and stops there. A spring has no ` +
      `representation at all, so $value carries a linear fallback and the real parameters travel ` +
      `in $extensions["studio.motion.spring"] alongside the sampled linear() string.\n\n` +
      `This is the one place the tool cannot warn inside the format itself — a consumer reading ` +
      `only $value gets a straight line. Use the CSS or Framer export if the spring matters.`,
  }
}

// ---------- Agent ----------

/** Plain-language rules plus values, written to drop into a CLAUDE.md. */
export function toAgentMarkdown(s: MotionState, url: string): string {
  const durations = resolveDurations(s)
  const semantics = resolveSemantics(s)
  const lines: string[] = [
    "# Motion tokens",
    "",
    `Source: ${url}`,
    "",
    "## Durations",
    "",
    `Generated from a base of ${s.base}ms on a ratio of ${s.ratio}, snapped to ${s.snap}ms.`,
    "",
  ]
  for (const n of DURATION_NAMES) {
    const pinned = s.pins[n] !== undefined ? " (pinned, not on the curve)" : ""
    lines.push(`- \`${n}\` — ${durations[n]}ms${pinned}`)
  }

  lines.push("", "## Semantic motion", "")
  for (const t of semantics) {
    const kind =
      t.easing.kind === "spring"
        ? `spring(stiffness ${t.easing.spring.stiffness}, damping ${t.easing.spring.damping}, mass ${t.easing.spring.mass})`
        : bezierToCss(t.easing.bezier)
    const dur =
      t.easing.kind === "spring" ? `${t.durationMs}ms settling time` : `${t.durationMs}ms`
    lines.push(`- \`motion.${t.id}\` — ${dur}, ${kind}`)
  }

  lines.push("", "## Purposes", "", "Aliases, not copies. Prefer these at call sites.", "")
  for (const p of PURPOSES) lines.push(`- \`${p.id}\` → \`${p.aliasOf}\``)

  lines.push(
    "",
    "## Rules",
    "",
    `1. **Exits are faster and flatter than entrances.** Exit duration is ${Math.round(s.exitRatio * 100)}% of enter, and the exit curve is the mirror of the entrance — a spring exit loses its bounce entirely. An entrance introduces something; an exit removes something the user has already finished with, and lingering reads as lag.`,
    `2. **Match emphasis to how much attention the change deserves.** \`subtle\` for a state change you'd only notice if it were missing, \`standard\` for a surface appearing, \`emphasized\` for something asking to be looked at.`,
    `3. **Duration should grow with travel distance, sub-linearly.** Roughly \`base x (travel / 160px)^0.5\`, clamped to 0.6x-1.8x. Apply it to motions that actually travel; a checkbox filling has no distance.`,
    `4. **Stagger falls off.** ${s.staggerMs}ms x index^${s.staggerDecay}, so a long list doesn't take proportionally long.`,
    `5. **Always ship the reduced-motion block.** It's in the CSS export already. In Framer Motion use \`<MotionConfig reducedMotion="user">\`.`,
    "",
    "## A spring has no duration",
    "",
    "It approaches its target asymptotically and never arrives. Any duration you see for a spring is a *settling threshold* — the point at which the runtime decides it's close enough. Different runtimes pick differently, so the same spring honestly reports different durations on different platforms. The numbers above use Framer Motion's convention.",
    "",
    "## Porting to platforms this tool doesn't export",
    "",
    "Only `k/m` and `c/m` affect the motion, so normalising mass to 1 is lossless — not an approximation.",
    "",
    "- **SwiftUI**: `response = 2π·√(m/k)`, `dampingFraction = c / (2·√(k·m))`. Beziers map to `.timingCurve(x1, y1, x2, y2, duration:)`.",
    "- **Compose**: `stiffness = k/m`, `dampingRatio = c / (2·√(k·m))` — mass is fixed at 1 there, which the normalisation above makes exact. Beziers map to `CubicBezierEasing(x1, y1, x2, y2)`.",
  )

  const fid = cssFidelity(s)
  if (fid) {
    lines.push("", "## What the CSS export costs", "", fid.summary, "", fid.detail)
  }
  const dtcg = dtcgFidelity(s)
  if (dtcg) lines.push("", "## What the DTCG export costs", "", dtcg.summary, "", dtcg.detail)

  return lines.join("\n")
}

/** The prompt handed to an agent — points at the URL rather than inlining. */
export function agentPrompt(url: string): string {
  return `Use these motion tokens as the animation foundation for my project.

Tokens: ${url}

That page lists every duration, easing and semantic pair in machine-readable
form, along with the rules for applying them and what each export format costs.

When you apply them:

- Use the semantic tokens (motion.subtle.*, motion.standard.*, motion.emphasized.*)
  or the purpose aliases (drawer, modal, toast...) rather than raw durations.
- Exits must stay faster and flatter than entrances. That asymmetry is
  deliberate; symmetric motion reads as sluggish on the way out.
- Ship the prefers-reduced-motion block. It's already in the CSS export.
- A spring's duration is a settling threshold, not a fact. Don't copy it onto a
  CSS transition and expect the same result.

Set the tokens up first, then use them for every transition we build.`
}
