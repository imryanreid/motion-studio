// ==============================================
// AGENT PAYLOAD TESTS
// The page's title claims an agent can read this
// site. These are the assertions that keep that
// claim true — the no-JS document has to carry the
// tokens, not just a promise of them.
// ==============================================
import { describe, it, expect } from "vitest"
import { buildAgentPayload, publicOrigin } from "./agent.js"
import { DEFAULT_STATE, PURPOSE_IDS, tokenKey } from "./tokens.js"
import { encodeState, resolveState } from "./params.js"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { GET as render } from "../../api/render.js"
import { GET as tokens } from "../../api/tokens.js"

const ORIGIN = "https://www.springs.studio"
const SHELL = `<!doctype html><html><head>
<link rel="canonical" href="${ORIGIN}/" />
<meta name="description" content="original" />
<meta property="og:url" content="${ORIGIN}/" />
<meta name="robots" content="index, follow" />
</head><body><div id="root"></div></body></html>`

/** Stubs the shell fetch that api/render does, and restores afterwards. */
async function withShell<T>(html: string, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as never
  try {
    return await fn()
  } finally {
    globalThis.fetch = real
  }
}

describe("buildAgentPayload", () => {
  it("carries every exported token", () => {
    const { json } = buildAgentPayload("", ORIGIN)
    const motions = json.motions as { slug: string; enter?: unknown; exit?: unknown }[]
    expect(motions).toHaveLength(DEFAULT_STATE.entries.length)
    for (const m of motions) {
      expect(m.enter).toBeDefined()
      expect(m.exit).toBeDefined()
    }
  })

  it("gives every token a directly usable CSS value", () => {
    const { json } = buildAgentPayload("", ORIGIN)
    for (const m of json.motions as { enter: { css: string }; exit: { css: string } }[]) {
      for (const dir of [m.enter, m.exit]) {
        expect(dir.css).toMatch(/^(cubic-bezier|linear)\(/)
      }
    }
  })

  it("omits an excluded token and the alias that pointed at it", () => {
    const held = {
      ...DEFAULT_STATE,
      excluded: [tokenKey(DEFAULT_STATE.entries[0].id, "exit")],
    }
    const { json } = buildAgentPayload(encodeState(held), ORIGIN)
    const first = (json.motions as { slug: string; exit?: unknown }[])[0]
    expect(first.exit).toBeUndefined()
    // "state" points at the first motion, so it loses its exit alias too.
    const purposes = json.purposes as Record<string, { enter?: string; exit?: string }>
    expect(purposes.state.exit).toBeUndefined()
    expect(purposes.state.enter).toBeDefined()
  })

  it("builds share links from the forwarded host, not the internal one", () => {
    const req = new Request("https://internal.vercel.app/?x=1", {
      headers: { "x-forwarded-host": "www.springs.studio", "x-forwarded-proto": "https" },
    })
    expect(publicOrigin(req)).toBe(ORIGIN)
  })
})

describe("GET / (api/render)", () => {
  it("puts the tokens in the document, both as JSON and as text", async () => {
    const res = await withShell(SHELL, () => render(new Request(`${ORIGIN}/`)))
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('id="motion-studio-tokens"')
    // The <pre> is what survives HTML-to-markdown conversion.
    expect(html).toContain("<pre>")
    expect(html).toContain("motion.subtle.enter")
    expect(html).toContain('<div id="root">')
  })

  it("emits JSON a parser can actually read", async () => {
    const res = await withShell(SHELL, () => render(new Request(`${ORIGIN}/`)))
    const html = await res.text()
    const raw = html.match(
      /<script type="application\/json" id="motion-studio-tokens">\s*([\s\S]*?)\s*<\/script>/,
    )
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw![1]) as { motions: unknown[]; formats: { css: string } }
    expect(parsed.motions.length).toBeGreaterThan(0)
    expect(parsed.formats.css).toContain("--motion-")
  })

  it("leaves the bare homepage indexable", async () => {
    const res = await withShell(SHELL, () => render(new Request(`${ORIGIN}/`)))
    const html = await res.text()
    expect(html).toContain('<meta name="robots" content="index, follow" />')
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/" />`)
  })

  it("makes a shared set self-canonical and keeps it out of the index", async () => {
    const search = encodeState(DEFAULT_STATE)
    const res = await withShell(SHELL, () => render(new Request(`${ORIGIN}/?${search}`)))
    const html = await res.text()
    expect(html).toContain('<meta name="robots" content="noindex, follow" />')
    // Escaped, because it goes into an attribute — "&" between params becomes
    // "&amp;" or the document is malformed.
    expect(html).toContain(
      `<link rel="canonical" href="${ORIGIN}/?${search.replace(/&/g, "&amp;")}" />`,
    )
    expect(html).not.toContain('content="original"')
  })

  it("refuses to graft tokens onto a page that isn't ours", async () => {
    // Vercel Deployment Protection serves an SSO login page with a 200 to the
    // internal shell fetch. Wrapping the wrong document is worse than not
    // wrapping one, so this has to pass straight through.
    const res = await withShell("<html><body>Authentication Required</body></html>", () =>
      render(new Request(`${ORIGIN}/`)),
    )
    const html = await res.text()
    expect(html).not.toContain("motion-studio-tokens")
    expect(html).toContain("Authentication Required")
  })

  it("cannot be made to close its own block or inject a script", async () => {
    // Two layers have to hold: sanitizeName strips the metacharacters when the
    // URL is decoded, and escapeHtml catches anything that reaches the
    // document anyway. This asserts the property both exist for, rather than
    // either mechanism — a name must never become markup.
    const evil = encodeState({
      ...DEFAULT_STATE,
      entries: [{ ...DEFAULT_STATE.entries[0], name: "</pre><script>x" }],
    })
    const res = await withShell(SHELL, () => render(new Request(`${ORIGIN}/?${evil}`)))
    const html = await res.text()
    expect(html).not.toContain("<script>x")
    expect(html).not.toContain("</pre><script")
    // And the block is still well-formed: exactly one agent <pre>, JSON intact.
    const block = html.slice(html.indexOf('<div id="agent-motion">'))
    expect(block.match(/<\/pre>/g)).toHaveLength(1)
    const raw = block.match(/id="motion-studio-tokens">\s*([\s\S]*?)\s*<\/script>/)
    expect(() => JSON.parse(raw![1])).not.toThrow()
  })
})

describe("GET /api/tokens", () => {
  it("returns parseable JSON with permissive CORS", async () => {
    const res = tokens(new Request(`${ORIGIN}/api/tokens`))
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    const body = JSON.parse(await res.text()) as { tool: string; purposes: object }
    expect(body.tool).toBe("Motion")
    expect(Object.keys(body.purposes).length).toBeGreaterThan(0)
  })
})

/**
 * The same pipeline against the real built document.
 *
 * The synthetic shell above proves the logic; this proves the regexes match
 * the head Vite and prettier actually emit. A tag reformatted onto two lines
 * silently stops matching, and the failure mode is a shared link quietly
 * announcing itself as a duplicate of the homepage — invisible in a browser.
 */
describe("against the built dist/index.html", () => {
  // fileURLToPath, not .pathname — the repo lives under "Studio Tools" and a
  // percent-encoded space makes existsSync false, which silently skips the
  // only tests that check the real document.
  const dist = fileURLToPath(new URL("../../dist/index.html", import.meta.url))
  const run = existsSync(dist) ? it : it.skip

  run("injects into the real shell and rewrites the real head", async () => {
    const built = readFileSync(dist, "utf8")
    expect(built).toContain('<div id="root">')

    const search = encodeState(DEFAULT_STATE)
    const res = await withShell(built, () => render(new Request(`${ORIGIN}/?${search}`)))
    const html = await res.text()

    // The block landed.
    expect(html).toContain('id="motion-studio-tokens"')
    expect(html).toContain("motion.subtle.enter")

    // And every head rewrite actually fired against the real markup.
    expect(html).toContain('<meta name="robots" content="noindex, follow" />')
    expect(html).toContain(`href="${ORIGIN}/?${search.replace(/&/g, "&amp;")}"`)
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}/?`)
    expect(html).not.toContain('<meta name="robots" content="index, follow" />')
  })

  run("leaves the real homepage head alone", async () => {
    const built = readFileSync(dist, "utf8")
    const res = await withShell(built, () => render(new Request(`${ORIGIN}/`)))
    const html = await res.text()
    expect(html).toContain('<meta name="robots" content="index, follow" />')
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/" />`)
    expect(html).toContain('id="motion-studio-tokens"')
  })
})

/**
 * llms.txt is a contract, and a wrong contract is worse than none — an agent
 * follows it confidently and builds a URL that decodes to something else.
 *
 * This shipped wrong once: the file documented spring mass as a plain number
 * when the codec scales it by 100, so the documented `mass: 1` decoded as
 * 0.01 — a spring a hundred times stiffer than asked for. It also called the
 * tolerance "thousandths" when it is ten-thousandths. Both were invisible
 * until something actually parsed the example.
 */
describe("llms.txt is true", () => {
  const file = fileURLToPath(new URL("../../public/llms.txt", import.meta.url))
  const contract = readFileSync(file, "utf8")

  it("documents an example that decodes to what it claims", () => {
    const link = contract.match(/https:\/\/www\.springs\.studio\/\?(\S+)/)
    expect(link, "llms.txt must carry a worked example URL").not.toBeNull()

    const state = resolveState(link![1])
    expect(state.entries).toHaveLength(1)
    const e = state.entries[0]
    expect(e.name).toBe("pop")
    expect(e.durationMs).toBe(300)
    expect(e.staggerMs).toBe(40)
    expect(e.exitRatio).toBeCloseTo(0.7)
    expect(e.easing.kind).toBe("spring")
    // The values the file spells out in prose, decoded.
    expect(e.easing.kind === "spring" && e.easing.spring).toMatchObject({
      stiffness: 400,
      damping: 12,
      mass: 1,
    })
    // And every purpose points at it, as the example says.
    expect(new Set(Object.values(state.purposeEntry))).toEqual(new Set([e.id]))
  })

  it("documents the purposes the code actually has, in the order pu expects", () => {
    const listed = contract
      .split("Purposes, in the order `pu` expects them:")[1]
      .split("\n")[1]
      .split(",")
      .map((p) => p.trim())
    expect(listed).toEqual([...PURPOSE_IDS])
  })

  it("documents the tolerance scale correctly", () => {
    expect(contract).toContain("ten-thousandths")
    expect(resolveState("tol=100").tolerance).toBeCloseTo(0.01)
    expect(resolveState("tol=30").tolerance).toBeCloseTo(0.003)
  })

  it("only advertises endpoints that exist", () => {
    expect(contract).toContain("/api/tokens")
    // Ramps' endpoint name, easy to copy by accident when adapting the file.
    expect(contract).not.toContain("/api/palette")
  })
})
