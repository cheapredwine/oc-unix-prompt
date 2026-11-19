# PENDING REVIEW — RESOLVED 2026-11-19

The decision this file was waiting on (document-and-drop vs. ask maintainers
vs. keep investigating) is moot: the "keep digging" option ran to a root
cause, and it is not what this file was bracing for. The frozen clock was a
**plugin build bug** (esbuild `--jsx=automatic` evaluates dynamic JSX children
once at mount; the `@opentui/solid` runtime never re-runs them), not an
opencode/opentui defect. Fixed in the plugin via imperative `content` updates
(branch `fix/imperative-clock`); full evidence trail in `AGENTS.md` ("Idle-render
mystery" section) and `~/src/outputs/oc-unix-prompt/idleprobe/`.

Retracted along the way (for the record): the "2.3.2 version regression" pass,
the "opentui 0.8.4 output-admission regression" pass, and the "opencode host
suppresses idle repaints" reading of the 60fps-but-frozen observations.

No external reports to make: there is no opencode bug to file. The
on-demand renderer behavior (`ctl=idle` when no live requests) is by design
and its frame-request primitives work as documented.

Nothing pending. File may be deleted.
