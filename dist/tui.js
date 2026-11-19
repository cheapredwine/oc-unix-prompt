// src/tui.tsx
import { Plugin } from "@opencode/plugin/tui";
import { usePlugin } from "@opencode/plugin/tui";
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { execFile } from "node:child_process";
import { fg, StyledText } from "@opentui/core";

// src/clock.ts
function formatClock(d) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n) => String(n).padStart(2, "0");
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// src/tui.tsx
import { jsx } from "@opentui/solid/jsx-runtime";
function probeGit(directory) {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", directory, "status", "--porcelain", "-b"],
      { timeout: 2e3 },
      (err, stdout) => {
        if (err || typeof stdout !== "string") return resolve(void 0);
        const lines = stdout.split("\n").filter((l) => l.length > 0);
        const head = lines[0] ?? "";
        const match = /## (?:(?:no branch)|(?:HEAD \(no branch\)))|## ([^.\s]+)/.exec(head);
        const branch = match?.[1];
        if (!branch) return resolve(void 0);
        resolve({ branch, dirty: lines.length > 1 });
      }
    );
  });
}
var GIT_POLL_MS = 3e4;
var TICK_MS = 1e3;
var WORK_MAX_CHARS = 48;
function currentWork(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type !== "user" || typeof message.text !== "string") continue;
    for (const rawLine of message.text.split("\n")) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("\u250C [")) continue;
      return line.length > WORK_MAX_CHARS ? `${line.slice(0, WORK_MAX_CHARS)}\u2026` : line;
    }
  }
  return void 0;
}
function UnixPrompt(props) {
  const context = usePlugin();
  const directory = createMemo(() => context.location?.directory);
  const [git, setGit] = createSignal(void 0);
  createEffect(() => {
    const dir = directory();
    if (!dir) {
      setGit(void 0);
      return;
    }
    let alive = true;
    const refresh = () => {
      probeGit(dir).then((state) => {
        if (alive) setGit(state);
      });
    };
    refresh();
    const timer2 = setInterval(refresh, GIT_POLL_MS);
    onCleanup(() => {
      alive = false;
      clearInterval(timer2);
    });
  });
  const path = createMemo(() => {
    const dir = directory();
    return dir ? context.ui.format.path(dir) : void 0;
  });
  const running = createMemo(() => context.data.session.status(props.sessionID) === "running");
  const work = createMemo(
    () => running() ? currentWork(context.data.session.message.list(props.sessionID) ?? []) : void 0
  );
  let textRef;
  let lastLine = "";
  const buildContent = () => {
    const tokens = context.theme.text;
    const chunks = [fg(tokens.faint)(`\u250C [${formatClock(/* @__PURE__ */ new Date())}]`)];
    const p = path();
    if (p) chunks.push(fg(tokens.base)(` ${p}`));
    const g = git();
    if (g) {
      chunks.push(fg(tokens.faint)(" \u2500\u2500 "));
      chunks.push(fg(tokens.muted)(`${g.branch}${g.dirty ? "\u271A" : ""}`));
    }
    const w = work();
    if (w) {
      chunks.push(fg(tokens.faint)(" \u22EF "));
      chunks.push(fg(tokens.muted)(w));
    }
    return new StyledText(chunks);
  };
  const update = () => {
    if (!textRef) return;
    const line = buildContent().chunks.map((chunk) => chunk.text).join("");
    if (line === lastLine) return;
    lastLine = line;
    textRef.content = buildContent();
  };
  const timer = setInterval(update, TICK_MS);
  onCleanup(() => clearInterval(timer));
  return /* @__PURE__ */ jsx("text", { ref: (el) => {
    textRef = el;
    update();
  } });
}
var tui_default = Plugin.define({
  id: "jsherron.unix-prompt",
  setup(context) {
    const unregister = context.ui.slot({
      append: "session.composer.top",
      render: (input) => /* @__PURE__ */ jsx(UnixPrompt, { sessionID: input.sessionID })
    });
    return () => unregister();
  }
});
export {
  tui_default as default
};
