# oc-unix-prompt

> ⚠️ **NOT OFFICIAL OPENCODE.** Not affiliated with or endorsed by the OpenCode project.
> NO WARRANTIES, EXPRESS OR IMPLIED. Effectively untested personal plugin — read the
> source before you install. You assume all risk. See [DISCLAIMER.md](./DISCLAIMER.md).

An [OpenCode](https://opencode.ai) V2 TUI plugin that renders a UNIX-style prompt line above the composer:

```
┌ [Sat Oct 31 14:22] ~/src ── main✚
```

- **Date/time** — day-of-week, month, day, HH:MM; refreshed every 60 seconds
- **Working directory** — abbreviated with `~`, reactive to location changes
- **Git branch + dirty marker** — branch name, `✚` when the worktree has uncommitted changes; probed with `git status --porcelain` every 30 seconds; blank segment outside a git repo

Deliberately minimal: the OpenCode TUI already shows model, context usage, and session cost elsewhere. No hardcoded colors — everything uses the active theme's tokens.

## Install

Point `cli.json` (TUI-only settings, **not** `opencode.json`) at the package:

```json
{
  "plugins": ["/path/to/oc-unix-prompt"]
}
```

Or install from a git clone and reference the local path. Config hot-reloads; no TUI restart needed.

> Slots only render in interactive TUI mode — non-interactive `opencode run` shows nothing.

## Build

```sh
pnpm install
pnpm verify        # esbuild bundle + tsc --noEmit
```

`pnpm build` produces `dist/tui.js`, which is what the `./tui` export points at.

## Rollback

Remove the path from `cli.json` — the plugin unloads on live config reload and the composer renders unmodified. Nothing else persists: the interval and slot are released via the setup cleanup function.

## Roadmap (not implemented)

- Distinguish agent-made vs. pre-existing dirty state (red vs. dim `✚`) using the session's diff data
- Warning marker when the configured model diverges from the actually-loaded model
- Optional `/unix-prompt` toggle, pending-permission count, subagent badge

## License

MIT — see [LICENSE](./LICENSE). Not affiliated with OpenCode; see the disclaimer above.
