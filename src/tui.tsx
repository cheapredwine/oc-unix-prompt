import { Plugin } from "@opencode/plugin/tui"
import { usePlugin } from "@opencode/plugin/tui"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { execFile } from "node:child_process"
import { fg, StyledText } from "@opentui/core"
import type { RGBA, TextChunk, TextRenderable } from "@opentui/core"
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

/** Why the prompt line updates imperatively (investigated 2026-11-19, see
 * AGENTS.md "Idle-render mystery" section): under esbuild `--jsx=automatic` the
 * @opentui/solid jsx-runtime receives dynamic JSX children as strings that
 * were already evaluated at mount, so signal-driven JSX text never changes
 * after the first paint. The reliable update path is the renderable's own
 * `content` setter (nativeScene.setText + lifecycle refresh + requestRender),
 * which paints on the renderer's on-demand loop. Verified live: a per-tick
 * `content` update ticks the line every second during true idle. */
const TICK_MS = 1_000

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
  // latest user prompt. `data.session.status`/`message.list` are reads over
  // the host's event-driven client store, evaluated inside the per-tick
  // content rebuild below (JSX reads would be frozen — see the note above).
  const running = createMemo(() => context.data.session.status(props.sessionID) === "running")
  const work = createMemo(() =>
    running() ? currentWork(context.data.session.message.list(props.sessionID) ?? []) : undefined,
  )

  let textRef: TextRenderable | undefined
  let lastLine = ""

  /** One chunk per colored segment; layout mirrors the original JSX spans:
   * time faint, cwd base, separator faint, branch muted, dirty marker muted,
   * work summary muted. */
  const buildContent = (): StyledText => {
    const tokens = context.theme.text
    const chunks: TextChunk[] = [fg(tokens.faint)(`┌ [${formatClock(new Date())}]`)]
    const p = path()
    if (p) chunks.push(fg(tokens.base)(` ${p}`))
    const g = git()
    if (g) {
      chunks.push(fg(tokens.faint)(" ── "))
      chunks.push(fg(tokens.muted)(`${g.branch}${g.dirty ? "✚" : ""}`))
    }
    const w = work()
    if (w) {
      chunks.push(fg(tokens.faint)(" ⋯ "))
      chunks.push(fg(tokens.muted)(w))
    }
    return new StyledText(chunks)
  }

  const update = () => {
    if (!textRef) return
    const line = buildContent()
      .chunks.map((chunk) => chunk.text)
      .join("")
    if (line === lastLine) return
    lastLine = line
    textRef.content = buildContent()
  }

  // Per-tick rebuild with a change guard: a frame is only requested when the
  // line's text actually changed (minute roll, git poll, work transitions).
  const timer = setInterval(update, TICK_MS)
  onCleanup(() => clearInterval(timer))

  return <text ref={(el: TextRenderable | undefined) => { textRef = el; update() }} />
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
