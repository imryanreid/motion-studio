# Motion Token Generator

Part of **Studio Tools** — small, free, agent-readable design utilities.

Motion tokens are the least systematized part of most design systems, and the
reason is that nobody can preview them honestly or carry them across platforms.
This is meant to solve both: cubic-bezier and spring easing, a named duration
scale, deliberately asymmetric enter/exit pairs, previews on real UI rather than
a dot on a track, and exports for CSS, Tailwind, Framer Motion and DTCG
— with the cross-platform differences stated rather than hidden.

**Status: scaffolded, not built.** The shared layer and page shell are in place.
See [`NEXT-UP.md`](NEXT-UP.md).

## Local development

Requires Node 22 and pnpm (see `.mise.toml`).

```bash
pnpm install && pnpm dev
```

| Script            | Does                                                   |
| ----------------- | ------------------------------------------------------ |
| `pnpm dev`        | Vite dev server with hot reload                        |
| `pnpm build`      | Typecheck, then build to `dist/`                       |
| `pnpm test`       | Vitest                                                 |
| `pnpm sync`       | Pull `src/shared` from Ramps Studio                    |
| `pnpm sync:check` | Diff `src/shared` against Ramps Studio; fails on drift |
| `pnpm format`     | Prettier                                               |

`src/shared` is authored in [Ramps Studio](../Ramps%20Studio) and copied here.
Don't edit it in this repo — see [`CLAUDE.md`](CLAUDE.md).

## License

MIT — see [`LICENSE`](LICENSE). Built by
[Ryan Reid](https://www.linkedin.com/in/imryanreid/) at
[tktk studio](https://www.tktk.studio/).
