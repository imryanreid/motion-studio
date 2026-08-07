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
// erroring. "." is the list separator because
// URLSearchParams percent-encodes a comma and leaves
// a dot alone, which keeps shared links legible.
//
// Deliberately free of browser and Vite globals so
// the Vercel Functions can import it.
// ==============================================
import {
  DEFAULT_STATE,
  DURATION_NAMES,
  EMPHASIS_NAMES,
  PURPOSE_IDS,
  type DurationName,
  type Easing,
  type Emphasis,
  type MotionState,
} from "./tokens.js"

/** Bezier control points travel as integers ×100 to keep the URL short. */
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

function decodeEasing(raw: string | null): Easing | undefined {
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

const EASING_PARAM: Record<Emphasis, string> = {
  subtle: "es",
  standard: "ed",
  emphasized: "em",
}

function encodePins(pins: MotionState["pins"]): string {
  return DURATION_NAMES.filter((n) => pins[n] !== undefined)
    .map((n) => `${n}:${Math.round(pins[n]!)}`)
    .join(".")
}

function decodePins(raw: string | null): MotionState["pins"] | undefined {
  if (raw === "-") return {}
  if (!raw) return undefined
  const out: MotionState["pins"] = {}
  for (const chunk of raw.split(".")) {
    const [name, value] = chunk.split(":")
    const ms = Number(value)
    if (!DURATION_NAMES.includes(name as DurationName)) continue
    // `base` is the anchor, authored directly as `d`. A pin on it would let the
    // cell labelled "base" hold a value the rest of the scale isn't derived
    // from, so a hand-edited link can't create one.
    if (name === "base") continue
    if (!Number.isFinite(ms) || ms <= 0 || ms > 60000) continue
    out[name as DurationName] = Math.round(ms)
  }
  return Object.keys(out).length ? out : undefined
}

const num = (raw: string | null, min: number, max: number): number | undefined => {
  if (raw === null) return undefined
  const v = Number(raw)
  return Number.isFinite(v) && v >= min && v <= max ? v : undefined
}

// The two mapping tables travel as indices rather than names: five duration
// names and three emphasis names would make a long, brittle string, and the
// orders are already a public contract via the token names themselves.
function encodeDurationFor(m: MotionState["durationFor"]): string {
  return EMPHASIS_NAMES.map((e) => DURATION_NAMES.indexOf(m[e])).join(".")
}

function decodeDurationFor(raw: string | null): MotionState["durationFor"] | undefined {
  if (!raw) return undefined
  const parts = raw.split(".").map(Number)
  if (parts.length !== EMPHASIS_NAMES.length) return undefined
  if (parts.some((i) => !Number.isInteger(i) || i < 0 || i >= DURATION_NAMES.length)) {
    return undefined
  }
  return Object.fromEntries(
    EMPHASIS_NAMES.map((e, i) => [e, DURATION_NAMES[parts[i]]]),
  ) as MotionState["durationFor"]
}

function encodePurposeEmphasis(m: MotionState["purposeEmphasis"]): string {
  return PURPOSE_IDS.map((p) => EMPHASIS_NAMES.indexOf(m[p])).join(".")
}

function decodePurposeEmphasis(raw: string | null): MotionState["purposeEmphasis"] | undefined {
  if (!raw) return undefined
  const parts = raw.split(".").map(Number)
  if (parts.length !== PURPOSE_IDS.length) return undefined
  if (parts.some((i) => !Number.isInteger(i) || i < 0 || i >= EMPHASIS_NAMES.length)) {
    return undefined
  }
  return Object.fromEntries(
    PURPOSE_IDS.map((p, i) => [p, EMPHASIS_NAMES[parts[i]]]),
  ) as MotionState["purposeEmphasis"]
}

/** Serialize to a compact query string, with no leading "?". */
export function encodeState(s: MotionState): string {
  const p = new URLSearchParams()
  p.set("d", [Math.round(s.base), Math.round(s.ratio * B), Math.round(s.snap)].join("."))
  // "-" says explicitly no pins. Without it, clearing every pin would decode
  // as "unspecified" and silently restore the default pin on `instant`.
  p.set("dp", encodePins(s.pins) || "-")
  for (const e of EMPHASIS_NAMES) p.set(EASING_PARAM[e], encodeEasing(s.easings[e]))
  const df = encodeDurationFor(s.durationFor)
  if (df !== encodeDurationFor(DEFAULT_STATE.durationFor)) p.set("pd", df)
  const pe = encodePurposeEmphasis(s.purposeEmphasis)
  if (pe !== encodePurposeEmphasis(DEFAULT_STATE.purposeEmphasis)) p.set("pe", pe)
  if (s.exitRatio !== DEFAULT_STATE.exitRatio) p.set("r", String(Math.round(s.exitRatio * B)))
  if (
    s.staggerMs !== DEFAULT_STATE.staggerMs ||
    s.staggerDecay !== DEFAULT_STATE.staggerDecay
  ) {
    p.set("sg", `${Math.round(s.staggerMs)}.${Math.round(s.staggerDecay * B)}`)
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

  const d = p.get("d")?.split(".")
  if (d?.length === 3) {
    const base = num(d[0], 1, 60000)
    const ratio = num(d[1], 101, 400)
    const snap = num(d[2], 0, 1000)
    if (base !== undefined) out.base = Math.round(base)
    if (ratio !== undefined) out.ratio = ratio / B
    if (snap !== undefined) out.snap = Math.round(snap)
  }

  const pins = decodePins(p.get("dp"))
  if (pins) out.pins = pins

  const easings = {} as Record<Emphasis, Easing>
  let anyEasing = false
  for (const e of EMPHASIS_NAMES) {
    const decoded = decodeEasing(p.get(EASING_PARAM[e]))
    if (decoded) {
      easings[e] = decoded
      anyEasing = true
    }
  }
  // Fill the gaps from defaults so a link carrying one easing still works.
  if (anyEasing) out.easings = { ...DEFAULT_STATE.easings, ...easings }

  const df = decodeDurationFor(p.get("pd"))
  if (df) out.durationFor = df
  const pe = decodePurposeEmphasis(p.get("pe"))
  if (pe) out.purposeEmphasis = pe

  const r = num(p.get("r"), 10, 200)
  if (r !== undefined) out.exitRatio = r / B

  const sg = p.get("sg")?.split(".")
  if (sg?.length === 2) {
    const ms = num(sg[0], 0, 1000)
    const decay = num(sg[1], 0, 200)
    if (ms !== undefined) out.staggerMs = Math.round(ms)
    if (decay !== undefined) out.staggerDecay = decay / B
  }

  const tol = num(p.get("tol"), 1, 2000)
  if (tol !== undefined) out.tolerance = tol / 10000

  return out
}

/** A complete state, filling anything the query string didn't supply. */
export function resolveState(search: string): MotionState {
  const decoded = decodeState(search)
  return {
    ...DEFAULT_STATE,
    ...decoded,
    pins: decoded.pins ?? DEFAULT_STATE.pins,
    easings: decoded.easings ?? DEFAULT_STATE.easings,
    durationFor: decoded.durationFor ?? DEFAULT_STATE.durationFor,
    purposeEmphasis: decoded.purposeEmphasis ?? DEFAULT_STATE.purposeEmphasis,
  }
}

/** True while the visitor is still looking at the untouched defaults. */
export function isDefaultState(s: MotionState): boolean {
  return encodeState(s) === encodeState(DEFAULT_STATE)
}
