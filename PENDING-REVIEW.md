# PENDING REVIEW — no confident bug to file; decide how to proceed

**Status as of 2026-11-19: the original "file this bug" plan is retracted.**
Two rounds of investigation produced two different wrong-ish conclusions
before landing on what's actually confirmed. Full history below so the
retraction is traceable, not just asserted.

## What happened (for context, not action)

1. **First pass:** diagnosed "opencode 2.3.2 idle render gate," concluded
   plugin-side repaint APIs were dead ends, planned to file an issue blaming
   opentui's native output-admission layer.
2. **Challenged ("sounds like you didn't actually prove it out"):** rebuilt
   the investigation with a proper source-level bisection between opentui
   0.8.0 (opencode 2.2.5) and 0.8.4 (opencode 2.3.2), concluding the 0.8.4
   output-admission layer was the cause, with a specific suspected Zig
   function.
3. **Challenged again ("are we sure this is a bug?") and asked to keep
   confirming:** built isolated minimal opentui test harnesses (bare
   `@opentui/core`, no opencode) and discovered the raw-byte-regex matching
   used throughout was itself broken — it cannot see diff-only terminal
   redraws (a changed digit plus a cursor-position escape, not a re-emitted
   full string). Re-tested with a real terminal emulator (`pyte`) decoding
   actual screen content instead of raw bytes.
4. With the corrected methodology: bare opentui (both 0.8.0 and 0.8.4) ticks
   correctly during true idle. The real plugin, inside real opencode, does
   not — confirmed with correct methodology, so the underlying complaint is
   real. But testing opencode **2.2.5 directly** (downloaded the actual
   release binary into an isolated scratch directory, same plugin, same
   corrected methodology) showed **byte-identical frozen behavior** to
   2.3.2. The "regression" claim is therefore false — this is not new
   between versions.

## What is actually confirmed (full detail in `AGENTS.md`)

- Opencode's TUI performs zero self-driven repaints during true idle, for
  anything on screen (not just the plugin's line) — confirmed via full
  terminal-screen diffing, both opencode versions tested.
- It repaints instantly and correctly on any external activity.
- The plugin/Solid component itself is fully healthy throughout.
- Bare opentui supports continuous idle-time updates; opencode's TUI host
  does not pass that through for plugin-slot content, even using the
  renderer's own `requestLive()`/`setFrameCallback()` primitives.
- The mechanism inside opencode's own TUI host that suppresses this is
  **not identified**. Tracing it would require instrumenting
  `sst/opencode`'s TUI package directly, which has not been done.

## Decision needed from Jason

Given there's no confirmed root cause and no confirmed regression, filing an
issue now would mean describing a real symptom without a credible
explanation — better than the two previous wrong theories, but still weaker
than ideal. Options, roughly in order of effort:

1. **Do nothing further.** Document the limitation in the plugin's README
   (clock shows time as of last activity, not real time) and move on.
2. **Ask opencode maintainers a question, not file a bug.** Post something
   like: "Does `context.renderer.requestLive()`/`setFrameCallback()` work
   from a plugin-contributed slot? We can't get idle-time self-repaints to
   work for plugin content even using these APIs, though bare opentui
   supports it fine." This is honest about what's unconfirmed and invites
   the people who actually know the architecture to say whether it's a bug,
   a missing feature, or working as intended.
3. **Keep investigating** by cloning `sst/opencode` and instrumenting its
   own TUI package (`packages/tui/src/plugin/` and the renderer-scheduling
   code it drives) to find the actual suppression mechanism, before saying
   anything to the maintainers.

No external write happens without Jason picking one of these (or something
else) and giving explicit approval for the exact content, per the standing
Jira/external-write-approval pattern extended here to any outward-facing
report.
