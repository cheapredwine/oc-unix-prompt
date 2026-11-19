# PENDING REVIEW — report the 2.3.2 idle render gate upstream

**Decision needed from Jason (2026-11-18):** whether to file a bug report against
OpenCode (and/or opentui) for the idle render gate diagnosed below. Filing an
issue on an external repo is an external-system write, so it waits here.

## What would be reported

The composer-top slot line (`session.composer.top`) and, by extension, any
plugin contribution that changes only via timers never repaints while the TUI
is idle; frames flush only when the host is active (prompt submission, model
streaming). In a fresh idle session the slot never paints at all.

Verified evidence (plugin-side instrumentation, idle pty captures, 2.3.2
binary updated Nov 17 2026; plugin verified working on 2.2.5):

- Plugin setup, slot render, component mount, theme tokens, timers: all healthy.
- `getSchedulerState()`: idle = `controlState=idle, _isRunning=false`.
- `requestLive()` starts the loop (`auto_started`, `isRunning=true`) and it
  runs continuously, but the terminal output is byte-identical across idle
  runs: zero repaint bytes while idle.
- The native session scheduler executes ~26k callbacks in 80s (default
  setImmediate scheduler; opencode passes no custom scheduler per the
  embedded bundle).
- `renderer.requestRender()`, `requestLive`+`dropLive`, and a
  continuously-running loop all fail to produce a frame while idle.
- Prompt submission paints everything instantly.

Reproduction: any OpenCode 2.3.2 TUI left idle 2+ minutes with a plugin slot
whose content is time-based (repro notes in `AGENTS.md` "Known issue" section;
the instrumented plugin source was reverted — re-add a diag build if the
opencode maintainers want it).

## What unblocks it

Jason says "file it" (or drafts it himself). The write-up is mostly ready in
`AGENTS.md`; an upstream issue would need the repro distilled (no internal
paths, no personal config). Alternative: wait for a later opencode update and
re-verify silently per the AGENTS.md re-verify rule.
