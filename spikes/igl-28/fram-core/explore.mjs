// The spike algorithm (rules 1-7). Deliberately literal: no output checks,
// no extra state signals, no input reuse.
import { openSession } from "./webmcp.mjs";
import { generateInputs } from "./inputs.mjs";

/** Rule 1: state = sorted list of currently available tool names. */
function stateKey(tools) {
  return JSON.stringify(tools.map((t) => t.name).sort());
}

/**
 * @param {(opts: object) => Promise<any>} load
 * @param {{ enumOrder: string }} options
 */
export async function explore(load, options) {
  const states = []; // { id, tools, path }, in discovery order
  const byKey = new Map();
  const edges = [];
  const findings = [];

  const addState = (tools, path) => {
    const key = stateKey(tools);
    const known = byKey.get(key);
    if (known) return known;
    const state = { id: `S${states.length}`, tools: tools.map((t) => t.name).sort(), path };
    states.push(state);
    byKey.set(key, state);
    // Rule 4c: a reached state with zero tools is a dead end.
    if (state.tools.length === 0) {
      findings.push({ type: "dead_end", tool: path.at(-1)?.tool ?? null, path });
    }
    return state;
  };

  // Start state. Page errors during the first load have no tool to blame.
  const start = await openSession(load, options);
  for (const message of start.drainPageErrors()) {
    findings.push({ type: "page_error", tool: null, path: [], message });
  }
  addState(start.listTools(), []);

  // Rule 2: breadth-first; each state expanded once via its first path.
  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    const tools = (await reach(load, options, state)).listTools();

    for (const tool of tools) {
      for (const input of generateInputs(tool.inputSchema)) {
        const session = await reach(load, options, state);
        const step = { tool: tool.name, input };
        const path = [...state.path, step];
        const result = await session.call(tool.name, input);
        const to = addState(session.listTools(), path);

        edges.push({ from: state.id, tool: tool.name, input, to: to.id, outcome: result.outcome });

        // Rule 4a: callTool rejects.
        if (result.outcome === "rejected") {
          findings.push({ type: "tool_threw", tool: tool.name, path, message: result.error });
        }
        // Rule 4b: onPageError fires.
        for (const message of result.pageErrors) {
          findings.push({ type: "page_error", tool: tool.name, path, message });
        }
      }
    }
  }

  return { enumOrder: options.enumOrder, states, edges, findings };
}

/** Fresh load + replay of the state's shortest known path. */
async function reach(load, options, state) {
  const session = await openSession(load, options);
  for (const step of state.path) await session.call(step.tool, step.input);
  const reached = stateKey(session.listTools());
  if (reached !== JSON.stringify(state.tools)) {
    throw new Error(
      `Replay of ${state.id} reached ${reached}, expected ${JSON.stringify(state.tools)}. ` +
        "The app is not deterministic, which breaks the load() contract.",
    );
  }
  return session;
}
