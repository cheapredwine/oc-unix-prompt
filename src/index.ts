import { Plugin } from "@opencode/plugin"
import { formatClock } from "./clock"

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
  },
})
