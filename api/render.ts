// ==============================================
// GET /
//
// The site is a client-rendered SPA, so a plain fetch
// of a share link returned an empty <div id="root">
// — nothing an agent could read without executing
// JavaScript, which most agents following a pasted
// link don't do. The page's own title says "semantic
// tokens your agent can read"; this is what makes
// that true.
//
// Same index.html, with the motion set injected. The
// React app still boots and takes over; the injected
// block sits outside #root so hydration never touches
// it, and main.tsx removes it once React mounts.
//
// The bare homepage comes through here too, carrying
// the default set — that's where an agent lands when
// it was told the tool's name but given no link.
// ==============================================
import { buildAgentPayload, publicOrigin } from "../src/lib/agent.js"
import { encodeState } from "../src/lib/params.js"

/**
 * Escapes for an HTML attribute. Always pass its result through a *replacer
 * function*, never a replacement string.
 *
 * `String.replace` expands `$&`, `` $` ``, `$'` and `$1` inside a replacement
 * string, and that expansion happens after this function runs — so a `$` in an
 * escaped value could splice a chunk of the surrounding document into an
 * attribute and break out of it. Escaping cannot prevent it; only avoiding the
 * string form can. A function's return value is inserted literally.
 *
 * Nothing reaching here can contain a `$` today, but that invariant lives in
 * sanitizeName in src/lib/tokens.ts — far from this file, and easy to widen
 * without ever looking here.
 */
/**
 * JSON that is safe to sit inside a `<script>` element.
 *
 * `JSON.stringify` does not escape `<`, so any string reaching the payload
 * could carry `</script>` and end the element early — everything after it is
 * then parsed as live HTML. That is not hypothetical: a crafted `pu` parameter
 * did exactly this on production, and `s-maxage=31536000` pinned the result at
 * the edge.
 *
 * `\u003c` is valid JSON and parses back to `<` identically, so no consumer
 * can tell the difference. Escaping here rather than at each field closes the
 * category for every field that gets added later.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Headers every HTML response carries.
 *
 * Not a full CSP — Vite's output plus the inline JSON-LD would need hashes or
 * a nonce, which is real design work and worse half-done. These three are free
 * and independently useful: nosniff matters because this route echoes
 * URL-derived content, the referrer policy matters because the URL *is* the
 * user's palette or motion set and a full path would leak it to every outbound
 * link, and frame-ancestors is cheap clickjacking cover for a page of controls.
 */
const SAFE_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "frame-ancestors 'self'",
} as const

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const origin = publicOrigin(request)

  // The built shell, fetched as a static asset. "/index.html" isn't matched by
  // the rewrite that sent us here, so this can't recurse.
  //
  // Never a cached copy, and this is not paranoia — it shipped broken once.
  // "/index.html" is a stable URL whose contents change every deployment, so a
  // CDN hit can hand this function the *previous* build's shell: stale meta
  // tags, and asset hashes that now 404. The homepage then serves current
  // tokens grafted onto a document whose JavaScript no longer exists, which
  // looks fine to an agent and is completely broken for a person.
  //
  // This used to add a per-deployment `__build` query key and describe it as a
  // guarantee behind `no-store`'s hint. IT WAS NEVER A GUARANTEE. Vercel does
  // not key static-asset cache entries on the query string: three requests
  // with different random `__build` values, and one with none at all, all came
  // back `x-vercel-cache: HIT` with an identical `age` — the same single entry
  // every time. The key bought nothing while making a false promise, which is
  // worse than an honest single defence.
  //
  // So: two asks that actually reach different layers. `cache: "no-store"` is
  // the fetch API's own cache mode; `cache-control: no-cache` is a request
  // header any intermediary is expected to honour. Both are still requests
  // rather than guarantees.
  //
  // For a real guarantee the options are fetching the shell from the
  // per-deployment host (`VERCEL_URL`) instead of the alias, or reading it off
  // disk rather than over HTTP. The first is not taken because deployment
  // hosts are SSO-gated when Deployment Protection is on — the exact failure
  // the guard below already exists to catch.
  const shellUrl = new URL("/index.html", url.origin)
  // Bounded, with one retry. This fetch had no timeout: if it hung, the
  // invocation held a Fluid Compute concurrency slot until the 300s default —
  // I/O wait, so unbilled, but slots are the contended resource under load.
  const fetchShell = () =>
    fetch(shellUrl, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
      headers: { "user-agent": "motion-studio-render", "cache-control": "no-cache" },
    })

  let shell: Response
  try {
    shell = await fetchShell()
  } catch {
    try {
      shell = await fetchShell()
    } catch {
      return new Response("Unable to load the page shell.", { status: 502 })
    }
  }

  if (!shell.ok) {
    return new Response("Unable to load the page shell.", { status: 502 })
  }
  let html = await shell.text()

  // Make sure what came back is actually our shell before injecting into it.
  //
  // `shell.ok` is not enough. With Vercel Deployment Protection on — the
  // default for preview deployments — this internal fetch is intercepted and
  // served Vercel's SSO login page with a 200, so the guard above passes and
  // the tokens get grafted onto somebody else's document. Ramps hit exactly
  // this on a preview. Passing the response straight through instead means a
  // protected preview behaves sensibly and we never wrap the wrong page.
  if (!html.includes('<div id="root">')) {
    return new Response(html, {
      status: shell.status,
      headers: {
        ...SAFE_HEADERS,
        "content-type": shell.headers.get("content-type") ?? "text/html",
      },
    })
  }

  let payload: ReturnType<typeof buildAgentPayload>
  try {
    payload = buildAgentPayload(url.search, origin)
  } catch {
    // A set we can't compute shouldn't take the page down — fall back to the
    // untouched shell and let the client render it.
    return new Response(html, {
      status: 200,
      headers: { ...SAFE_HEADERS, "content-type": "text/html; charset=utf-8" },
    })
  }

  const { state, json, text } = payload
  const canonical = `${origin}/?${encodeState(state)}`
  const names = state.entries.map((e) => e.name).join(", ")
  const summary =
    `Motion tokens: ${state.entries.length} named motion${state.entries.length === 1 ? "" : "s"} ` +
    `(${names}), each with an entrance and a derived, faster exit, plus purpose aliases for ` +
    `components. Exports to CSS, Tailwind, Framer Motion and DTCG.`

  // Only a URL that actually asked for a set gets its <head> rewritten. The
  // bare homepage must keep `index, follow` and its own canonical — routing it
  // through here to pick up the readable block must not quietly deindex the
  // site's only indexable page.
  if (url.searchParams.has("e")) {
    html = html
      .replace(
        /<link rel="canonical" href="[^"]*" \/>/,
        () => `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      )
      .replace(
        /(<meta\s+name="description"\s+content=")[^"]*(")/s,
        (_m, open: string, close: string) => `${open}${escapeHtml(summary)}${close}`,
      )
      .replace(
        /(<meta property="og:url" content=")[^"]*(")/,
        (_m, open: string, close: string) => `${open}${escapeHtml(canonical)}${close}`,
      )
      // Keep parameterized sets out of the search index. Each is self-canonical
      // so it shares correctly, but `?e=` is an unbounded parameter space and
      // letting a crawler wander it would bloat the index of a site with one
      // real page. `follow` keeps outbound links live, and this says nothing to
      // agents — they fetch and read regardless of indexing directives.
      .replace(
        /<meta name="robots" content="[^"]*" \/>/,
        '<meta name="robots" content="noindex, follow" />',
      )
  }

  // Both shapes on purpose: HTML-to-markdown conversion — what most agents do
  // before reading a page — strips <script>, so JSON alone would be invisible
  // to the very tools this exists for. The <pre> survives that conversion.
  //
  // Deliberately carries no hiding styles. `display:none` would be the obvious
  // way to keep it from human eyes, but readability-style extractors honour
  // inline hiding and would skip the block, defeating the point. It ships
  // visible and main.tsx removes it once React mounts, so only JS-less readers
  // ever see it. It sits below the app, outside #root, so hydration never
  // touches it.
  // The one style this block may carry, and it is not a hiding style. A bare
  // <pre> is `white-space: pre`, so a long payload line lays out far wider than
  // a phone viewport and the document goes with it until this block is removed,
  // leaving a phone scrolled sideways into empty space. Wrapping costs nothing:
  // the text stays fully present and fully extractable, which is the property
  // the comment above is protecting. `display:none` is still forbidden.
  const injected = `
<div id="agent-motion">
<script type="application/json" id="motion-studio-tokens">
${jsonForScript(json)}
</script>
<pre style="white-space:pre-wrap;word-break:break-word">
${escapeHtml(text)}
</pre>
</div>`

  // A replacer function here too, and this one matters more than the head
  // rewrites: `injected` carries the whole payload — the DTCG JSON alone
  // contributes dozens of "$" in $type/$value/$extensions, plus names and free
  // text. None of it forms an expandable sequence today, but nothing
  // constrains it the way the URL charset constrains a parameter, so this is
  // the instance least likely to stay safe by accident.
  html = html.replace("</body>", () => `${injected}\n</body>`)

  return new Response(html, {
    status: 200,
    headers: {
      ...SAFE_HEADERS,
      "content-type": "text/html; charset=utf-8",
      // Deterministic for a given query string, but NOT across deployments —
      // this HTML embeds the built shell, so it names hashed asset filenames
      // that only exist for as long as that build does. That makes it a
      // function of (query string, deployment), and a cache key that captures
      // only the first half must not outlive the second by much.
      //
      // It used to say s-maxage=31536000. A year is correct for api/tokens,
      // whose JSON really is a pure function of the URL — and wrong here, for
      // a reason that is structural rather than observed.
      //
      // BE CLEAR ABOUT THE EVIDENCE: no stale-HTML failure has ever been seen
      // in production. Deploys were measured purging the edge, and every site
      // was byte-identical to a local build when checked. This is insurance
      // against an unbounded tail, not a fix for a live bug — an earlier draft
      // of this comment claimed a reproduction that had not happened, which is
      // worse than saying nothing.
      //
      // The tail is what makes it worth bounding anyway: HTML that names a
      // build cannot safely outlive that build, and the only thing keeping a
      // year-long entry honest is Vercel invalidating on deploy — real, but
      // external, undocumented here, and not something this file can assert.
      // 60s still absorbs a burst, so a link shared to a crowd hits the
      // function once, while capping a badly-timed entry at a minute.
      //
      // `must-revalidate` was already here and was inert either way: it governs
      // what a cache does once an entry is STALE, and nothing went stale for a
      // year.
      "cache-control": "public, max-age=0, s-maxage=60, must-revalidate",
    },
  })
}
