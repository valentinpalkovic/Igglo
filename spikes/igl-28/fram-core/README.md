# fram-core (IGL-28 spike)

Throwaway spike for [IGL-33](/IGL/issues/IGL-33). A deterministic explorer that follows the
IGL-28 spike rules literally: **state = sorted list of available tool names**. Built blind:
the fixture source was not read. Never merged to `main`.

```sh
node spikes/igl-28/fram-core/cli.mjs <path-to-app-module> [--enum-order reversed]
node --test spikes/igl-28/fram-core/dev/explore.test.mjs   # self-test against dev/toy-app.mjs
```

Node.js built-ins only. Output is JSON on stdout; errors go to stderr with exit code 1.

## Files

| File | Role |
|---|---|
| `webmcp.mjs` | The only module that calls `load()`, `modelContext.*` or `onPageError` (ADR-004 single adapter). |
| `explore.mjs` | Rules 1, 2, 4, 6, 7: BFS, replay, findings. |
| `inputs.mjs` | Rule 3: inputs from the schema. |
| `cli.mjs` | Argument parsing and JSON output. |
| `dev/` | My own toy app and self-test. Not the fixture. |

## Output

```jsonc
{
  "enumOrder": "declared",
  "states":   [{ "id": "S0", "tools": ["a", "b"], "path": [] }],          // discovery (BFS) order
  "edges":    [{ "from": "S0", "tool": "a", "input": {}, "to": "S1", "outcome": "ok" }],
  "findings": [{ "type": "tool_threw" | "page_error" | "dead_end", "tool": "a", "path": [{ "tool", "input" }], "message"? }]
}
```

`path` is a list of `{ tool, input }` steps from a fresh `load()`. For a finding it is the
shortest reproducing path: the first (BFS) path to the source state plus the failing step.

## Interpretations (every place a rule did not decide for me)

**CLI / load**
1. Without `--enum-order`, the CLI calls `load({ enumOrder: "declared" })` (the contract default), not `load({})`. Values other than `declared`/`reversed` are rejected.
2. The app module path is resolved against the current working directory.

**Rule 1 – state**
3. Tool names are sorted with JavaScript's default `Array.prototype.sort` (UTF-16 code unit order).
4. State IDs (`S0`, `S1`, …) are assigned in discovery order. They are labels only; the state is the name list.

**Rule 2 – exploration**
5. "Schema order" for tools = the order `listTools()` returns them in the state's first-path instance. "Schema order" for inputs = the order of rule 3 (see 11).
6. The tool list for expanding a state comes from one extra fresh `load()` + replay before the calls. Every (state, tool, input) then gets its own fresh `load()` + replay + one call, exactly as the rule says.
7. Every call is recorded as an edge, including self-loops and calls that reject. A rejected call still produces a resulting state (`listTools()` after the rejection), and that state is explored like any other.
8. Replay is assumed to be deterministic (the contract promises it). If a replay reaches a different tool set than recorded, the run aborts with an error. This is a contract violation, not a finding (rule 4 lists no such type).
9. Page errors and rejections that happen *during replay* are ignored. They were already recorded on the edge that first caused them.
10. No limit on the number of states or calls. The state space is finite (subsets of a finite set of tool names). A tool call that never settles hangs the run; there is no timeout.

**Rule 3 – inputs**
11. A tool's `inputSchema` is treated as an object schema. Each property gets a value list; when several properties have more than one value (several enums), the inputs are the **cartesian product**, iterated in property declaration order with the first property outermost. The rule says "every enum value" but not how to combine enums.
12. **All** properties are filled, required or not. The rule gives no basis for leaving optional ones out.
13. `enum` wins over `type` (a `string` with an `enum` uses the enum values, not `"x"`).
14. `integer` without `minimum` → `0`. `exclusiveMinimum` is ignored.
15. Nested `object` properties are filled recursively with the same rules.
16. Any other type (`number`, `boolean`, `array`, `null`, no type, `oneOf`, …) is **omitted** from the input. The rule names only enum, integer and string; adding values for other types would make the spike smarter than specified. If the app requires such a property, the call fails and the result shows it.
17. A missing `inputSchema` or one with no properties gives exactly one call with `{}`. An empty `enum: []` gives zero inputs, so that tool is never called.

**Rule 4 – findings**
18. A finding is recorded for **every** (state, tool, input) step that triggers it. No deduplication: the same tool throwing from three states gives three findings. Order follows BFS order.
19. `tool_threw` = `callTool` rejected. `message` is `"<ErrorName>: <message>"` (no stack, so output stays byte-identical).
20. `page_error` is attributed to the tool call after which it fired. The observation window after each call (and after `load()`) is one `setTimeout(0)` turn plus one `setImmediate` turn. Errors scheduled later are missed or attributed to a later call in the same instance; since each call runs in its own fresh instance, "later" in practice means "not seen".
21. Page errors during the very first `load()` (before any call) become one `page_error` finding with `tool: null` and `path: []`. They are reported once, not on every reload.
22. `dead_end` is recorded once per zero-tool state, when it is first reached. `tool` is the last step of its shortest path (`null` if the start state has no tools).
23. `isError: true` is shown as `outcome: "isError"` on the edge for readability. It is never a finding and is not used for any decision.

**Rule 7 – determinism**
24. Byte-identical output relies on the app being deterministic. fram-core itself uses no clock, randomness or hash-order iteration; JSON key order is fixed by construction (input keys follow schema property order).
