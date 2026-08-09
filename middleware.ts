// ==============================================
// ROUTING MIDDLEWARE
// Sends "/" to the renderer that puts the motion set
// into the HTML.
//
// This can't be a `rewrites` rule in vercel.json:
// rewrites are evaluated after the filesystem check,
// and "/" is already satisfied by the static
// index.html, so such a rule never fires. Middleware
// runs before that check.
//
// Every "/" request comes through here, including the
// bare homepage — that's the URL an agent lands on
// when it was told the tool's name but given no link,
// so it has to find the default set and the query
// contract in the page itself.
//
// Only "/" is matched, so /index.html stays a plain
// file and api/render can fetch it as the shell
// without recursing.
//
// No dependency on @vercel/functions: its `rewrite()`
// is exactly a 200 with an `x-middleware-rewrite`
// header, which is the wire format Vercel reads. Ramps
// uses the package; this does the same thing in three
// lines, and this tool is meant to stay
// zero-maintenance.
// ==============================================
export const config = { matcher: "/" }

export default function middleware(request: Request): Response {
  const url = new URL(request.url)
  const target = new URL("/api/render", url)
  target.search = url.search
  return new Response(null, {
    headers: { "x-middleware-rewrite": target.toString() },
  })
}
