// ==============================================
// EXPORTERS
// The canonical output. Everything the export panel
// and the agent-readable block render comes from
// here — don't add a second serialization anywhere
// else.
//
// Every name here is the entry's slug, so what you
// called a motion on the page is what it is called in
// the file. Slugs are deduplicated in tokens.ts; two
// CSS custom properties can't share a key even if two
// display names can.
//
// Reduced motion is emitted in every CSS export,
// unconditionally. Not a checkbox, because the
// accessible thing should be what you get by default
// rather than what you remember to tick.
// ==============================================
import { bezierToArray, bezierToCss } from "./bezier.js"
import { approximateToTolerance, describeApproximation } from "./linear.js"
import { springValue, type SpringConfig } from "./spring.js"
import {
  PURPOSE_IDS,
  STAGGER_DECAY,
  entryForPurpose,
  resolveSemantics,
  slugs,
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

/** "standard.enter" → "standard-enter". */
const kebab = (id: string) => id.replace(".", "-")

/** The duration token a semantic pair points at. */
const durationKey = (t: SemanticToken) =>
  t.direction === "exit" ? `${t.slug}-exit` : t.slug

/** Which purpose aliases point where, by slug. */
function purposeAliases(s: MotionState): { id: string; slug: string }[] {
  const slug = slugs(s.entries)
  return PURPOSE_IDS.map((id) => ({ id, slug: slug[entryForPurpose(s, id).id] }))
}

// ---------- CSS ----------

export function toCss(s: MotionState): string {
  const semantics = resolveSemantics(s)

  const lines: string[] = [":root {", "  /* Durations */"]
  for (const t of semantics) lines.push(`  --duration-${durationKey(t)}: ${t.durationMs}ms;`)

  lines.push("", "  /* Easings */")
  for (const t of semantics) {
    lines.push(`  --ease-${kebab(t.id)}: ${easingCss(t.easing, t.durationMs, s.tolerance)};`)
  }

  lines.push("", "  /* Motion — duration and easing together */")
  for (const t of semantics) {
    const note = t.easing.kind === "spring" ? "  /* spring settling time */" : ""
    lines.push(
      `  --motion-${kebab(t.id)}: ${t.durationMs}ms var(--ease-${kebab(t.id)});${note}`,
    )
  }

  lines.push("", "  /* Purposes — aliases, not copies */")
  for (const p of purposeAliases(s)) {
    for (const dir of ["enter", "exit"] as const) {
      lines.push(`  --motion-${p.id}-${dir}: var(--motion-${p.slug}-${dir});`)
    }
  }

  // Per-motion, like everything else — a single --stagger couldn't say which
  // motion's children it was spacing.
  lines.push("", "  /* Stagger — per-child offset when a motion enters as a group */")
  for (const e of s.entries) {
    lines.push(`  --motion-${slugs(s.entries)[e.id]}-stagger: ${e.staggerMs}ms;`)
  }
  for (const p of purposeAliases(s)) {
    lines.push(`  --motion-${p.id}-stagger: var(--motion-${p.slug}-stagger);`)
  }
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
  for (const t of semantics) lines.push(`    --duration-${durationKey(t)}: 1ms;`)
  for (const t of semantics) lines.push(`    --motion-${kebab(t.id)}: 1ms linear;`)
  for (const e of s.entries) {
    lines.push(`    --motion-${slugs(s.entries)[e.id]}-stagger: 0ms;`)
  }
  lines.push("  }", "}")

  return lines.join("\n")
}

// ---------- Tailwind ----------

export function toTailwind(s: MotionState): string {
  const semantics = resolveSemantics(s)
  const lines = ["@theme {", "  /* Generates ease-* utilities. */"]
  for (const t of semantics) {
    lines.push(`  --ease-${kebab(t.id)}: ${easingCss(t.easing, t.durationMs, s.tolerance)};`)
  }
  lines.push(
    "",
    "  /* Durations have no theme namespace in v4, so these are plain custom",
    "     properties. Use them as duration-[var(--duration-standard)]. */",
  )
  for (const t of semantics) lines.push(`  --duration-${durationKey(t)}: ${t.durationMs}ms;`)
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

/** A slug is safe in CSS but may still need quoting as an object key in JS. */
const jsKey = (slug: string) => (/^[A-Za-z_$][\w$]*$/.test(slug) ? slug : `"${slug}"`)

export function toFramer(s: MotionState): string {
  const semantics = resolveSemantics(s)
  const slug = slugs(s.entries)
  const lines = [
    "// Durations are in SECONDS here — Motion's unit, not CSS's.",
    "// Reduced motion is handled by the runtime: wrap your app in",
    '// <MotionConfig reducedMotion="user"> rather than branching per animation.',
    "export const motion = {",
  ]
  for (const e of s.entries) {
    const enter = semantics.find((t) => t.entryId === e.id && t.direction === "enter")!
    const exit = semantics.find((t) => t.entryId === e.id && t.direction === "exit")!
    lines.push(`  ${jsKey(slug[e.id])}: {`)
    lines.push(`    enter: ${framerTransition(enter)},`)
    lines.push(`    exit: ${framerTransition(exit)},`)
    lines.push("  },")
  }
  lines.push("} as const", "")
  lines.push("// Aliases, pointing at the same objects.")
  lines.push("export const purpose = {")
  for (const p of purposeAliases(s)) {
    lines.push(`  ${p.id}: motion${/^[A-Za-z_$][\w$]*$/.test(p.slug) ? `.${p.slug}` : `["${p.slug}"]`},`)
  }
  lines.push("} as const", "")
  lines.push("// Per-child offsets, in seconds, and the falloff they share.")
  lines.push("export const stagger = {")
  for (const e of s.entries) {
    lines.push(`  ${jsKey(slug[e.id])}: ${(e.staggerMs / 1000).toFixed(3)},`)
  }
  lines.push("} as const")
  lines.push(`export const staggerDecay = ${STAGGER_DECAY}`)
  return lines.join("\n")
}

// ---------- DTCG ----------

export function toDtcg(s: MotionState): string {
  const semantics = resolveSemantics(s)

  const duration: Record<string, unknown> = {}
  for (const t of semantics) {
    duration[durationKey(t)] = {
      $type: "duration",
      $value: { value: t.durationMs, unit: "ms" },
    }
  }

  const easing: Record<string, unknown> = {}
  for (const t of semantics) {
    const key = kebab(t.id)
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
    motion[t.slug] ??= {} as Record<string, unknown>
    ;(motion[t.slug] as Record<string, unknown>)[t.direction] = {
      $type: "transition",
      $value: {
        duration: `{duration.${durationKey(t)}}`,
        delay: { value: 0, unit: "ms" },
        timingFunction: `{easing.${kebab(t.id)}}`,
      },
    }
  }

  const purpose: Record<string, unknown> = {}
  for (const p of purposeAliases(s)) {
    purpose[p.id] = {
      enter: { $type: "transition", $value: `{motion.${p.slug}.enter}` },
      exit: { $type: "transition", $value: `{motion.${p.slug}.exit}` },
    }
  }

  return JSON.stringify({ duration, easing, motion, purpose }, null, 2)
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
      `as plain custom properties and used as duration-[var(--duration-standard)].` +
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
  const semantics = resolveSemantics(s)
  const lines: string[] = [
    "# Motion tokens",
    "",
    `Source: ${url}`,
    "",
    "## The set",
    "",
    `${s.entries.length} motion${s.entries.length === 1 ? "" : "s"}, each shipping an entrance and an exit.`,
    "",
  ]
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
  for (const p of purposeAliases(s)) lines.push(`- \`${p.id}\` → \`${p.slug}\``)

  lines.push(
    "",
    "## Rules",
    "",
    `1. **Exits are faster and flatter than entrances.** The exit curve is the mirror of the entrance — a spring exit loses its bounce entirely. An entrance introduces something; an exit removes something the user has already finished with, and lingering reads as lag.`,
    `2. **Reach for a purpose, not a raw duration.** The purpose aliases above say what a motion is for; the durations say only how long it is.`,
    `3. **Duration should grow with travel distance, sub-linearly.** Roughly \`duration x (travel / 160px)^0.5\`, clamped to 0.6x-1.8x. Apply it to motions that actually travel; a checkbox filling has no distance.`,
    `4. **Stagger falls off.** Each motion carries its own per-child offset — ${s.entries.map((e) => `${slugs(s.entries)[e.id]} ${e.staggerMs}ms`).join(", ")} — applied as \`offset x index^${STAGGER_DECAY}\`, so a long list doesn't take proportionally long.`,
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

That page lists every motion, its entrance and exit, and the rules for applying
them, in machine-readable form — along with what each export format costs.

When you apply them:

- Use the purpose aliases (drawer, modal, toast...) or the named motions rather
  than raw durations.
- Exits must stay faster and flatter than entrances. That asymmetry is
  deliberate; symmetric motion reads as sluggish on the way out.
- Ship the prefers-reduced-motion block. It's already in the CSS export.
- A spring's duration is a settling threshold, not a fact. Don't copy it onto a
  CSS transition and expect the same result.

Set the tokens up first, then use them for every transition we build.`
}
