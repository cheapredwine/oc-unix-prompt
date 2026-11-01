// src/index.ts
import { Plugin } from "@opencode/plugin";

// src/clock.ts
function formatClock(d) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n) => String(n).padStart(2, "0");
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// src/index.ts
var STAMP_RE = /^┌ \[[A-Za-z]{3} [A-Za-z]{3} \d{1,2} \d{2}:\d{2}\]\n/;
function stripStamps(messages) {
  for (const raw of messages) {
    const message = raw;
    if (message.role !== "user" || !Array.isArray(message.content)) continue;
    for (const rawPart of message.content) {
      if (typeof rawPart === "object" && rawPart !== null && rawPart.type === "text") {
        const part = rawPart;
        if (STAMP_RE.test(part.text)) {
          part.text = part.text.replace(STAMP_RE, "");
        }
      }
    }
  }
}
var index_default = Plugin.define({
  id: "jsherron.unix-prompt",
  async setup(ctx) {
    await ctx.session.hook("prompt", (event) => {
      const text = event.prompt.text;
      if (text.trim().length > 0 && !text.startsWith("\u250C [")) {
        event.prompt.text = `\u250C [${formatClock(/* @__PURE__ */ new Date())}]
${text}`;
      }
    });
    await ctx.session.hook("context", (event) => stripStamps(event.messages));
    await ctx.session.hook("compaction", (event) => stripStamps(event.messages));
    await ctx.session.hook("generate", (event) => stripStamps(event.messages));
    await ctx.session.hook("title", (event) => stripStamps(event.messages));
  }
});
export {
  index_default as default
};
