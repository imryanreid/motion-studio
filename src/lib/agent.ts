// ==============================================
// AGENT PAYLOAD
// One motion set, in the two shapes a machine can
// read: structured JSON and plain text.
//
// Everything here is a pure function of the query
// string, so it runs identically in the browser, in
// a Vercel function, and in a test. That's the whole
// reason the token maths lives in lib/ rather than in
// components — api/render and api/tokens can import
// it without dragging React into a serverless
// function.
//
// Verifying anything in this file means a real fetch
// with JavaScript disabled. A browser check proves
// nothing: the browser runs the app, which is exactly
// the thing an agent doesn't do.
// ==============================================
import { resolveState, encodeState } from "./params.js"
import {
  PURPOSE_IDS,
  STAGGER_DECAY,
  entryForPurpose,
  exportedSemantics,
  purposeExports,
  purposesUsing,
  slugs,
  staggerDelay,
  type MotionState,
  type SemanticToken,
} from "./tokens.js"
import { bezierToCss } from "./bezier.js"
import {
  toAgentMarkdown,
  toCss,
  toDtcg,
  toFramer,
  toTailwind,
  cssFidelity,
  dtcgFidelity,
} from "./export.js"

/**
 * The origin the visitor actually used.
 *
 * Behind Vercel's proxy `request.url` carries an internal host, so a link built
 * from it would point somewhere nobody can reach. The forwarded headers are
 * what the browser asked for.
 */
export function publicOrigin(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get("x-forwarded-host") ?? url.host
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
  return `${proto}://${host}`
}

/** How a single direction of a motion is described to a machine. */
type TokenJson = {
  token: string
  durationMs: number
  /** `"bezier"` or `"spring"` — a spring's duration is a settling estimate. */
  type: "bezier" | "spring"
  /** Directly usable in CSS. For a spring this is the sampled approximation. */
  css: string
  spring?: { stiffness: number; damping: number; mass: number; velocity: number }
}

export type AgentPayload = {
  state: MotionState
  json: Record<string, unknown>
  text: string
}

function tokenJson(t: SemanticToken, cssValue: string): TokenJson {
  return {
    token: `motion.${t.id}`,
    durationMs: t.durationMs,
    type: t.easing.kind,
    css: cssValue,
    ...(t.easing.kind === "spring" ? { spring: t.easing.spring } : {}),
  }
}

/**
 * Everything a machine could want about one motion set.
 *
 * `text` is the same markdown the page shows in its agent block, so the two can
 * never disagree. `json` is the structured form for anything that would rather
 * parse than read.
 */
export function buildAgentPayload(search: string, origin: string): AgentPayload {
  const state = resolveState(search)
  const canonical = `${origin}/?${encodeState(state)}`
  const slug = slugs(state.entries)
  const semantics = exportedSemantics(state)

  // A spring has no CSS form, so the exporter samples it. Rather than repeat
  // that maths, pull each token's value out of the stylesheet we already build.
  const cssText = toCss(state)
  const cssFor = (t: SemanticToken): string => {
    if (t.easing.kind === "bezier") return bezierToCss(t.easing.bezier)
    const line = cssText
      .split("\n")
      .find((l) => l.includes(`--ease-${t.id.replace(".", "-")}:`))
    return line
      ? line
          .slice(line.indexOf(":") + 1)
          .replace(/;$/, "")
          .trim()
      : "linear"
  }

  const motions = state.entries
    .filter((e) => semantics.some((t) => t.entryId === e.id))
    .map((e) => {
      const enter = semantics.find((t) => t.entryId === e.id && t.direction === "enter")
      const exit = semantics.find((t) => t.entryId === e.id && t.direction === "exit")
      return {
        name: e.name,
        slug: slug[e.id],
        ...(enter ? { enter: tokenJson(enter, cssFor(enter)) } : {}),
        ...(exit ? { exit: tokenJson(exit, cssFor(exit)) } : {}),
        staggerMs: e.staggerMs,
        usedFor: purposesUsing(state, e.id),
      }
    })

  const purposes: Record<string, unknown> = {}
  for (const p of PURPOSE_IDS) {
    const owner = entryForPurpose(state, p)
    const enter = purposeExports(state, p, "enter")
    const exit = purposeExports(state, p, "exit")
    // A purpose whose motion publishes neither direction has nothing to say.
    if (!enter && !exit) continue
    purposes[p] = {
      motion: slug[owner.id],
      ...(enter ? { enter: `motion.${slug[owner.id]}.enter` } : {}),
      ...(exit ? { exit: `motion.${slug[owner.id]}.exit` } : {}),
      staggerMs: owner.staggerMs,
    }
  }

  const css = cssFidelity(state)
  const dtcg = dtcgFidelity(state)

  const json = {
    /**
     * Bumped only when a consumer that parsed the previous shape would now be
     * wrong — a key removed, retyped, or given a new meaning. Adding keys does
     * not bump it.
     *
     * Worth carrying rather than skipping, because this model has already been
     * rewritten once: it used to be a five-step duration scale with three
     * emphasis levels mapped onto it, and anything built against that shape
     * broke silently. A number that fails loudly beats a payload that
     * misparses quietly, even though there is no v1 endpoint to fall back to.
     */
    version: 1,
    tool: "Motion",
    site: origin,
    source: canonical,
    summary:
      `${motions.length} named motion${motions.length === 1 ? "" : "s"}, each with an ` +
      `entrance and a derived, faster exit, plus purpose aliases mapping components onto them.`,
    motions,
    purposes,
    /**
     * Not a token. Children after the first are spaced by
     * `staggerMs * decay^(index-1)`, so a long list doesn't run away.
     */
    staggerDecay: STAGGER_DECAY,
    exampleStagger: state.entries.length
      ? Array.from({ length: 5 }, (_, i) => staggerDelay(state.entries[0], i))
      : [],
    rules: [
      "Prefer the purpose aliases or the named motions over raw durations.",
      "Exits stay faster and flatter than entrances. Symmetric motion reads as sluggish on the way out.",
      "Ship the prefers-reduced-motion block; it is already in the CSS export.",
      "A spring's durationMs is a settling threshold, not a fact. Copying it onto a CSS transition will not reproduce the motion — use the sampled linear() in `css`, or the spring parameters with a runtime that does physics.",
    ],
    // The fidelity notes are the point of this tool, so they travel with the
    // data rather than only appearing in the UI.
    conversionCost: {
      css: css?.summary ?? "exact",
      dtcg: dtcg?.summary ?? "exact",
      framer: "exact — Framer Motion runs the real spring physics",
    },
    formats: {
      css: toCss(state),
      tailwind: toTailwind(state),
      framer: toFramer(state),
      dtcg: JSON.parse(toDtcg(state)) as unknown,
    },
    ...(state.excluded.length ? { excludedTokens: state.excluded } : {}),
  }

  return { state, json, text: toAgentMarkdown(state, canonical) }
}
