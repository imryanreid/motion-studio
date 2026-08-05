# Project Map

> **What this file is for:** An inventory of every file and what it does, in
> plain language. Update it whenever files are created, renamed, or moved. Not a
> spec, not a changelog — see [`NEXT-UP.md`](NEXT-UP.md) for session state and
> [`README.md`](README.md) for what the product is.

## Root

| File             | What it does                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`     | The page shell Vite builds around. Deliberately carries no canonical or `og:url` and is `noindex` until the domain is registered. |
| `vite.config.ts` | Build config. React + Tailwind plugins, React deduping, and `base: "./"` so the build also runs opened off disk.                  |
| `tsconfig.json`  | TypeScript settings. Strict, no emit.                                                                                             |
| `package.json`   | Dependencies and scripts.                                                                                                         |
| `.mise.toml`     | Pins the toolchain: Node 22, pnpm 10.                                                                                             |
| `LICENSE`        | MIT.                                                                                                                              |

## `scripts/`

| File             | What it does                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sync-shared.sh` | Pulls `src/shared` from Ramps Studio, which is upstream. `--check` diffs and exits non-zero instead. Wired up as `pnpm sync` and `pnpm sync:check`. Copied, not authored here. |

## `src/`

| File            | What it does                                                                        |
| --------------- | ----------------------------------------------------------------------------------- |
| `main.tsx`      | Entry point. Mounts `App`, loads the stylesheet, attaches the Vercel beacons.       |
| `App.tsx`       | Motion-specific wiring. A placeholder today — renders the shared shell and a note.  |
| `index.css`     | Imports the shared tokens. Tool-specific rules go here when the previews need them. |
| `vite-env.d.ts` | This app's ambient types. Shared code brings its own (`src/shared/env.d.ts`).       |

### `src/shared/` — copied from Ramps Studio, do not edit here

Authored upstream and synced with `pnpm sync`. Never imports from `src/lib/` or
`src/components/`. See [`CLAUDE.md`](CLAUDE.md).

| File                           | What it does                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `tools.ts`                     | The tools manifest — the whole family in one list, plus its plain-text rendering. |
| `tokens.css`                   | Fonts, the Tailwind theme, the five color tokens, dark mode, reduced motion.      |
| `motion.ts`                    | Springs, easings, durations, and the hover-lift class.                            |
| `theme.ts`                     | `useTheme()` — light/dark state, persistence, and the `.dark` class.              |
| `utils.ts`                     | `cn()` — merges Tailwind classes via clsx + tailwind-merge.                       |
| `clipboard.ts`                 | `copyToClipboard` plus the `useCopy` hook behind every "Copied" confirmation.     |
| `env.d.ts`                     | Vite client types, so `shared/` compiles without the host repo's declarations.    |
| `components/ToolShell.tsx`     | The three-row page: utility row, title row, control band, output, footer.         |
| `components/ToolSwitcher.tsx`  | The family menu, hung off the eyebrow wordmark.                                   |
| `components/ToolDirectory.tsx` | The same list in the footer, as plain anchors — the no-JavaScript half.           |
| `components/Segmented.tsx`     | The segmented control, with its spring pill.                                      |
| `components/Label.tsx`         | `Label` and `FieldLabel` — the family's one control-label treatment.              |
| `components/IconButton.tsx`    | The 40px utility-row button, in three variants.                                   |
| `components/ThemeToggle.tsx`   | Sun/moon crossfade.                                                               |
| `components/ResetButton.tsx`   | Reset that becomes its own undo for a few seconds.                                |
| `components/ShareButton.tsx`   | Copies a link; takes a finished URL.                                              |
| `components/ExportModal.tsx`   | The dialog shell every tool's export flow renders into.                           |
| `components/CopyText.tsx`      | Inline text that copies itself.                                                   |
| `components/CopyButton.tsx`    | Icon button that copies and crossfades to a check.                                |
| `components/RowToggle.tsx`     | The per-row export checkbox, including the mixed state.                           |
| `components/Attribution.tsx`   | The colophon, and the two images it uses.                                         |
