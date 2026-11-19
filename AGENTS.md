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

## Known issue: OpenCode 2.3.2 / opentui 0.8.4 idle render gate (diagnosed 2026-11-18)

The live composer-top clock only repaints when the host is active (prompt submission, model streaming). Between activities it is frozen — and in a fresh idle session it never paints at all. **Not a plugin bug, not a Solid/component bug.** Root cause is isolated to `@opentui/core`'s native output-admission path, regressed between opentui 0.8.0 (shipped in opencode 2.2.5, where this plugin worked) and 0.8.4 (shipped in opencode 2.3.2, binary updated 2026-11-17, where it broke). Upstream issue: TODO (fill in once filed against sst/opencode).

Evidence chain, all instrumented via temporary plugin-side diagnostics, idle ptys (120x40, zero input, `clock_repro.py`-style harness), and a shallow clone of `sst/opencode` + `sst/opentui` for source-level bisection (diagnostic code always reverted after each finding — `git status` clean in this repo):

1. **Plugin/Solid layer is fully healthy and stays healthy.** `setup()` runs, the slot's `render` callback fires exactly once at fresh boot, `UnixPrompt` mounts and **never unmounts** for the life of the session, timers fire (60s clock, 30s git poll), and the mounted `<text>` ref stays attached to the same stable parent box, visible, not destroyed, across 170+ seconds of idle probing.
2. **The painted content does update.** A tree-walk of `renderer.root` during a live (non-repro) session showed our `┌ [HH:MM]` text node's string children changing value in place (`22:08` → `22:09` → `22:11` → `22:16` → `22:26`) over real time, confirming the Solid signal → opentui renderable pipeline propagates correctly.
3. **The render loop runs continuously at full target FPS with no backlog.** `nativeSession.lib.sessionGetRendererState()` showed `framePending=false`, `droppedFrames=0`, `droppedFrameBytes=0` throughout, with `frameCount` incrementing at ~55-60/s (matching `targetFps=30`/`maxFps=60`) for the entire idle window — not stalled, not stuck in a backlog.
4. **Yet terminal output bytes are completely unchanged, byte-for-byte, across the whole idle window** (captured via a scripted pty), regardless of plugin-side `renderer.requestRender()`, `requestLive()`+`dropLive()`, or forcing the render loop to run continuously — all three verified to execute without producing a single additional byte of output.
5. **`OTUI_STDOUT_THREAD=false` (opentui's native-writer-thread killswitch) has zero effect** — ruling out the native stdout writer thread as the stall point.
6. **On any host activity (prompt submission) output flushes instantly** — the clock line paints at its then-current time, the message's own admission stamp appears, and the response streams normally.
7. **Source-level bisection**: `@opentui/core` pinned version went `0.8.0` → `0.8.4` in exactly the opencode 2.2.5 → 2.3.2 window (`package.json` resolutions). That diff introduces a new `renderer.frame-admission.test.ts` suite (+201 lines) describing exactly this shape of behavior ("frame admission bounds delayed output to one frame... [frames] coalesce... until driver.idle()"), plus substantial `NativeSession.ts`/`renderer.ts` changes around output backpressure (`CAPTURED_STDOUT_HIGH_WATER_BYTES`, `drainPending`, `takeDrain`). The underlying Zig admission gate is `FeedBackend.prepareFrame()` in `packages/native/src/renderer-output.zig`, which returns `.skipped` when the span feed hasn't drained; `CliRenderer.presentNativeScene()` in `packages/core/src/renderer.ts` retries a `Skipped` status via `scheduleRenderAfterOutputIdle()`. This gate is unchanged on opentui's current `main` (0.9.3 as of 2026-11-18), so the bug is still live upstream.
8. The per-message admission stamp (`┌ [...]` above each submitted prompt in the transcript) is static **by design** and must not be confused with the clock freeze: each stamp records its prompt's submission time.

Re-verify against newer opencode/opentui versions before attempting further fixes; check `opencode --version` and whether idle repaint works again (any idle pty capture showing a changing `┌ [...]` within 2 minutes). If a host/opentui fix lands, the plugin needs no change. Do not re-add plugin-side nudges — `requestRender`/`requestLive`/`dropLive`/forcing the loop are all proven no-ops against this gate; the fix has to land in opentui's native output admission path.


## Conventions

- `pnpm build && pnpm typecheck` must be green before any commit.
- Plugin id: `jsherron.unix-prompt`. Cleanup function unregisters the slot; component intervals cleared via `onCleanup`.

Access: public — no Cloudflare involvement; no Access default applies.
