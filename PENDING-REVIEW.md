# PENDING REVIEW — file the opentui/opencode frame-admission bug upstream

**Decision needed from Jason (2026-11-18):** approve filing the issue below
against `sst/opencode` (or `sst/opentui` directly — see "where to file").
Filing an issue on an external repo is an external-system write, so it waits
here for per-action approval.

## Where to file

`sst/opencode` pins `@opentui/core`, so the user-visible regression is an
opencode issue, but the root cause lives in `opentui`. Recommend filing on
`sst/opencode` with the `opentui` label (opencode issues reference that label
for this exact class of bug — see issue #3650), since that's where a user
would look; the maintainers can transfer/cross-link to `sst/opentui` if they
want the native fix tracked separately.

## Issue text (ready to paste)

---

**Title:** TUI: output freezes while idle since opentui 0.8.4 (opencode 2.3.x) — renderer runs at full FPS but zero bytes reach the terminal until the next user action

**Environment**
- opencode 2.3.2 (binary dated 2026-11-17), macOS arm64
- Regression window: `@opentui/core` 0.8.0 (opencode 2.2.5, working) -> 0.8.4 (opencode 2.3.2, broken)
- Reproduced with a small local TUI plugin contributing to the `session.composer.top` slot; same plugin code worked correctly on 2.2.5

**Symptom**

Any slot/component whose content updates only via a JS timer (not a keypress or server event) stops repainting once the TUI goes idle. In a fresh session it never paints at all. The moment the user does anything (submits a prompt, server pushes a streaming event), the pending content flushes instantly and correctly.

**What's healthy (ruled out)**

Verified via temporary diagnostics in the affected plugin, with a scripted pty (120x40, zero input) and direct probes of opentui's public API:

1. The plugin/Solid component tree is completely healthy: the slot's `render` callback fires once at boot, the component mounts and **never unmounts**, its rendered `<text>` node stays attached to a stable parent, `visible=true`, `isDestroyed=false`, for the entire idle window (170s+ tested).
2. The content genuinely updates in the renderable tree: a walk of `renderer.root` during a live (non-idle-repro) session showed the text node's string children changing value over real time (e.g. `22:08` -> `22:26` across several minutes), confirming the signal -> renderable pipeline works.
3. The render loop runs continuously at full target FPS with **no backlog**: `nativeSession.lib.sessionGetRendererState()` reports `framePending=false`, `droppedFrames=0`, `droppedFrameBytes=0` the whole time, while `frameCount` increments at ~55-60/s (matching `targetFps=30`/`maxFps=60`).
4. `OTUI_STDOUT_THREAD=false` has **zero effect** on the symptom, ruling out the native stdout writer thread specifically.
5. None of `renderer.requestRender()`, `renderer.requestLive()` + `dropLive()`, or forcibly keeping the renderer's control state at `auto_started` produce any additional terminal output while idle — all three run (confirmed via instrumented wrappers) without effect.

**What's broken**

Despite all of the above, the pty capture of the TUI's actual output is **byte-for-byte identical** across the entire idle window (tested up to ~210s). No frame reaches the terminal. On any subsequent user action it flushes immediately and correctly.

**Suspected root cause**

`@opentui/core` 0.8.0 -> 0.8.4 added an output-admission ("frame admission") layer around backpressure handling (new `packages/core/src/tests/renderer.frame-admission.test.ts`, +201 lines, plus substantial changes to `NativeSession.ts`/`renderer.ts`: `CAPTURED_STDOUT_HIGH_WATER_BYTES`, `drainPending`, `takeDrain`, the `stdoutPost`/`stdoutWriter` state machine). The test's own description matches our symptom almost exactly:

> "frame admission bounds delayed output to one frame and coalesces callback work" ... render requests coalesce and do not produce new output until `driver.idle()` resolves.

At the Zig layer, `FeedBackend.prepareFrame()` (`packages/native/src/renderer-output.zig`) returns `.skipped` under conditions including `self.feed.hasPendingBytes()` and `self.shouldSkipFrame()` (span-queue high-water mark / "no atomic capacity"). `CliRenderer.presentNativeScene()` (`packages/core/src/renderer.ts`) handles a `Skipped` status by calling `scheduleRenderAfterOutputIdle()`, which waits on `nativeSession.idle()` before retrying. If something about this admission path only considers the stream "idle" (eligible to drain/retry) when driven by an external I/O event — and never on a pure internal timer tick with no outstanding writes — a timer-only update could get stuck indefinitely behind this gate even with nothing actually queued.

This gate is present unchanged on opentui's current `main` (0.9.3 as of 2026-11-18), so the regression is still live.

**Repro**

Minimal TUI plugin (loaded via the `plugins` config entry):

```tsx
// tui part — ctx.ui.slot({ append: "session.composer.top", render: ... })
function Clock() {
  const [now, setNow] = createSignal(new Date())
  setInterval(() => setNow(new Date()), 60_000)
  return <text>{"clock: " + now().toISOString()}</text>
}
```

1. Start opencode in a terminal, send no input.
2. Observe: the clock line either never appears (fresh session) or freezes at its last value (already-running session).
3. Type/submit anything: the clock line instantly jumps to the current time and keeps up from then on, until the TUI goes idle again.

**Expected:** the clock line updates every 60s regardless of user activity, matching its behavior on opencode 2.2.5 / opentui 0.8.0.

---

## What unblocks this

Jason approves filing (or edits the text first). Alternative: skip filing and just wait for an opentui/opencode fix, re-verifying per the AGENTS.md "re-verify" note whenever the local opencode binary updates.
