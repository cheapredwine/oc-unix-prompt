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
  }
});
export {
  index_default as default
};
