# oc-unix-prompt — project context

OpenCode V2 TUI plugin. Renders a UNIX-style prompt line (`┌ [date time] ~/path ── branch✚`) above the composer via the `session.composer.top` slot.

## Key facts

- Two-part plugin: `./tui` (TUI client) + `.` (server part, `session.hook("prompt")` admission stamp). Configured in `~/.config/opencode/opencode.jsonc` `plugins` — the TUI part auto-loads beside the server part; do NOT also list it in `cli.json` (duplicate slot).
- Build: esbuild bundles `src/tui.tsx` → `dist/tui.js` (`--platform=node` — required because the plugin shells out to git via `node:child_process`). `pnpm verify` = build + typecheck.
- UI rendering libs (`@opentui/core`, `@opentui/solid`, `solid-js`) are **devDependencies**; only `@opencode/plugin` is a runtime dependency. Everything is externalized in the bundle.
- `VcsInfo` from the OpenCode client has no dirty flag (`{ provider?, branch: { current?, default? } }`), so dirty state comes from `git status --porcelain -b` (execFile, 2s timeout, silent failure). Branch name parsed from the `## branch...` header line.
- Colors exclusively from `context.theme` tokens — never hardcode hex. Per-segment coloring builds styled-text chunks with the `fg(token)` chunk builder from `@opentui/core` (theme `RGBA` tokens are valid `ColorInput`) and assigns them through the renderable's `content` setter. **Do NOT use `<text content={StyledText} />`**: the @opentui/solid reconciler stringifies non-string `content` props, so a StyledText renders as `[object Object]`. Bare `fg` props on `<span>` are also silently dropped — `setProperty` only honors `href` and `style` on text nodes. Dynamic JSX children are evaluated once at mount under esbuild `--jsx=automatic` (see "Idle-render mystery" below), so per-tick text goes through the imperative `content` rebuild, not JSX signals.
- The "current work" segment (visible only while the session is running) reads `context.data.session.status(sessionID)` and `message.list(sessionID)` inside the per-tick content rebuild — memo reads over the host's event-driven store, evaluated once per second, no network calls. It shows the first non-blank, non-stamp line of the latest user prompt, truncated to 48 chars. `@opencode/client` types are transitive-only: use structural local types, never import them.
- Slots do not render in non-interactive `opencode run` mode.
- Scope discipline: model/context/cost are already shown by the TUI — do not duplicate them here.
- The prompt stamp edits the canonical persisted user input (transcript keeps it); a matching `stripStamps` on the `context`/`compaction`/`generate`/`title` hooks removes the stamp line from outgoing model requests (zero token cost — request edits never write history). Guard against double-stamping by checking for the `┌ [` prefix (retry-safety + commands that submit through `session.prompt`). If the stamp format changes, keep `STAMP_RE` in sync — it must match `formatClock` output exactly.

## Idle-render mystery: root-caused 2026-11-19 — plugin build bug, not an opencode bug (FIXED)

The composer-top clock line only showed the time as of the last mount. Three
earlier investigation passes produced two retracted wrong theories (a 2.3.2
"version regression", then an opentui 0.8.0→0.8.4 "output-admission
regression") before runtime instrumentation found the real mechanism. Full
evidence: probe plugin + pty harness logs in `~/src/outputs/oc-unix-prompt/idleprobe/`.

**Confirmed by runtime counters (opencode 2.3.2, @opentui/core 0.8.0):**

1. **opencode's renderer is on-demand by design.** The render loop only runs
   while live-requests are pending or a frame is requested; during true idle
   it is fully stopped (`ctl=idle`, `running=false`, zero frames, zero
   commits, zero pump activity for minutes). It repaints instantly on any
   frame request (keystroke, RAF, content change). Nothing is "suppressed" —
   the earlier "host suppresses idle repaints" theory is retracted.
2. **`requestLive()` works.** Held live, the loop runs at ~58fps, frames
   present, callbacks fire — the screen stayed frozen only because nothing in
   the tree changed (empty diffs, `cellsUpdated=0` every frame). The earlier
   "requestLive has no effect" conclusion misread this.
3. **The real bug was in this plugin's build.** esbuild `--jsx=automatic`
   without Solid's reactive transform emits dynamic JSX children as strings
   evaluated at mount (`children: \`┌ [${now()}]\`` is computed once). The
   jsx-runtime only reacts through `spread` on re-evaluated props, so signal
   -driven JSX text is frozen for the component's lifetime. Verified: the
   root/span text-node dirty revisions never moved after mount while a
   `createEffect` canary fired every second; the raw byte stream contained the
   live line drawn exactly once; a second prompt submission did not refresh it.
4. **The fix (shipped):** imperative updates through the renderable's own
   `content` setter — `nativeScene.setText` + lifecycle refresh +
   `requestRender` — driven by a 1s rebuild with a change guard. Verified
   live: the clock line ticks on every minute roll during true idle (two
   minute-rolls repainted in an 80s zero-input window) while a control line
   using signal-driven JSX stayed frozen in the same run.
5. **Trigger primitives that work from a plugin slot:** `content` setter
   (paints by itself), `renderer.requestRender()` (schedules and runs a
   frame), `renderer.requestAnimationFrame()` (one frame per call). No
   requestLive hold is needed for per-tick updates.

**If dynamic JSX is ever wanted again** (e.g. for layout-heavy plugins),
compile with a real Solid transform (babel-preset-solid or esbuild-plugin-solid)
so JSX expressions become getters; signal-driven children then update the
tree and paint through the same `requestRender` chain. Not needed for this
plugin: the imperative rebuild covers it.


## Conventions

- `pnpm build && pnpm typecheck` must be green before any commit.
- Plugin id: `jsherron.unix-prompt`. Cleanup function unregisters the slot; component intervals cleared via `onCleanup`.

Access: public — no Cloudflare involvement; no Access default applies.
