import { Plugin } from "@opencode/plugin"
import { formatClock } from "./clock"

/** Matches the exact stamp line emitted by the prompt hook: `┌ [Sat Oct 31 14:22]\n`. */
const STAMP_RE = /^┌ \[[A-Za-z]{3} [A-Za-z]{3} \d{1,2} \d{2}:\d{2}\]\n/

/** Strips the stamp line from user text parts before a model request. The persisted
 * (scrollback) copy keeps the stamp; request edits never write history. */
function stripStamps(messages: ReadonlyArray<unknown>): void {
  for (const raw of messages) {
    const message = raw as { role?: string; content?: ReadonlyArray<unknown> }
    if (message.role !== "user" || !Array.isArray(message.content)) continue
    for (const rawPart of message.content) {
      if (
        typeof rawPart === "object" &&
        rawPart !== null &&
        (rawPart as { type?: string }).type === "text"
      ) {
        const part = rawPart as { text: string }
        if (STAMP_RE.test(part.text)) {
          part.text = part.text.replace(STAMP_RE, "")
        }
      }
    }
  }
}

export default Plugin.define({
  id: "jsherron.unix-prompt",
  async setup(ctx) {
    // Stamp every admitted user prompt with a UNIX-prompt-style timestamp
    // line; the edit becomes the canonical persisted input, so the stamp
    // renders in the transcript scrollback.
    await ctx.session.hook("prompt", (event) => {
      const text = event.prompt.text
      if (text.trim().length > 0 && !text.startsWith("┌ [")) {
        event.prompt.text = `┌ [${formatClock(new Date())}]\n${text}`
      }
    })

    // Strip the stamp from every outgoing model request kind so the stamp
    // costs zero tokens: persisted history keeps it, the wire never sees it.
    await ctx.session.hook("context", (event) => stripStamps(event.messages))
    await ctx.session.hook("compaction", (event) => stripStamps(event.messages))
    await ctx.session.hook("generate", (event) => stripStamps(event.messages))
    await ctx.session.hook("title", (event) => stripStamps(event.messages))
  },
})

