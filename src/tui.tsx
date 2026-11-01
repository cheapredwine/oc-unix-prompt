import { Plugin } from "@opencode/plugin/tui"
import { usePlugin } from "@opencode/plugin/tui"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { execFile } from "node:child_process"
import type { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import { formatClock } from "./clock"

type GitState = {
  branch: string
  dirty: boolean
}

function probeGit(directory: string): Promise<GitState | undefined> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", directory, "status", "--porcelain", "-b"],
      { timeout: 2000 },
      (err, stdout) => {
        if (err || typeof stdout !== "string") return resolve(undefined)
        const lines = stdout.split("\n").filter((l) => l.length > 0)
        const head = lines[0] ?? ""
        const match = /## (?:(?:no branch)|(?:HEAD \(no branch\)))|## ([^.\s]+)/.exec(head)
        const branch = match?.[1]
        if (!branch) return resolve(undefined)
        resolve({ branch, dirty: lines.length > 1 })
      },
    )
  })
}

// clock formatting lives in ./clock.ts (shared with the server part)

const GIT_POLL_MS = 30_000
const CLOCK_TICK_MS = 60_000

/** Intrinsic <span> with a themed `fg` (RGBA token). The reconciler's
 * setProperty only honors `href` and `style` on text nodes — bare `fg` props
 * are silently dropped — so pass the color through `style`. */
function StyledSpan(props: { fg?: RGBA; children?: JSX.Element }) {
  return <span style={{ fg: props.fg }}>{props.children}</span>
}

/** Summary of the current work shown while the model is running: the first
 * displayable line of the latest user prompt. Blank lines and the admission
 * stamp (`┌ [...]`) are skipped; the line is truncated to one display width. */
const WORK_MAX_CHARS = 48

/** Structural subset of the client's SessionMessageInfo — `@opencode/client`
 * is a transitive dependency and not importable from this project. */
type UserMessage = { type: "user"; text: string }

function currentWork(messages: ReadonlyArray<unknown>): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as Partial<UserMessage> | undefined
    if (message?.type !== "user" || typeof message.text !== "string") continue
    for (const rawLine of message.text.split("\n")) {
      const line = rawLine.trim()
      if (line.length === 0 || line.startsWith("┌ [")) continue
      return line.length > WORK_MAX_CHARS ? `${line.slice(0, WORK_MAX_CHARS)}…` : line
    }
  }
  return undefined
}

function UnixPrompt(props: { sessionID: string }) {
  const context = usePlugin()

  const directory = createMemo(() => context.location?.directory)

  const [git, setGit] = createSignal<GitState | undefined>(undefined)
  const [now, setNow] = createSignal(new Date())

  // Clock: minute precision, lightweight tick.
  const clockTimer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
  onCleanup(() => clearInterval(clockTimer))

  // Git: re-probe on directory change, then every 30s.
  createEffect(() => {
    const dir = directory()
    if (!dir) {
      setGit(undefined)
      return
    }
    let alive = true
    const refresh = () => {
      probeGit(dir).then((state) => {
        if (alive) setGit(state)
      })
    }
    refresh()
    const timer = setInterval(refresh, GIT_POLL_MS)
    onCleanup(() => {
      alive = false
      clearInterval(timer)
    })
  })

  const path = createMemo(() => {
    const dir = directory()
    return dir ? context.ui.format.path(dir) : undefined
  })

  // Current-work summary: shown only while the model is running, from the
  // latest user prompt. `data.session.status`/`message.list` are reactive
  // reads over the host's event-driven client store — no polling needed.
  const running = createMemo(() => context.data.session.status(props.sessionID) === "running")
  const work = createMemo(() =>
    running() ? currentWork(context.data.session.message.list(props.sessionID) ?? []) : undefined,
  )

  // Per-segment colors via <span> children (theme tokens only):
  // time faint, cwd base, separator faint, branch muted, dirty marker muted.
  // NOTE: <text content={StyledText}> is NOT supported by the @opentui/solid
  // reconciler — it stringifies non-string content props to "[object Object]".
  // Colors must go through `style` on <span> children — bare `fg` props are
  // silently dropped (setProperty only honors href/style on text nodes).
  // The git signal must be read inside the JSX (Solid tracks only JSX
  // expressions; component-body reads never re-run).
  return (
    <text>
      <StyledSpan fg={context.theme.text.faint}>┌ [{formatClock(now())}]</StyledSpan>
      {path() && <StyledSpan fg={context.theme.text.base}> {path()}</StyledSpan>}
      {git() && (
        <>
          <StyledSpan fg={context.theme.text.faint}> ── </StyledSpan>
          <StyledSpan fg={context.theme.text.muted}>{git()!.branch}{git()!.dirty ? "✚" : ""}</StyledSpan>
        </>
      )}
      {work() && (
        <>
          <StyledSpan fg={context.theme.text.faint}> ⋯ </StyledSpan>
          <StyledSpan fg={context.theme.text.muted}>{work()}</StyledSpan>
        </>
      )}
    </text>
  )
}

export default Plugin.define({
  id: "jsherron.unix-prompt",
  setup(context) {
    const unregister = context.ui.slot({
      append: "session.composer.top",
      render: (input) => <UnixPrompt sessionID={input.sessionID} />,
    })
    return () => unregister()
  },
})
