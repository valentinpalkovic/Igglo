// Run: node --test spikes/igl-28/fram-core/dev/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateInputs } from "../inputs.mjs";

const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));
const toy = fileURLToPath(new URL("./toy-app.mjs", import.meta.url));
const run = (...args) => execFileSync(process.execPath, [cli, toy, ...args], { encoding: "utf8" });

test("two runs give byte-identical output", () => {
  assert.equal(run(), run());
  assert.equal(run("--enum-order", "reversed"), run("--enum-order", "reversed"));
});

test("toy app: states, edges and the three finding types", () => {
  const r = JSON.parse(run());
  assert.deepEqual(
    r.states.map((s) => [s.id, s.tools]),
    [
      ["S0", ["knock", "open"]],
      ["S1", ["close", "lock"]],
      ["S2", []],
    ],
  );
  // open(push) -> S1, open(kick) isError stays S0 and is NOT a finding.
  assert.deepEqual(r.edges[0], { from: "S0", tool: "open", input: { how: "push", note: "x" }, to: "S1", outcome: "ok" });
  assert.equal(r.edges[1].outcome, "isError");
  assert.deepEqual(
    r.findings.map((f) => [f.type, f.tool, f.path.map((p) => p.tool)]),
    [
      ["page_error", "knock", ["knock"]],
      ["dead_end", "lock", ["open", "lock"]],
      ["tool_threw", "lock", ["open", "lock"]],
    ],
  );
  assert.deepEqual(r.findings[0].path[0].input, { times: 2 }); // integer -> minimum
  assert.ok(!r.findings.some((f) => f.message === "denied"));
});

test("reversed enum order changes exploration order only", () => {
  const declared = JSON.parse(run());
  const reversed = JSON.parse(run("--enum-order", "reversed"));
  assert.equal(reversed.edges[0].input.how, "kick");
  assert.deepEqual(new Set(reversed.findings.map((f) => f.type)), new Set(declared.findings.map((f) => f.type)));
});

test("inputs: enum product in property order, unsupported types omitted", () => {
  assert.deepEqual(
    generateInputs({
      type: "object",
      properties: {
        a: { enum: [1, 2] },
        b: { type: "string", enum: ["p", "q"] },
        n: { type: "integer" },
        f: { type: "boolean" },
        o: { type: "object", properties: { s: { type: "string" } } },
      },
    }),
    [
      { a: 1, b: "p", n: 0, o: { s: "x" } },
      { a: 1, b: "q", n: 0, o: { s: "x" } },
      { a: 2, b: "p", n: 0, o: { s: "x" } },
      { a: 2, b: "q", n: 0, o: { s: "x" } },
    ],
  );
  assert.deepEqual(generateInputs(undefined), [{}]);
});
