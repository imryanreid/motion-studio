// ==============================================
// SITE CONSTANTS
// The public address of the app. Share links are
// built from this rather than window.location, so a
// link copied from a preview deploy still points
// somewhere stable.
//
// Override per-environment with VITE_SITE_URL. Falls
// back to production so a plain `pnpm build` is always
// correct.
// ==============================================
export const SITE_URL: string = (
  import.meta.env.VITE_SITE_URL ?? "https://www.springs.studio"
).replace(/\/+$/, "")
