# oc-unix-prompt — project context

OpenCode V2 TUI plugin. Renders a UNIX-style prompt line (`┌ [date time] ~/path ── branch✚`) above the composer via the `session.composer.top` slot.

## Key facts

- Two-part plugin: `./tui` (TUI client) + `.` (server part, `session.hook("prompt")` admission stamp). Configured in `~/.config/opencode/opencode.jsonc` `plugins` — the TUI part auto-loads beside the server part; do NOT also list it in `cli.json` (duplicate slot).
- Build: esbuild bundles `src/tui.tsx` → `dist/tui.js` (`--platform=node` — required because the plugin shells out to git via `node:child_process`). `pnpm verify` = build + typecheck.
- UI rendering libs (`@opentui/core`, `@opentui/solid`, `solid-js`) are **devDependencies**; only `@opencode/plugin` is a runtime dependency. Everything is externalized in the bundle.
- `VcsInfo` from the OpenCode client has no dirty flag (`{ provider?, branch: { current?, default? } }`), so dirty state comes from `git status --porcelain -b` (execFile, 2s timeout, silent failure). Branch name parsed from the `## branch...` header line.
- Colors exclusively from `context.theme` tokens — never hardcode hex. Per-segment coloring uses `<span style={{ fg: token }}>` children inside `<text>` (theme `RGBA` tokens are valid `ColorInput`). **Do NOT use `<text content={StyledText} />`**: the @opentui/solid reconciler stringifies non-string `content` props, so a StyledText renders as `[object Object]`. Bare `fg` props on `<span>` are also silently dropped — `setProperty` only honors `href` and `style` on text nodes; colors must go through `style`. Nested plain JSX text children crash (TextNodeRenderable rejects false/array children).
- The "current work" segment (visible only while the session is running) reads `context.data.session.status(sessionID)` and `message.list(sessionID)` — reactive reads over the host's event-driven store, no polling or network calls. It shows the first non-blank, non-stamp line of the latest user prompt, truncated to 48 chars. `@opencode/client` types are transitive-only: use structural local types, never import them.
- Slots do not render in non-interactive `opencode run` mode.
- Scope discipline: model/context/cost are already shown by the TUI — do not duplicate them here.
- The prompt stamp edits the canonical persisted user input (transcript keeps it); a matching `stripStamps` on the `context`/`compaction`/`generate`/`title` hooks removes the stamp line from outgoing model requests (zero token cost — request edits never write history). Guard against double-stamping by checking for the `┌ [` prefix (retry-safety + commands that submit through `session.prompt`). If the stamp format changes, keep `STAMP_RE` in sync — it must match `formatClock` output exactly.

## Known limitation: no idle-time repaint for plugin-slot content (investigated 2026-11-18/19, corrected)

The live composer-top clock only updates in response to host activity (keypress, prompt submission, server events). During true idle — nothing happening at all — it never repaints, including on a fresh boot where it never paints even once until the first activity. **This is not a version regression.** An earlier pass of this investigation incorrectly concluded it was a opentui 0.8.0→0.8.4 output-admission regression; that conclusion was reached by reading Zig/TS source and pattern-matching a test's description to the symptom, without actually running the alternate version. When tested directly, **both opencode 2.2.5 and 2.3.2 show byte-identical behavior**: a full-screen diff (via a real terminal emulator decoding the pty output, not raw-byte regex matching, which misses diff-only redraws) showed zero screen changes of any kind over 150+ seconds of idle in both versions. The regression theory is retracted.

**What is confirmed, directly tested (not inferred from source reading):**

1. **The plugin/Solid component is fully healthy.** It mounts once, never unmounts, stays visible and attached, and its content genuinely updates inside the renderable tree over real time (watched a timestamp tick from `22:08` to `22:26` in a live tree-dump).
2. **The render loop runs continuously at full target FPS with no backlog** (`framePending=false`, `droppedFrames=0`, `frameCount` incrementing at ~55-60/s) throughout the entire idle window.
3. **Yet the terminal screen is pixel-for-pixel frozen** — not just our plugin's line, the *entire* screen — confirmed via a real terminal emulator (`pyte`) decoding the actual rendered screen state, across 150+ seconds of zero-input idle. No cursor blink, no spinner, no ambient update of any kind. On any external activity it repaints instantly and correctly.
4. **Bare `@opentui/core` (no opencode host) correctly updates a timer/signal-driven text node during true idle**, in both opentui 0.8.0 and 0.8.4, confirmed the same way (pyte-decoded screen, zero input). So the underlying renderer is capable of this; something in opencode's own TUI host specifically suppresses it.
5. **The plugin API's own sanctioned live-update primitives do not help.** Tested directly: `context.renderer.requestLive()` held permanently for the component's lifetime — no effect. The exact pattern opencode's own `RetryProviderRenderable` component source uses (`requestLive()` + `setFrameCallback()`) — tested directly with a file-logged counter confirming the frame callback genuinely fires continuously at full rate — still produces zero repaints through a plugin slot. (Caveat: `RetryProviderRenderable`'s own animation only ever runs concurrently with genuine tool-call activity in practice, so it was never independently confirmed to work under true zero-activity idle either — this is not a confirmed "host-native works, plugin doesn't" comparison, just evidence that mimicking its API usage doesn't fix our case.)
6. **Ruled out as causes:** the opentui version (identical both ways), the native stdout writer thread (`OTUI_STDOUT_THREAD=false` has no effect), the session being in the pre-first-message "Greeting" state (freeze persists identically after a real first message), and every plugin-side repaint nudge tried (`requestRender`, `requestLive`+`dropLive`, forcing the render loop, `setFrameCallback`+`requestLive`).

**What remains unknown:** the actual mechanism inside opencode's TUI host that suppresses all self-driven (non-external-event) repaints. This would require instrumenting `sst/opencode`'s own TUI package (`packages/tui/src/plugin/` and its render-scheduling code), which has not been done. It is also genuinely unclear whether this is a bug (an oversight where `requestLive`/`setFrameCallback` should work but don't) or an intentional architectural choice (event-driven-only repaints, e.g. for SSH/bandwidth efficiency) that the plugin API's exposed primitives simply weren't built to override.

**Practical upshot for this plugin:** the clock line will only ever show the time as of the last host activity, not real time. Given no plugin-side fix exists (tested, confirmed), and the mechanism is uncertain enough that filing a confident "regression" bug report would be wrong (as the first attempt was), the honest options are: (a) accept the limitation and document it in the README, (b) ask the opencode maintainers directly whether `requestLive`/`setFrameCallback` are expected to work from plugin slots, without claiming a specific root cause, or (c) further instrument opencode's own TUI source if this matters enough to pursue.


## Conventions

- `pnpm build && pnpm typecheck` must be green before any commit.
- Plugin id: `jsherron.unix-prompt`. Cleanup function unregisters the slot; component intervals cleared via `onCleanup`.

Access: public — no Cloudflare involvement; no Access default applies.
