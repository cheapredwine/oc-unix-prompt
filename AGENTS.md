# oc-unix-prompt — project context

OpenCode V2 TUI plugin. Renders a UNIX-style prompt line (`┌ [date time] ~/path ── branch✚`) above the composer via the `session.composer.top` slot.

## Key facts

- Two-part plugin: `./tui` (TUI client) + `.` (server part, `session.hook("prompt")` admission stamp). Configured in `~/.config/opencode/opencode.jsonc` `plugins` — the TUI part auto-loads beside the server part; do NOT also list it in `cli.json` (duplicate slot).
- Build: esbuild bundles `src/tui.tsx` → `dist/tui.js` (`--platform=node` — required because the plugin shells out to git via `node:child_process`). `pnpm verify` = build + typecheck.
- UI rendering libs (`@opentui/core`, `@opentui/solid`, `solid-js`) are **devDependencies**; only `@opencode/plugin` is a runtime dependency. Everything is externalized in the bundle.
- `VcsInfo` from the OpenCode client has no dirty flag (`{ provider?, branch: { current?, default? } }`), so dirty state comes from `git status --porcelain -b` (execFile, 2s timeout, silent failure). Branch name parsed from the `## branch...` header line.
- Colors exclusively from `context.theme` tokens (`text.faint`, `text.muted`) — never hardcode hex.
- Slots do not render in non-interactive `opencode run` mode.
- Scope discipline: model/context/cost are already shown by the TUI — do not duplicate them here.
- The prompt stamp edits the canonical persisted user input: the model sees the timestamp too. Guard against double-stamping by checking for the `┌ [` prefix (retry-safety + commands that submit through `session.prompt`).

## Conventions

- `pnpm build && pnpm typecheck` must be green before any commit.
- Plugin id: `jsherron.unix-prompt`. Cleanup function unregisters the slot; component intervals cleared via `onCleanup`.

Access: public — no Cloudflare involvement; no Access default applies.
