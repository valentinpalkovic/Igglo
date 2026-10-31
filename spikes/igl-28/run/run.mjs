// QA harness only: flags are injected at the load boundary, never given to the explorer.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { explore } from '../fram-core/explore.mjs';
import { load } from '../fixture/ledger.mjs';

const protocolRevision = 'adbe1ec6-8c1a-42b4-8ce5-3d208ccab6fe';
const runs = [], validation = [];
for (const bug of ['clean', ...Array.from({length:8}, (_, i) => `B${i+1}`)]) {
  for (const enumOrder of ['declared', 'reversed']) {
    const bugs = bug === 'clean' ? [] : [bug];
    const traces = [];
    const instrumentedLoad = async options => {
      const app = await load({...options, bugs});
      const calls = [];
      traces.push(calls);
      return { onPageError: app.onPageError, modelContext: {
        listTools: app.modelContext.listTools,
        callTool: async (tool, input) => {
          calls.push(structuredClone({tool, input}));
          return app.modelContext.callTool(tool, input);
        },
      }};
    };
    const output = await explore(instrumentedLoad, {enumOrder});
    const repeat = await explore(options => load({...options, bugs}), {enumOrder});
    assert.equal(JSON.stringify(output), JSON.stringify(repeat), `${bug}/${enumOrder}: nondeterminism`);
    // Each recorded edge must have its own fresh instance and precisely its source path.
    let cursor = 1; // initial load
    for (const state of output.states) {
      assert.deepEqual(traces[cursor++], state.path); // descriptor instance
      for (const edge of output.edges.filter(edge => edge.from === state.id)) {
        assert.deepEqual(traces[cursor++], [...state.path, {tool:edge.tool,input:edge.input}]);
        if ('id' in edge.input) assert.equal(edge.input.id, 'x');
      }
    }
    assert.equal(cursor, traces.length);
    assert.equal(new Set(output.states.map(s => JSON.stringify(s.tools))).size, output.states.length);
    const replays = [];
    for (const finding of output.findings) {
      const observations = [];
      for (const flags of [[], bugs]) {
        const app = await load({bugs:flags, enumOrder});
        const events = []; app.onPageError(error => events.push(String(error)));
        let thrown = null, result;
        for (const step of finding.path) {
          try { result = await app.modelContext.callTool(step.tool, step.input); }
          catch (error) { thrown = `${error.name}: ${error.message}`; }
        }
        observations.push({bugs:flags, result, thrown, tools:app.modelContext.listTools().map(t=>t.name), events});
      }
      const [clean, seeded] = observations;
      if (finding.type === 'tool_threw') {
        assert.equal(seeded.thrown, finding.message); assert.equal(clean.thrown, null);
      } else if (finding.type === 'dead_end') {
        assert.equal(seeded.tools.length, 0); assert.ok(clean.tools.length > 0);
      } else throw new Error(`Review unexpected finding: ${JSON.stringify(finding)}`);
      replays.push({finding, observations});
    }
    runs.push({bug, enumOrder, output});
    validation.push({bug, enumOrder, deterministic:true, freshLoads:traces.length, states:output.states.length, edges:output.edges.length, findings:output.findings.length, replays});
    console.log(`${bug}/${enumOrder}: ${output.states.length} states, ${output.edges.length} edges, ${output.findings.length} findings`);
  }
}
const sources = {};
for (const path of ['fixture/ledger.mjs', 'fram-core/explore.mjs', 'fram-core/inputs.mjs', 'fram-core/webmcp.mjs']) {
  sources[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const artifacts = {
  'results.json': {protocolRevision, runs},
  'validation.json': {protocolRevision, sources, validation},
};
for (const [name, value] of Object.entries(artifacts)) {
  const serialized = JSON.stringify(value, null, 2) + '\n';
  const url = new URL(name, import.meta.url);
  if (process.argv.includes('--check')) assert.equal(await readFile(url, 'utf8'), serialized, `${name} differs`);
  else await writeFile(url, serialized);
}
