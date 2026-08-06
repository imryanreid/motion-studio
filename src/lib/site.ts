// ==============================================
// SITE CONSTANTS
// The public address of the app. Share links are
// built from this rather than window.location, so a
// link copied from a preview deploy still points
// somewhere stable.
//
// No custom domain yet, so this is the Vercel URL.
// It changes together with the canonical tag, the
// sitemap, robots.txt and the manifest entry in Ramps
// Studio — see "There is no domain yet" in CLAUDE.md.
// ==============================================
export const SITE_URL: string = (
  import.meta.env.VITE_SITE_URL ?? "https://motion-studio-silk.vercel.app"
).replace(/\/+$/, "")
