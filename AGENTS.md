# oc-unix-prompt — project context

OpenCode V2 TUI plugin. Renders a UNIX-style prompt line (`┌ [date time] ~/path ── branch✚`) above the composer via the `session.composer.top` slot.

## Key facts

- TUI-only plugin: the `./tui` export is loaded by the OpenCode TUI client, configured in `~/.config/opencode/cli.json` `plugins` array (NOT `opencode.json`).
- Build: esbuild bundles `src/tui.tsx` → `dist/tui.js` (`--platform=node` — required because the plugin shells out to git via `node:child_process`). `pnpm verify` = build + typecheck.
- UI rendering libs (`@opentui/core`, `@opentui/solid`, `solid-js`) are **devDependencies**; only `@opencode/plugin` is a runtime dependency. Everything is externalized in the bundle.
- `VcsInfo` from the OpenCode client has no dirty flag (`{ provider?, branch: { current?, default? } }`), so dirty state comes from `git status --porcelain -b` (execFile, 2s timeout, silent failure). Branch name parsed from the `## branch...` header line.
- Colors exclusively from `context.theme` tokens (`text.faint`, `text.muted`) — never hardcode hex.
- Slots do not render in non-interactive `opencode run` mode.
- Scope discipline: model/context/cost are already shown by the TUI — do not duplicate them here.

## Conventions

- `pnpm build && pnpm typecheck` must be green before any commit.
- Plugin id: `jsherron.unix-prompt`. Cleanup function unregisters the slot; component intervals cleared via `onCleanup`.

Access: public — no Cloudflare involvement; no Access default applies.
