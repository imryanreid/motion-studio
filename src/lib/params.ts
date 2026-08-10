// ==============================================
// URL PARAMS
// The query-string contract: encode the state that
// reproduces a token set, and decode it defensively.
//
// Once this ships these names are a public API — a
// shared link has to keep working — so changing one
// means changing README.md, public/llms.txt and the
// JSON-LD in index.html at the same time.
//
// Every field is validated independently, so a
// malformed link degrades to defaults rather than
// erroring. "." separates numbers and "*" separates
// the fields of an entry. Those two and "-" and "_"
// are the only punctuation URLSearchParams leaves
// alone — "~" looks safe and is not, it comes out as
// %7E — and neither can appear in a name, because
// `sanitizeName` won't allow it.
//
// Deliberately free of browser and Vite globals so
// the Vercel Functions can import it.
// ==============================================
import {
  DEFAULT_STATE,
  ENTRY_LIMIT,
  PURPOSE_IDS,
  sanitizeName,
  type Easing,
  type MotionEntry,
  type MotionState,
  type PurposeId,
} from "./tokens.js"

/** Bezier control points and mass travel as integers ×100 to keep URLs short. */
const B = 100

// The kind label is not a number. Rounding the whole array — including "b" —
// turned every easing into `NaN.30.0.30.100`, which decoded to nothing, and
// resolveState quietly substituted the defaults. The round-trip test for the
// defaults passed on that substitution, so only a non-default state exposed it.
const nums = (kind: string, values: number[]) =>
  [kind, ...values.map((n) => Math.round(n))].join(".")

function encodeEasing(e: Easing): string {
  if (e.kind === "bezier") {
    const { x1, y1, x2, y2 } = e.bezier
    return nums("b", [x1 * B, y1 * B, x2 * B, y2 * B])
  }
  const { stiffness, damping, mass, velocity } = e.spring
  return nums("s", [stiffness, damping, mass * B, velocity * B])
}

function decodeEasing(raw: string | undefined): Easing | undefined {
  if (!raw) return undefined
  const parts = raw.split(".")
  if (parts.length !== 5) return undefined
  const [kind, a, b, c, d] = parts
  const n = [a, b, c, d].map(Number)
  if (n.some((v) => !Number.isFinite(v))) return undefined

  if (kind === "b") {
    return {
      kind: "bezier",
      bezier: { x1: n[0] / B, y1: n[1] / B, x2: n[2] / B, y2: n[3] / B },
    }
  }
  if (kind === "s") {
    // Guard the ranges the editor enforces, so a hand-edited URL can't produce
    // a spring that never settles or divides by zero.
    const spring = { stiffness: n[0], damping: n[1], mass: n[2] / B, velocity: n[3] / B }
    if (spring.stiffness <= 0 || spring.damping < 0 || spring.mass <= 0) return undefined
    return { kind: "spring", spring }
  }
  return undefined
}

/**
 * `id*name*easing*duration*exit*stagger`.
 *
 * Exit is self-describing rather than positional: `r70` is 70% of the
 * entrance, `a140` is a flat 140ms. One field either way, and a link that says
 * which it is.
 *
 * Every field travels for both types, including the two a spring ignores. They
 * are what it falls back to if you switch it to a bezier, and carrying them
 * means that switch restores what you had rather than handing you a default.
 */
function encodeEntry(e: MotionEntry): string {
  return [
    e.id,
    e.name,
    encodeEasing(e.easing),
    String(Math.round(e.durationMs)),
    e.exitLinked ? `r${Math.round(e.exitRatio * 100)}` : `a${Math.round(e.exitAbsoluteMs)}`,
    String(Math.round(e.staggerMs)),
  ].join("*")
}

const ID_OK = /^[A-Za-z0-9_-]{1,12}$/

const SEED = DEFAULT_STATE.entries[1]

function decodeEntry(raw: string): MotionEntry | undefined {
  const parts = raw.split("*")
  if (parts.length < 3) return undefined
  const [id, rawName, rawEasing, rawDur, rawExit, rawStagger] = parts
  if (!ID_OK.test(id)) return undefined

  const easing = decodeEasing(rawEasing)
  if (!easing) return undefined

  const name = sanitizeName(rawName)
  if (!name) return undefined

  const durationMs = num(rawDur ?? null, 1, 60000) ?? SEED.durationMs
  const staggerMs = num(rawStagger ?? null, 0, 1000) ?? SEED.staggerMs

  // "r70" or "a140" — the prefix is the link state, so a link that lost the
  // field falls back to linked rather than to a silent absolute value.
  let exitLinked = SEED.exitLinked
  let exitRatio = SEED.exitRatio
  let exitAbsoluteMs = SEED.exitAbsoluteMs
  if (rawExit?.startsWith("a")) {
    const ms = num(rawExit.slice(1), 1, 60000)
    if (ms !== undefined) {
      exitLinked = false
      exitAbsoluteMs = Math.round(ms)
    }
  } else if (rawExit?.startsWith("r")) {
    const pct = num(rawExit.slice(1), 10, 200)
    if (pct !== undefined) {
      exitLinked = true
      exitRatio = pct / 100
    }
  }

  return {
    id,
    name,
    easing,
    durationMs: Math.round(durationMs),
    exitRatio,
    exitAbsoluteMs,
    exitLinked,
    staggerMs: Math.round(staggerMs),
  }
}

const num = (raw: string | null, min: number, max: number): number | undefined => {
  if (raw === null) return undefined
  const v = Number(raw)
  return Number.isFinite(v) && v >= min && v <= max ? v : undefined
}

/** Serialize to a compact query string, with no leading "?". */
export function encodeState(s: MotionState): string {
  const p = new URLSearchParams()
  for (const e of s.entries) p.append("e", encodeEntry(e))
  p.set("pu", PURPOSE_IDS.map((id) => s.purposeEntry[id]).join("."))
  // "std*enter.emp*exit" — "*" separates the two halves of a key and "." the
  // list, because an entry id can contain neither.
  if (s.excluded.length) {
    p.set("xt", s.excluded.map((k) => k.replace(".", "*")).join("."))
  }
  if (s.tolerance !== DEFAULT_STATE.tolerance) {
    p.set("tol", String(Math.round(s.tolerance * 10000)))
  }
  return p.toString()
}

/** Parse a query string into a partial state, dropping any invalid field. */
export function decodeState(search: string): Partial<MotionState> {
  const p = new URLSearchParams(search)
  const out: Partial<MotionState> = {}

  // Tolerance before the entries guard, because it is the one parameter that
  // refers to nothing else. Below that guard it was silently dropped from any
  // URL without an `e`, so "?tol=30" — which llms.txt invites, since every
  // parameter is documented as optional — did nothing at all.
  const tol = num(p.get("tol"), 1, 2000)
  if (tol !== undefined) out.tolerance = tol / 10000

  // Entries first: everything else refers to them, so a link whose entries
  // don't survive validation can't have a coherent primary or purpose map.
  const entries: MotionEntry[] = []
  const seenIds = new Set<string>()
  for (const raw of p.getAll("e")) {
    if (entries.length >= ENTRY_LIMIT) break
    const e = decodeEntry(raw)
    if (!e || seenIds.has(e.id)) continue
    seenIds.add(e.id)
    entries.push(e)
  }
  if (!entries.length) return out
  out.entries = entries

  const pu = p.get("pu")?.split(".")
  if (pu?.length === PURPOSE_IDS.length) {
    out.purposeEntry = Object.fromEntries(
      PURPOSE_IDS.map((id, i) => [id, seenIds.has(pu[i]) ? pu[i] : entries[0].id]),
    ) as Record<PurposeId, string>
  } else {
    // Entries decoded but the map didn't: point everything at the first entry
    // rather than at ids from a set that is no longer there.
    out.purposeEntry = Object.fromEntries(
      PURPOSE_IDS.map((id) => [id, entries[0].id]),
    ) as Record<PurposeId, string>
  }

  const xt = p.get("xt")
  if (xt) {
    const held = xt
      .split(".")
      .map((raw) => {
        const [id, dir] = raw.split("*")
        return seenIds.has(id) && (dir === "enter" || dir === "exit") ? `${id}.${dir}` : null
      })
      .filter((k): k is string => k !== null)
    if (held.length) out.excluded = held
  }

  return out
}

/** A complete state, filling anything the query string didn't supply. */
export function resolveState(search: string): MotionState {
  const decoded = decodeState(search)
  return {
    ...DEFAULT_STATE,
    ...decoded,
    entries: decoded.entries ?? DEFAULT_STATE.entries,
    purposeEntry: decoded.purposeEntry ?? DEFAULT_STATE.purposeEntry,
    excluded: decoded.excluded ?? [],
  }
}

/** True while the visitor is still looking at the untouched defaults. */
export function isDefaultState(s: MotionState): boolean {
  return encodeState(s) === encodeState(DEFAULT_STATE)
}

/**
 * What this link lost on the way here.
 *
 * A fetcher that collapses repeated query keys leaves one `e=` behind, and the
 * page then renders a completely coherent smaller system: purposes silently
 * repointed at the surviving motion, canonical rewritten to match, no gap
 * anywhere to notice. An agent reviewing that is reviewing something the user
 * never built.
 *
 * The decoder already holds the evidence — `pu` names ids that are no longer
 * present — and used to throw it away in a ternary. This surfaces it instead.
 * Note it fires for a genuinely stale link too, which is also worth saying.
 */
export function decodeWarnings(search: string): string[] {
  const p = new URLSearchParams(search)
  const raw = p.getAll("e")
  if (!raw.length) return []

  const out: string[] = []
  const seen = new Set<string>()
  let rejected = 0
  for (const r of raw) {
    const e = decodeEntry(r)
    if (!e) rejected++
    else seen.add(e.id)
  }

  const pu = p.get("pu")?.split(".") ?? []
  const missing = [...new Set(pu.filter((id) => id && !seen.has(id)))]
  if (missing.length) {
    out.push(
      `This link's component map points at ${missing.length} motion${missing.length === 1 ? "" : "s"} that isn't in it (${missing.join(", ")}). ` +
        `Either the link is stale, or repeated "e" parameters were dropped in transit — some fetchers keep only the first. ` +
        `Those components have been repointed at "${[...seen][0]}", so what you are reading is not the set that was shared. ` +
        `The original had at least ${seen.size + missing.length} motions; this shows ${seen.size}.`,
    )
  }
  if (rejected) {
    out.push(
      `${rejected} motion${rejected === 1 ? "" : "s"} in this link could not be decoded and ${rejected === 1 ? "was" : "were"} skipped.`,
    )
  }
  return out
}
