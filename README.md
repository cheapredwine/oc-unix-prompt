# oc-unix-prompt

> ⚠️ **NOT OFFICIAL OPENCODE.** Not affiliated with or endorsed by the OpenCode project.
> NO WARRANTIES, EXPRESS OR IMPLIED. Effectively untested personal plugin — read the
> source before you install. You assume all risk. See [DISCLAIMER.md](./DISCLAIMER.md).

An [OpenCode](https://opencode.ai) V2 plugin with two parts:

- **TUI part** — renders a UNIX-style prompt line above the composer:
  ```
  ┌ [Sat Oct 31 14:22] ~/src ── main✚
  ```
  date/time (60s refresh), abbreviated working directory (reactive), git branch + dirty marker (`git status` probe, 30s refresh), blank outside a repo. Per-segment colors via `<span style={{ fg }}>` children (time faint, cwd base, branch muted — theme tokens only).
- **Server part** — stamps every admitted user prompt with a `┌ [Sat Oct 31 14:22]` line at submission time, so the stamp carries into the transcript scrollback permanently. A `context`/`compaction`/`generate`/`title` hook strips the stamp from every outgoing model request, so the stamp costs **zero tokens**: persisted history keeps it, the wire never sees it.

- **Date/time** — day-of-week, month, day, HH:MM; refreshed every 60 seconds
- **Working directory** — abbreviated with `~`, reactive to location changes
Deliberately minimal: the OpenCode TUI already shows model, context usage, and session cost elsewhere. No hardcoded colors — everything uses the active theme's tokens.

## Install

Point `opencode.json` (or a project `.opencode/opencode.jsonc`) at the package:

```json
{
  "plugins": ["/path/to/oc-unix-prompt"]
}
```

The server part loads from this entry; the TUI part loads beside it automatically (its `./tui` export). Do **not** also list it in `cli.json` — that would render the composer slot twice.

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
- Restore model time-awareness (currently stripped alongside the stamp, per token-cost preference)
- Warning marker when the configured model diverges from the actually-loaded model
- Red vs. dim dirty marker: distinguish agent-made vs. pre-existing uncommitted changes
- Optional `/unix-prompt` toggle, pending-permission count, subagent badge

## License

MIT — see [LICENSE](./LICENSE). Not affiliated with OpenCode; see the disclaimer above.
