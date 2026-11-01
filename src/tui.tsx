import { Plugin } from "@opencode/plugin/tui"
import { usePlugin } from "@opencode/plugin/tui"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { execFile } from "node:child_process"
import { StyledText, fg } from "@opentui/core"
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

function UnixPrompt() {
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

  // Per-segment colors via StyledText chunks (theme tokens only):
  // time faint, cwd base, separator faint, branch muted, dirty marker muted.
  const styled = new StyledText([fg(context.theme.text.faint)(`┌ [${formatClock(now())}]`)])
  if (path()) {
    styled.chunks.push(fg(context.theme.text.base)(` ${path()}`))
  }
  const gitState = git()
  if (gitState) {
    styled.chunks.push(
      fg(context.theme.text.faint)(" ── "),
      fg(context.theme.text.muted)(`${gitState.branch}${gitState.dirty ? "✚" : ""}`),
    )
  }
  return <text content={styled} />
}

export default Plugin.define({
  id: "jsherron.unix-prompt",
  setup(context) {
    const unregister = context.ui.slot({
      append: "session.composer.top",
      render: () => <UnixPrompt />,
    })
    return () => unregister()
  },
})
