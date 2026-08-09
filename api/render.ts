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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const origin = publicOrigin(request)

  // The built shell, fetched as a static asset. "/index.html" isn't matched by
  // the rewrite that sent us here, so this can't recurse.
  const shell = await fetch(new URL("/index.html", url.origin), {
    headers: { "user-agent": "motion-studio-render" },
  })
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
      headers: { "content-type": shell.headers.get("content-type") ?? "text/html" },
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
      headers: { "content-type": "text/html; charset=utf-8" },
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
        `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      )
      .replace(
        /(<meta\s+name="description"\s+content=")[^"]*(")/s,
        `$1${escapeHtml(summary)}$2`,
      )
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeHtml(canonical)}$2`)
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
  const injected = `
<div id="agent-motion">
<script type="application/json" id="motion-studio-tokens">
${JSON.stringify(json)}
</script>
<pre>
${escapeHtml(text)}
</pre>
</div>`

  html = html.replace("</body>", `${injected}\n</body>`)

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Deterministic for a given query string.
      "cache-control": "public, max-age=0, s-maxage=31536000, must-revalidate",
    },
  })
}
