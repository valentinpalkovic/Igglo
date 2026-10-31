// Development-only toy app for fram-core. Not the IGL-28 fixture.
// A tiny door: closed -> open -> locked-out (dead end), with one throwing
// tool, one async page error and one isError denial.
export async function load({ enumOrder = "declared" } = {}) {
  let mode = "closed";
  let attempts = 0;
  const pageErrorCbs = [];
  const order = (values) => (enumOrder === "reversed" ? [...values].reverse() : values);

  const tools = {
    open: {
      when: () => mode === "closed",
      inputSchema: {
        type: "object",
        properties: { how: { type: "string", enum: order(["push", "kick"]) }, note: { type: "string" } },
      },
      execute: ({ how }) => {
        if (how === "kick") return { content: "denied", isError: true };
        mode = "open";
        return { content: "opened" };
      },
    },
    knock: {
      when: () => mode === "closed",
      inputSchema: { type: "object", properties: { times: { type: "integer", minimum: 2 } } },
      execute: ({ times }) => {
        attempts += times;
        if (attempts >= 2) setTimeout(() => pageErrorCbs.forEach((cb) => cb(new Error("neighbours angry"))), 0);
        return { content: "knocked" };
      },
    },
    close: {
      when: () => mode === "open",
      inputSchema: { type: "object", properties: {} },
      execute: () => {
        mode = "closed";
        return { content: "closed" };
      },
    },
    lock: {
      when: () => mode === "open",
      inputSchema: {
        type: "object",
        properties: { key: { enum: order(["brass", "iron"]) }, flag: { type: "boolean" } },
      },
      execute: ({ key }) => {
        if (key === "iron") throw new TypeError("iron key snapped");
        mode = "locked-out";
        return { content: "locked" };
      },
    },
  };

  return {
    modelContext: {
      listTools: () =>
        Object.entries(tools)
          .filter(([, t]) => t.when())
          .map(([name, t]) => ({ name, description: name, inputSchema: t.inputSchema })),
      callTool: async (name, args) => {
        const t = tools[name];
        if (!t || !t.when()) throw new Error(`unknown tool ${name}`);
        return t.execute(args);
      },
    },
    onPageError: (cb) => pageErrorCbs.push(cb),
  };
}
