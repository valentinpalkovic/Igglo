# ADR-007: Fram MVP: exploration, output checks, run export and stable finding IDs

Status: accepted, revision 2 (approved by the Head of Tech on IGL-47 before merge)
Date: 2026-11-01 (revision 1), 2026-11-01 (revision 2: three contract defects from the [PR #8 QA review](https://github.com/valentinpalkovic/Igglo/pull/8), see "Changed in revision 2")
Owner: Architekt
Approver: Head of Tech
Issue: [IGL-47](/IGL/issues/IGL-47) (part of [IGL-40](/IGL/issues/IGL-40))
Depends on: ADR-001 (packages), ADR-004 (WebMCP adapter), ADR-006 (Action shape and permissions, proposed)

## Context

Fram is the explorer described in the [CEO note](/IGL/issues/IGL-8#document-ceo-note). It loads a WebMCP app, calls its tools with inputs generated from their schemas, treats each distinct set of available tools as a state, and reports tools that throw, page errors and dead ends, each with a shortest path that reproduces it.

The [IGL-28 result](/IGL/issues/IGL-28#document-result) tested that algorithm as written on the Ledger fixture: one expense app, three roles, two workspaces, and the same 8 tools for every role and workspace. It found 3 of 16 seeded bugs, with 0 false positives. It missed all five silent wrong-result bugs and one bug that throws. Two separate causes:

1. **The state is only the tool set.** All 6 role × workspace combinations collapsed into one state, which was expanded once, as one role, in one workspace.
2. **Nothing checks outputs.** Even when B1–B5 are triggered directly, no finding type fires: nothing throws, there are no page errors and the tool set does not change.

Three smaller causes make it worse: every ID input was the generated string `"x"`, so every call on a real entity hit NOT_FOUND or FORBIDDEN (barrier C); a write was never followed by a read; and the order of an enum in the schema decided whether B7 was found (barrier D).

The plan for the company goal ([IGL-27, sections 2 and 9](/IGL/issues/IGL-27#document-plan)) depends on this ADR in three places:

- **Gate G3** counts a merged fix only if it names a Fram finding ID, and the verifier re-runs Fram on the commit before the fix (the ID must come back) and on the fix commit (the finding must be gone). So the ID must be stable, and "fixed" must mean fixed.
- **Section 9** needs a GitHub Action on every PR, a baseline run on `main`, and a per-run evidence export.
- **The outreach claim** stays limited ("does not check whether a tool returns the right result") until the changes below are built and re-tested on Ledger with 0 false positives.

Out of scope (issue): hosted service, dashboard, Rime-specific features, and LLMs anywhere in the loop.

### This ADR departs from the CEO note on purpose

Based on IGL-28, the MVP changes the CEO note's algorithm in the following rules. Each row is a decision in this ADR.

| CEO note / IGL-28 spike | ADR-007 | IGL-28 barrier |
| --- | --- | --- |
| A state is the set of available tools. | A state is **(context, tool set)**. The team declares contexts (for example role × workspace), and Fram explores each one separately. | B |
| Each state is expanded once, from a fresh load. | Still once per (context, tool set), from a fresh load. But **every write is followed by reads in the same session**, inside the edge. | B (B2, B5) |
| Inputs come from the schema only. Values from earlier outputs are never reused. | Inputs come **first from a pool of values seen in earlier outputs** in the same context, then from the schema. | C |
| Findings: tool threw, page error, dead end, declared but never reachable. | Tool threw, page error, dead end, plus **two output checks**: a declared permission matrix (finding) and a base-vs-PR diff of tool outputs (reported as a change, not a finding). "Never reachable" is not in the MVP. | A |
| Order follows the schema as written. | **Canonical order** for tools, properties, enum values and pool values, and every value is tried within fixed limits. Finding IDs never depend on path or order. | D |
| Re-run only the paths a change affects. | **Full run on every PR** in the MVP. | — |
| Parallel workers walk every state. | One worker in the MVP. Contexts are independent, so parallel contexts can come later without changing results. | — |

## Options

The main open choice is the output check. The other parts (state, inputs, IDs, export, baseline) follow from the IGL-28 requirements, and their alternatives are listed where they are decided.

- **P. Declared permission matrix.** The team declares, per context tag (for example `role: viewer`), which tools must be denied. Fram calls them with real inputs and reports a finding if the call is not denied.
- **D. Base-vs-PR output diff.** Fram records the output of every read in a run (normalized). A PR run compares its outputs with the run on the PR's base commit, and reports each read that returns something different for the same context, path and input.
- **I. Declared invariants or postconditions.** The team writes predicates in the Fram config, for example "after `delete_expense(id)` returns ok, `get_expense(id)` returns NOT_FOUND". Fram evaluates them after each matching call.
- **Do nothing** (no output check) is ruled out by IGL-28 and by the Head of Tech's brief: B1–B5 cannot be detected even when triggered.

## Evaluation

The template's weights are replaced for this decision, because all three options use the same stack (TypeScript in `fram-core`, no new dependency). The criteria are the ones the brief asks for: what it catches, noise from intended changes, setup cost for the partner, plus build cost before the MVP date (2026-12-15) and effect on ID stability (G3).

| Criterion | Weight | P: permission matrix | D: base-vs-PR diff | I: invariants |
| --- | --- | --- | --- | --- |
| Catches (Ledger B1–B5) | 30% | 2 | 4 | 5 |
| Noise from intended changes | 20% | 5 | 2 | 4 |
| Partner setup | 20% | 4 | 4 | 1 |
| Build cost before 2026-12-15 | 15% | 5 | 3 | 2 |
| ID stability for G3 | 15% | 5 | 3 | 4 |
| Weighted total | | **3.90** | 3.30 | 3.40 |

- Catches: P catches B1 only, but it catches it whether the bug is new on the PR or already on `main`. D catches B2–B5, but only on the PR that introduces them: a bug that is already on `main` has nothing to diff against. I catches B1–B5 in both cases, if the team wrote the right predicate.
- Noise: P fires only when a declared denial is not a denial; an intended permission change means editing one line of the matrix in the same PR. D reports every intended behaviour change, plus anything nondeterministic that normalization misses. I is as noisy as the team's predicates.
- Partner setup: P is a few lines per role. D needs no declaration, but it needs a deterministic app (fixed seed data, a reset hook, ignore rules for volatile fields such as timestamps). This is the same work every option needs for repeatable runs, so D and P score the same. I needs the team to think through and write the expected behaviour of each write tool. That is the work the CEO note says Fram customers want to avoid.
- Build cost: P is a lookup after a call. D needs observations stored per run, the baseline lookup by commit, and normalization. I needs a public API for partner code (call context, read access, error handling), which is hard to change once partners use it.
- ID stability: P findings have one obvious key (rule, tool). D changes exist only on one PR and then disappear after merge, so they are not tracked across runs. I findings are keyed by predicate name, which the team controls.

## Decision

**The MVP ships P and D. I comes first after the MVP, behind a trigger (see Evolution).**

P scores highest and is the only cheap check that finds a wrong-result class on a `main` baseline, which is where G3 fixes mostly come from. D adds regression detection for B2–B5 with no declaration, so a PR that breaks a write or a read shows it on that PR. I scores slightly higher than D, but it is not chosen for the MVP: it costs the partner the most setup, and it adds a public API for partner code that we would have to design in the four weeks that also have to deliver everything else. Moving I into the MVP is a scope change that moves the 2026-12-15 date; the Head of Tech decides and the Staff Engineer estimates.

What this leaves uncovered, stated plainly: **a silent wrong result that is already on `main` and is not a declared permission is not detected by the MVP** (B2–B5 on a baseline run). See "What we may claim".

### 1. Exploration

**Package:** all of this lives in `fram-core`. It uses the WebMCP adapter's driver (ADR-004) for every tool access and Playwright for browser contexts. The CLI and the Action only pass the config through (ADR-001).

**Contexts.** The team declares contexts in the Fram config. A context has a name, tags, and setup steps that bring a fresh page into that context:

```ts
// fram.config.ts (shape, not final code)
export default {
  app: { url: "http://localhost:4173", startCommand: "npm run preview", reset: { command: "npm run db:reset" } },
  contexts: [
    { name: "viewer@alpha", tags: { role: "viewer", workspace: "alpha" },
      setup: [{ tool: "sign_in", input: { role: "viewer" } }] },
    { name: "admin@beta", tags: { role: "admin", workspace: "beta" },
      setup: [{ tool: "sign_in", input: { role: "admin" } }, { tool: "switch_workspace", input: { workspace: "beta" } }] },
    // ...
  ],
  readOnlyTools: ["list_expenses", "get_expense", "get_total"],   // adds to WebMCP readOnlyHint
  permissions: [
    { when: { role: "viewer" }, deny: ["create_expense", "approve_expense", "delete_expense"] },
    { when: { role: "member" }, deny: ["approve_expense", "delete_expense"] },
  ],
  observe: { ignore: ["$..created_at"] },                          // volatile output fields
  evidence: { raw: false, runRetentionDays: 30 },                  // see section 6
  limits: { statesPerContext: 50, callsPerContext: 500, runMinutes: 15, callTimeoutMs: 5000 },
};
```

- Setup steps are tool calls, or a path to a module that exports `async (page) => void` for UI logins. `storageState` files are accepted too. Fram reads a `storageState` file only to create the browser context. It never copies the file or its cookies and tokens into an artifact, the export or the logs; the export records only the file path. The MVP does not support logins that need secrets: fork PRs get no secrets, and ADR-006 says the Fram workflow passes none. Contexts use test users of a backend that the start command brings up, or, for a deployed preview, the test users described in section 7.
- Without contexts in the config, Fram explores one context named `default` with no setup. This is the CEO note's behaviour, and the job summary says that roles and tenants were not explored.
- The config is a `.ts` or `.mjs` file loaded with Node 24's built-in type stripping (checked on Node v24.21.0). No loader dependency. Validation lives in `fram-core` (zod), so the CLI and the Action share it.

**State.** A state is `(context name, sorted tool names)`. Data is not part of the state: putting data into the key would make the number of states grow with every created row, and two runs could reach different numbers of states from the same app. Data is covered by write-then-read and by the output checks instead.

**Edges.** Every edge starts from a fresh browser context: new `BrowserContext` (empty cookies, storage and IndexedDB), app reset hook, load, context setup, replay of the shortest known path to the state, then the call. Within one state, in canonical order:

1. **Reads.** Every read-only tool, with each input candidate (below). Outputs go into the value pool. Reads run in two rounds, so that `get_expense(id)` can use IDs that `list_expenses` returned in round 1.
2. **Writes.** Every other tool, with each input candidate. A tool is read-only if it has the WebMCP `readOnlyHint` or is listed in `readOnlyTools`; everything else is treated as a write.
3. **Write, then read.** After every write that does not throw, in the same session and without reloading, Fram runs all read-only tools again. It uses the pool values plus every value from the write's input and output first, so the read hits the touched entity (for example `get_expense("a1")` after `approve_expense("a1")`).
4. **New states.** If the tool set after a call is new for this context, Fram records the path and queues the state (breadth-first, so the first path found is a shortest one).

**Value pool (real IDs).** Fram walks every JSON output it observes in a context and collects primitive values by property name and JSON type, for example `id: string → ["a1", "a2"]`. Input candidates for a property are the pool values for the same name and type (canonical order, at most 5) plus one value generated from the schema. The generated value is how unknown-ID bugs such as B8 are still found. The pool is per context, from reads made in that context only. So one context's data never changes another context's inputs, and adding a context does not change existing results.

A pooled value only exists in the server state that produced it, and every edge resets that state. So each pool value carries the path of the read that produced it, and Fram uses it only in an edge whose replayed path starts with that path. Values taken from a write's input or output, and from the reads that follow the write, are used only in that same session (step 3) and never enter the pool for later edges. Without this rule, an ID created by a write in one edge would be passed to a tool in the next edge, after the reset deleted it, and a clean app could report `tool-threw`. The acceptance test covers it (requirement 6 in section 10).

**Generated values must satisfy the schema.** Fram generates values only for a supported subset of JSON Schema: `type`, `enum`, `const`, `minimum`/`maximum`, `minLength`/`maxLength`, and `format` `uuid`, `email`, `date`, `date-time` and `uri`. Per property: every enum value; `minimum` (or `0`); `true` and `false`; for strings, a fixed value of the declared format (for example the UUID `00000000-0000-4000-8000-000000000000`), padded to `minLength` and cut to `maxLength`, else `"x"`. A property with any other constraint (`pattern`, `oneOf`, `not`, other formats) gets no generated value. It uses pool values only, and the export counts it under diagnostic `input.unsupported-schema`. A required property with no candidate means the tool is not called in that state, and that is counted too. So Fram never calls a tool with an input its schema rejects, and a tool that rejects invalid input correctly is never reported. This needs no JSON Schema validator dependency; if pilots use unsupported keywords widely, see "Schema coverage" in Evolution.

**Combining inputs.** Each-choice coverage: every candidate value of every property appears in at least one call, and the other properties take their first canonical candidate. This keeps calls linear in the number of candidates instead of multiplying them, and it guarantees that every enum value (for example `currency: "USD"` for B7) is tried.

**Canonical order.** Before inputs are generated, tool names, property keys, enum values and pool values are sorted by code point of their canonical JSON. Every step that is cut by a limit is cut in this order. So a PR that only reorders an enum, a property or tool registration runs exactly the same calls in the same order.

**Determinism.**
- Clock: `context.clock.install()` at a fixed time from the config (default `2026-01-01T00:00:00Z`), before any page script.
- Randomness: an init script replaces `Math.random` with a seeded generator and `crypto.randomUUID` with a seeded sequence; the seed is per edge, derived from the run seed and the edge's canonical key. `crypto.getRandomValues` is not replaced (apps use it for security).
- Network: see "Network containment" below.
- Server state: the `reset` hook (a command, or an HTTP request) runs before every edge. Without it, the export says `determinism.serverReset: false`, and the job summary warns that a path may only reproduce after the same earlier calls.
- Settle: after each call, Fram waits until the network is idle or 500 ms have passed with no tool change, at most `callTimeoutMs`.

**Network containment.** Purpose: repeatable runs, and test runs that never reach real third parties (payments, email, analytics). It is **not** an exfiltration boundary. The app server that `startCommand` runs on the host has unrestricted network access, and the partner's code is trusted as much as the rest of their CI. The wider network question belongs to the threat model ([IGL-49](/IGL/issues/IGL-49)).
- Allowed origins: the origin of `app.url` plus `app.allowOrigins`. Entries are exact origins (scheme, host and port), parsed with `URL`; wildcards are rejected when the config is validated. The check denies by default: a request is allowed only if its origin equals an allowed origin.
- HTTP: `context.route` aborts every request to any other origin. Aborted requests are counted per origin in the export.
- Service workers: every context is created with `serviceWorkers: "block"`, because `context.route` does not see requests that a service worker handles (Playwright docs).
- WebSockets: `context.routeWebSocket` with the same check. A socket to an allowed origin is connected to the server; any other socket is closed and counted.
- Redirects: Playwright calls the route handler only for the first URL of a redirect chain, so an allowed origin that redirects elsewhere is not blocked. Fram detects it: every `request` event with `redirectedFrom()` set and an origin outside the allowlist is counted in `determinism.redirectEscapes`, and the summary warns. Following redirects in Fram with `route.fetch` and fulfilling the final response was rejected, because the page would see a different response URL than in production.
- WebRTC: an init script removes `RTCPeerConnection` and `RTCDataChannel` from the page before app scripts run (they do not exist in workers). This stops ordinary app code, not code that tries to get around it.
- Fixture tests in `fixtures/ledger/` check each case: a service-worker fetch, a WebSocket and a direct request to a blocked origin are blocked; a cross-origin redirect is detected and counted; WebRTC is unavailable.

**Limits.** `statesPerContext`, `callsPerContext`, `runMinutes` and `callTimeoutMs`, with the defaults above. When a limit is hit, Fram stops that context (or the run) in canonical order and records `{ kind, context, limit, reachedAt }` in `limits.hit`. Any context with a limit hit is **partial**, and the comparison never reports a finding as fixed in a partial context (see 4).

### 2. What Fram reports

**Findings** (kind `defect`; they count toward gate G3):

| Type | Fires when |
| --- | --- |
| `tool-threw` | `callTool` returns `error` (the tool's `execute` threw or rejected) or `timeout`. |
| `page-error` | an uncaught exception or unhandled rejection (`pageerror`) during a call or its settle time. `console.error` is not a finding. |
| `dead-end` | after a call, the top document has no tools left, and the tool is not listed in `terminalTools` (for example `delete_account`). |
| `permission-violation` | a tool that a matching `permissions` rule denies returns something that is not a denial. A denial is: the call threw, or the result parses as JSON with `isError: true`. A team can replace that rule with `isDenied` in the config. |

**Calls that a permission rule denies.** A call is *denied by config* when a `permissions` rule whose `when` tags match the context lists the tool. For these calls the permission check decides, and `tool-threw` does not fire for a denial. In this order:

| Outcome of a call that is denied by config | Result |
| --- | --- |
| `timeout` | `tool-threw`, signature `timeout`. A timeout is never a denial. |
| A denial (the default rule above, or `isDenied` if the config sets it) | Nothing. This is the expected outcome, whether the app returns `isError` or throws, for example `ForbiddenError`. |
| The call threw something that `isDenied` does not accept (only possible when `isDenied` is set) | `tool-threw`, as for any other call. |
| A result that is not a denial | `permission-violation`. |

A `pageerror` during the call or its settle time is a `page-error` in every case: an uncaught exception is not the tool's answer. Calls that no rule denies are judged by the table above this one, unchanged. With the default rule, any throw counts as a denial, so an unrelated exception in a denied call is not reported; a team that wants to see those sets `isDenied`, for example to accept only errors named `ForbiddenError`. Acceptance requirement 11 covers both.

**Changes** (kind `change`; not findings, they do not count for G3, and by default they never fail the job): `output-changed` is reported when a read's normalized output has a different hash than in the base run for the same context, path, call and input. The comparison uses hashes only (section 6). If the `observe` settings differ from the base run's, the hashes are not comparable, so Fram computes no changes and the summary says why. They are shown as "behaviour changed: check that this is intended". A change exists only on a PR, so it has no new, open or fixed status.

**Not in the MVP:**
- **"Declared but never reachable"** needs the static dependency graph (oxc-parser and oxc-resolver) to know what is declared. Fram only sees tools that register while it runs. Building the static side is a separate project with its own open questions (dynamic registration, bundler resolution), and IGL-28 shows the output checks matter more for the goal. Out, with a trigger.
- **Invariants (I)**, see Decision and Evolution.
- **Declarative (form-based) tools and iframe tools** (ADR-004).

### 3. Full run on every PR

Every PR runs the full exploration. Re-running only affected paths needs the static side and the join from the CEO note, which come after the MVP. The rule when unsure is to re-run everything, and in the MVP Fram is always unsure. If the full run hits `runMinutes`, the export and summary say so, and nothing in the partial part is reported as fixed.

### 4. Finding IDs

The ID is what a partner writes in a fix PR and what the G3 verifier checks, so it is computed only from things that describe the defect, never from how Fram got there:

```text
id = "FRAM-" + base32(sha256(canonicalJSON([idScheme, type, tool, signature])))[0..10]
```

- `idScheme` is `1`. It is in the hash so that a scheme change gives new IDs on purpose, and the export says which scheme it used.
- `type`: one of the four finding types.
- `tool`: the tool name, exactly as registered.
- `signature`:
  - `tool-threw` and `page-error`: the error name plus the message, normalized. Digits, UUIDs, hex strings of 8 or more characters, email addresses, URLs, quoted strings, and every input value of the call are replaced with placeholders. Stack frames are not used: line numbers and bundle file names change with unrelated edits. A timeout's signature is `timeout`.
  - `dead-end`: the constant `no-tools`.
  - `permission-violation`: the canonical JSON of the rule's `when` tags. The tool is already in the ID.

Not in the ID: the context, the path, the input, the order of anything, the run, the commit and the Fram version. Contexts, paths and inputs where the finding occurred are listed inside the finding, and so are its occurrence keys (section 5). The representative path is the shortest one, and among equal lengths the first in canonical order.

**The ID stays the same** when the app is re-run unchanged, when only the order of enum values, properties or tools changes, when unrelated code changes, when the defect appears in more or fewer contexts or with other inputs, and when contexts are added or renamed.

**The ID changes** when the tool is renamed, when the error's name or normalized message changes, when the defect changes type (for example a throw becomes a page error), when a permission rule's `when` tags are edited, and when `idScheme` changes (a new major version of the export schema).

Accepted trade-off: two different defects in the same tool with the same normalized error share an ID. Fixing one leaves the other, so the ID stays open, and the verifier's re-run on the fix commit shows the finding is still there. That is the safe direction for G3.

**Changes** get an ID too, so a team can refer to one: `CHG-` plus the same hash over `[idScheme, context, state, path, write call, read call, read input]`. Change IDs are not stable across PRs and do not need to be.

### 5. Baseline on `main` and comparison

- A run on each push to `main` uploads its export as the artifact `fram-run` and its observations as `fram-observations`. Retention is set explicitly on every upload (`retention-days`), never left to the repo default (90 days on GitHub unless changed):
  - `fram-observations`: **14 days**. It is only needed until the next `main` baseline. If a PR's base run has expired, the rules below fall back to "exact base missing" or "no base".
  - `fram-run`: **30 days** by default. `evidence.runRetentionDays` can set it lower. The docs warn before anyone sets it higher, because the export holds paths and signatures from the app.
  - Job logs and job summaries follow the repo's log retention, which Fram cannot set. That is one more reason they never contain app data (section 8).
- A PR run looks up the `main` run for the PR's base commit (`pull_request.base.sha`) through the Actions API (`actions: read`, as in ADR-006). The PR side runs on the merge commit that `actions/checkout` gives for `pull_request`, so the difference between the two runs is exactly the PR.
- **A `main` run never fails on findings.** Fram decides that a run is on `push` to the default branch from the GitHub event context only: `GITHUB_EVENT_NAME` is `push` and `GITHUB_REF` is the default branch named in the event payload. No Action input or config field can set it. On `push` to the default branch, `failOn` does not apply: the job succeeds when Fram finishes the run and uploads both artifacts, whatever it found, and fails only when Fram itself fails (invalid config, app did not start, crash, upload failed). Findings on `main` are listed in the job summary. Without this, the first `main` run of an app with any finding would fail under `failOn: new`, the success filter below would reject it, and no later `main` run could become a baseline while the finding stays. PRs would then report existing defects as `new`. So the workflow conclusion of a `main` run means "Fram completed", and the filter below can keep `conclusion == "success"` unchanged.
- **Which runs count as a baseline.** A fork PR can name its branch `main`, so the branch name alone would let a PR supply its own baseline, turn its new findings into `open` and pass `failOn: new`. Fram accepts a run only if all of these hold: `event == "push"`, `head_branch` is the repo's default branch, `head_repository.id == repository.id`, the same workflow file as the current run, and `conclusion == "success"`.
- **The baseline is untrusted input.** Before use, the downloaded `fram-run` and `fram-observations` are checked against size limits (the observation caps in section 6, 5 MB for the export) and validated against their JSON Schemas. Any failure counts as "no base", and the summary says why.
- **Exact base found:** findings are marked `new` (not in the base), `open` (in both), `fixed` or `not-checked` (both below). Output changes are computed.
- **`fixed` needs proof that the PR run checked it.** A finding being absent from the PR run is not enough: a PR can stop Fram from reaching the call that showed it (for example, `list_expenses` stops returning `b2`, so `approve_expense("b2")` is never called, and B6 stays in the code). So every finding lists its **occurrences**, one per call that showed it: `{ context, key }`, where `key` is the hash of the canonical `[context identity, state, path, call, input]`, with input values resolved (hash only, like observations in section 6). There are at most 100 occurrences per finding, kept in canonical order; if a finding has more, the list is cut and the finding sets `occurrencesTruncated: true`.
  **Context identity** is the hash of the context's name, its tags, its setup steps as written in the config (tool names, input literals, environment variable names), and the SHA-256 of the contents of every file the setup loads: the `storageState` file, and the setup module with every local file it imports (relative imports, followed transitively). So a changed login is a different context, even when the file path stays the same: if a PR edits `sessions/test.json` from an admin to a viewer session, every key of that context changes, and its base occurrences become `call-not-made`, never `fixed`. File contents are only folded into the identity. Fram never writes the identity, a file hash or any session cookie or token on its own to the export, the summary or the logs; the identity is an input to occurrence keys and nothing else. Not covered: a changed value of an environment variable, and packages a setup module imports from `node_modules`. A team that swaps the test user behind an unchanged variable name gets no warning.
  A base finding that is absent from the PR run is:
  - `fixed` if the PR run executed **every** base occurrence key, none of these calls showed the finding, no context of those occurrences is partial, and the base's occurrence list is not cut (`occurrencesTruncated` is false), and the check that produced the finding still applies: for `permission-violation`, a rule with the same `when` tags still denies the tool, and the effective denial rule is unchanged (both runs use the default rule, or both use an `isDenied` with the same `denialRule` hash, section 6); for `dead-end`, the tool is not in `terminalTools`.
  - otherwise `not-checked`, with a reason per occurrence: `context-missing`, `context-partial`, `call-not-made` (the state, path or input was not reached, or the context's identity changed), `occurrences-truncated` or `check-removed` (a widened `isDenied`, for example `() => true`, is `check-removed` for every `permission-violation`).
  The PR run decides this itself: it compares the base's occurrence keys with the keys of the calls it made. The G3 verifier counts only `fixed`. Acceptance requirements 5, 10 and 13 cover both directions.
- **Exact base missing** (the `main` run failed, has not finished, or has expired): Fram may compare with the newest earlier accepted `main` run, but other merges since then are part of the PR checkout and not of that run. So it **does not attribute anything to the PR**: a finding in both runs is `open`, a finding only in the PR run is `unattributed`, and nothing is `fixed`. It sets `comparison.exactBase: false` and computes no output changes. `failOn: new` also fails on `unattributed`, so a new defect is not let through; the summary says the base was not exact and that re-running the job after the base run finishes gives exact statuses. The G3 verifier only uses comparisons with `exactBase: true`.
- **No base at all** (first run): every finding is `new`, and the summary says it is a first run. On a PR this can fail the job under `failOn: new`; the next PR after the first `main` run has a base.

Where baselines live: GitHub artifacts only. No Iglo service (out of scope), no commits to the partner's repo.

### 6. Run export (versioned JSON schema)

The schema lives in `packages/fram-core/schema/fram-run.v1.json` (JSON Schema 2020-12) with `$id` `https://github.com/valentinpalkovic/Igglo/fram-run/v1`. The export carries `schemaVersion` as SemVer: adding fields is a minor version, removing or changing a field, or a new `idScheme`, is a major version. `fram-core` validates every export against the schema before writing it, and a test checks that the TypeScript types and the schema agree.

```jsonc
{
  "schemaVersion": "1.0.0",
  "runId": "gh-1234567890-1",            // "gh-<run_id>-<run_attempt>" in Actions, otherwise a UUID
  "repo": "owner/name",
  "pr": 42,                               // null on main
  "trigger": "pull_request",              // "pull_request" | "push_main" | "manual"
  "headSha": "…", "baseSha": "…", "mergeSha": "…",
  "startedAt": "2026-12-01T10:00:00Z", "endedAt": "2026-12-01T10:07:12Z",
  "fram": { "version": "0.1.0", "idScheme": 1, "configHash": "sha256:…", "denialRule": "default" },   // or "sha256:…" of the isDenied source
  "webmcp": { "implementation": "iglo-shim", "specRevision": "cg-draft-2026-09-03", "nativeDetected": false },
  "determinism": { "clock": "2026-01-01T00:00:00Z", "seed": 1, "serverReset": true,
                   "blockedOrigins": { "https://example-analytics.test": 3 }, "blockedWebSockets": {}, "redirectEscapes": {} },
  "evidence": { "raw": false },
  "contexts": [ { "name": "admin@beta", "tags": { "role": "admin", "workspace": "beta" }, "states": 2, "calls": 61, "partial": false } ],
  "limits": { "hit": [] },
  "comparison": { "baseRunId": "gh-…", "baseSha": "…", "exactBase": true },
  "findings": [ {
    "id": "FRAM-7K3Q9X2MBA", "kind": "defect", "type": "tool-threw", "tool": "approve_expense",
    "signature": "TypeError: Cannot approve <str> expense",   // "message" only with evidence.raw
    "status": "new",                      // "new" | "open" | "fixed" | "not-checked" | "unattributed"
    "contexts": ["admin@beta"],
    "occurrences": [ { "context": "admin@beta", "key": "sha256:…" } ],   // section 5; key matches ^sha256:[0-9a-f]{64}$, at most 100
    "occurrencesTruncated": false,
    // with status "not-checked": "notChecked": [ { "key": "sha256:…", "reason": "call-not-made" } ]
    "path": [                             // shortest reproducing path; setup only as a reference
      { "setup": "admin@beta" },
      { "state": { "context": "admin@beta", "tools": ["approve_expense", "…"] }, "tool": "list_expenses", "input": {} },
      { "state": { "context": "admin@beta", "tools": ["approve_expense", "…"] }, "tool": "approve_expense",
        "input": { "id": "b2", "note": { "$pool": ["note", 0] } } }
    ]
  } ],
  "changes": [ { "id": "CHG-…", "kind": "change", "type": "output-changed", "context": "admin@alpha", "path": [ … ],
                 "read": { "tool": "get_expense", "input": { "id": "a1" } }, "baseOutputHash": "sha256:…", "outputHash": "sha256:…" } ],
  "diagnostics": [ { "code": "webmcp.declarative-tools-not-tested", "count": 0 } ]
}
```

Every field the brief lists is there: run ID, repo, PR number, head and base SHA, trigger, start and end time in UTC, Fram version, and findings with ID, type, tool, message and shortest path (state, tool, input per step). The message is the normalized `signature` by default, and the raw message is opt-in, for the reasons below.

**What app data the evidence holds.** In public repos, any signed-in GitHub user can download a run's artifacts, so the default stores as little app data as the checks need.
- **Observations** (`fram-observations`): by default one entry per read, `{ key: [context, state, path, call, input], outputHash }`. The diff needs nothing more. Short outputs can still be guessed from their hash, so this reduces exposure; it does not hide the data.
- **Raw evidence is opt-in:** `evidence.raw: true` adds the full normalized outputs to `fram-observations` (capped at 64 KB per output and 20 MB per run) and the raw error message to each finding (cut to 500 characters). It is off by default. When it is on in a public repo, the job summary warns at the top.
- **Setup steps** are written into paths only as a reference (`{ "setup": "admin@beta" }`), never with their inputs, so login inputs such as an email and password never reach the export or the summary. Replay looks the steps up in the config. A per-input `sensitive` flag can come later.
- **Inputs in paths are app data** when they come from the pool, because the pool copies them from outputs. Fram writes a pooled value as-is only if its property name is an ID (`id`, or ending in `Id` or `_id`) and the value does not look like an email. Every other pooled value is written as a reference `{ "$pool": [property, index] }`, which replay resolves by re-running the path's reads after reset (this needs a reset hook; without one, replay says the reference cannot be resolved). Values Fram generated from the schema are its own and are written as-is.
- **Error messages** go into the export only as the normalized `signature` (section 4), which removes quoted strings, emails, URLs, numbers and input values. Words in the message itself can still be app data; that is the remaining exposure.
- The rule "test data only" (IGL-27 section 9) is a **policy, not a control**: Fram cannot tell test data from real data. The controls are the defaults above, the retention limits in section 5, and the guardrail for deployed apps in section 7.

### 7. How the app starts in CI

The same shape as Playwright's `webServer`: `app.startCommand`, `app.url`, `app.timeoutMs` (default 120 s) and `app.reuseExisting` (for local runs). Fram starts the command on the host, waits until `url` answers with a status below 400, and stops the process tree when the run ends (the Action's `post` step, ADR-006). A team that tests a deployed preview sets only `app.url`. With no secrets, its logins must work from what is in the repo, so for a deployed preview:
- The test users must be dedicated to Fram, low-privilege apart from the roles under test, and valid only on that preview. Their credentials or session files in the repo are treated as public. The quick start says so.
- **Guardrail:** if `app.url` is not `localhost` (or `127.0.0.1`) and there is no `reset` hook, Fram calls no write tools unless the config sets `app.dataClass: "test"`. Without it, Fram runs reads only and the summary says why. Permission-matrix exploration calls write tools as roles that should not have them, and a real permission bug would then change shared data.

The ADR-006 Action inputs `start-command` and `url` map to these fields. All other settings come from the config file (input `config`, default `fram.config.ts`), so the Action and the CLI read the same file.

### 8. Output in GitHub

- **Job summary**, from the export only: counts of new, open and fixed findings and of changes, a table of new findings (ID, type, tool, contexts, a short path), a table of changes, limit hits, and determinism warnings. Tool names, signatures and inputs come from the app, so every such string is rendered in a code span, with `|`, backticks and line breaks escaped and a length cap of 200 characters. A page cannot add links, images or table rows to the summary.
- **Logs:** Fram's stdout and stderr contain progress and the same data as the export (counts, IDs, types, tool names, context names), never tool inputs, tool outputs, raw error messages or page console messages. Page console output is not recorded at all. The CLI's `--debug` flag prints raw data for local runs; the Action has no input for it, and the CLI warns when `--debug` is used with `CI` set.
- **Artifacts** `fram-run` (the export) and `fram-observations`.
- **Exit code:** `failOn` in the config applies to `pull_request` and `manual` runs: `new` (default) fails the job when there is at least one `new` or `unattributed` finding, `any` also on `open`, `none` never. A run on `push` to the default branch ignores `failOn` (section 5). Changes never fail the job in the MVP.
- **PR comment: not in the MVP.** It needs `pull-requests: write`, which ADR-006 does not grant and which fork PRs never get. The job summary is one click from the PR's checks.

### 9. Playwright interop

Fram does not replace a team's Playwright suite, and the two do not touch each other. Playwright tests check flows the team wrote down, through the UI, with the team's own assertions. Fram calls the app's WebMCP tools in every declared context and reports crashes, dead ends, permission breaches and changed outputs that nobody wrote a test for. They run as separate jobs in the same workflow, or as separate workflows, and can share the build step and the start command. Fram uses `playwright-core` and its own Chromium, pinned by the Fram Action, so it does not depend on the team's Playwright version and does not read `playwright.config.ts`. A team can reuse its Playwright login as a Fram context through a `storageState` file or a setup module. A Fram finding's path can be turned into a Playwright test by hand. Generating that test is not in the MVP.

### 10. What IGL-28 changes: expected results on Ledger, and what we may claim

**Acceptance spec.** The Ledger fixture is ported to `fixtures/ledger/` (ADR-001 puts test apps there, and fixtures may use `modelContext` directly). It becomes a browser page that registers its 8 tools through `document.modelContext.registerTool`, with the same seed data and the same B1–B8 flags. The acceptance test lives in `fixtures/ledger/` too, because nothing in `packages/` may import from `fixtures/`. It runs the real `fram-core` with a config that declares the 6 role × workspace contexts, the 3 read-only tools and the permission rules shown in section 1.

Two modes per bug, each in both enum orders:
- **Baseline mode:** Fram on the build with the bug alone (the bug is already on `main`).
- **PR mode:** Fram on the build with the bug, compared with the clean build as the base (the PR introduces the bug).

| Bug | Seeded defect | Baseline mode | PR mode | Mechanism |
| --- | --- | --- | --- | --- |
| B1 | Viewer can approve a pending expense | **found**, `permission-violation` | **found**, new | contexts + pool (`a1`) + permission rule for `viewer` |
| B2 | Admin delete returns ok, item stays | not found | **change** on `list_expenses` and `get_expense` | write-then-read + diff |
| B3 | `get_total` in beta skips conversion | not found | **change** on `get_total` in `*@beta` | contexts + diff |
| B4 | After beta → alpha, list shows beta | not found | **change** on `list_expenses` after `switch_workspace(alpha)` in `*@beta` | contexts + write-then-read + diff |
| B5 | Read after approve is stale | not found | **change** on `get_expense(a1)` after `approve_expense(a1)` in `admin@alpha` | pool + write-then-read + diff |
| B6 | Admin approve of USD throws | **found**, `tool-threw`, context `admin@beta` | **found**, new | contexts + pool (`b2`) |
| B7 | Member/admin USD create removes all tools | **found**, `dead-end` | **found**, new | contexts + every enum value |
| B8 | Unknown ID makes `get_expense` throw | **found**, `tool-threw` | **found**, new | generated schema value (`"x"`, as Ledger's `id` has no format) |
| clean | — | 0 findings | 0 findings, 0 changes | — |

Hard requirements of the test, all of which must hold:
1. The clean build gives 0 findings, and clean compared with clean gives 0 changes. Any false positive fails the test.
2. Declared and reversed enum order give **identical finding IDs and identical changes**, in every row. Clean declared compared with clean reversed (a PR that only reorders enums) gives 0 new, 0 fixed and 0 changes.
3. Each finding's representative path, replayed on a fresh load of the same build, reproduces it, and does not reproduce on the clean build (the IGL-28 grading rule).
4. Running the same build twice gives byte-identical `findings` and `changes`.
5. Fixed detection: for each found bug, PR mode with the bug build as base and the clean build as head reports that finding as `fixed` (the G3 verifier's check, in miniature).
6. Transient IDs: the clean build plus a `create_expense` that returns a new ID gives 0 findings. An ID created only in one edge is never used in another edge.
7. Schema-valid inputs: a variant of `get_expense` that declares `format: "uuid"` and throws on a malformed ID gives 0 findings on the clean build.
8. Evidence: with `evidence.raw: false`, no setup input, no non-ID pooled value and no raw error message appears in `fram-run`, `fram-observations`, the job summary or stdout (checked by searching for the fixture's seeded names and emails).
9. Network: the fixture tests listed under "Network containment" in section 1.
10. No credit without coverage: with the B6 build as base, (a) a head of the B6 build with `variant=hide-b2` (`list_expenses` no longer returns `b2`) reports B6 as `not-checked`, reason `call-not-made`, never `fixed`; (b) the clean build as head with a config that drops `admin@beta` reports B6 as `not-checked`, reason `context-missing`.
11. Denials: with `variant=throw-denial` (every denial throws `ForbiddenError` instead of returning `isError`), the clean build gives 0 findings. With `isDenied` set to accept only `ForbiddenError`, the same build still gives 0 findings.
12. Baseline bootstrap: a `main` run of the B6 build succeeds (exit code 0) although it has a finding, and a following PR run with that run as base reports B6 as `open`, not `new`.
13. Changed check or login, never `fixed`: (a) with the B1 build as base and head, a head config whose `isDenied` accepts every result reports B1 as `not-checked`, reason `check-removed`; (b) with the B6 build as base and head, a head whose `admin@beta` setup module, at the same path, signs in as a viewer reports B6 as `not-checked`, reason `call-not-made`.

Counting the rows above: in baseline mode the design finds 4 of 8 (B1, B6, B7, B8). In PR mode it reports all 8: 4 as findings and 4 as changes. These are predictions for one synthetic fixture with bugs chosen to probe the design. They are not a detection rate.

**What we may claim**, to replace the wording in IGL-27 section 9 only after the Ledger acceptance test passes on the real `fram-core` and the Head of Tech confirms it on IGL-27:

| | Wording |
| --- | --- |
| May say | Fram explores each role and workspace you declare. It finds tools that crash, page errors, states with no actions left, and tools that a declared role is allowed to call although it should be denied, each with the exact steps to reproduce. On every PR it also shows where a tool now returns something different than on your main branch. |
| May not say | That Fram finds wrong results that are already in the app (other than declared permissions). That it finds tenant data leaks. That it covers roles or workspaces you did not declare. Any detection rate or coverage figure. |
| Must say | Output changes are shown for review, not judged: Fram does not know whether the new output is right. |

Until the test passes, the current IGL-27 section 9 wording stays as it is.

## Evolution

Designed for: Chromium, one worker, a few contexts per app (up to about 10), apps that can reset their test data in seconds, full runs within 15 minutes on a standard GitHub runner, teams that declare contexts and read-only tools by hand.

Revisit when:
- **Invariants (I):** the plan's tripwire fires (a running pilot team has no confirmed finding on its baseline run, or three or more wave 1 replies say wrong results are the pain), or a pilot team asks to declare expected outputs. Write ADR-0xx for a postcondition API and move it before any other Fram feature work.
- **Never reachable / affected-only runs:** a pilot's full run hits `runMinutes` on more than 1 in 5 PRs, or a partner asks for unreachable-tool findings. Write the static-side ADR (oxc, join with the walk graph).
- **Parallel contexts:** median run time on a pilot app is over 10 minutes, and its reset hook isolates contexts (for example a database per context).
- **Change noise:** on a pilot repo, more than half of the PRs with changes are marked "intended" by the team in two consecutive weeks. Add per-tool opt-out of the diff, or path-level ignore rules from the summary.
- **Pool misses:** a pilot app's IDs use different property names in outputs and inputs (for example `expenseId` vs `id`), visible as calls that only ever return NOT_FOUND. Add declared aliases.
- **Schema coverage:** on a pilot app, more than 1 in 5 tool properties are counted under `input.unsupported-schema`. Decide on a JSON Schema validator and a generator for `pattern` (new dependency, so an ADR).
- **Logins with secrets:** a pilot cannot provide test users without secrets. Needs a change to ADR-006 and a Security Engineer review. The evidence rules of section 6 (setup steps only as references) must already hold when it fires.
- **ID collisions or churn:** a G3 verification fails because an ID did not reproduce on the pre-fix commit. Find the cause before changing `idScheme`.

## Consequences

Easier:
- Fram explores every declared role and workspace, uses real IDs, and reads after every write, so the IGL-28 blind spots for throws (B6) and dead ends (B7) are closed.
- IDs do not depend on path, order or context, so G3 can be verified by re-running Fram, and a reorder-only PR changes nothing.
- One export, validated against a published schema, carries the G2 and G3 evidence.

Harder:
- Partners must declare contexts, read-only tools and a reset hook to get the full value. Without them Fram falls back to the CEO note's behaviour and says so.
- Runs are longer: every edge starts fresh, with reset and setup. Each context costs roughly as much as a whole IGL-28-style run.
- `fram-core` stores observations per run, which is more data to handle and review than findings alone.

We give up:
- Detecting wrong results that are already on `main` (except declared permissions) in the MVP.
- Second-order writes (create, then approve the created row) in one session.
- Affected-only runs and "never reachable" findings in the MVP.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The diff is noisy on a real app (timestamps, generated IDs, ordering), and teams learn to ignore it. | Fixed clock and seeded randomness, `observe.ignore`, changes never fail the job, and the change-noise trigger above. |
| A reset hook is slow, so runs exceed the time limit. | Limit hits are reported, and nothing is reported as fixed in a partial context. The quick start recommends an in-memory or snapshot test database. |
| An app with server state runs without a reset hook: paths do not reproduce alone. | `determinism.serverReset: false` in the export and a warning in the summary. The G3 verifier treats such runs as weaker evidence (Head of Product to decide). |
| Normalized error messages still contain a varying part, so an ID changes between runs. | Requirement 4 of the acceptance test, unit tests of the normalizer, and the ID-churn trigger. |
| Exploration on a permission matrix calls write tools as roles that should not have them, and a real permission bug then changes data. | Test data only (IGL-27 section 9, a policy). Reset before every edge. On a non-local app without a reset hook, no write tools unless `app.dataClass: "test"` (section 7). |
| Partner app data ends up in artifacts that anyone can download in a public repo. | Hash-only observations, setup references, pooled values as references, signatures instead of messages, raw evidence opt-in with a warning, explicit retention (sections 5 and 6). |
| A PR supplies its own baseline and hides its new findings. | Baseline runs filtered by event, default branch, same repository, workflow and success; baseline files validated (section 5). Revision 2 does not change the filter: `main` runs succeed whenever Fram completes, so `success` still means a complete baseline. |
| A PR stops Fram from reaching a defect, and it is credited as fixed. | `fixed` needs every base occurrence re-executed; otherwise `not-checked` (section 5, requirement 10). |
| The shim differs from native WebMCP (ADR-004). | Unchanged from ADR-004: `webmcp.specRevision` and `nativeDetected` in every export. |

## Cost impact

No new services. Runtime dependencies of `fram-core`: `playwright-core` (ADR-004) and `zod`, which ADR-004 already plans for the driver's validation of page data; `fram-core` uses the same version for config and export validation. Runs use the partner's GitHub Actions minutes: about one full run per PR plus one per push to `main`. Artifacts use the partner's artifact storage (GitHub Free has 500 MB for private repos, ADR-006); hash-only observations are small, the 20 MB cap applies when raw evidence is on, and retention is set explicitly (14 days for observations, 30 for the export, section 5).

## Security review

Required before acceptance, from the Security Engineer ([IGL-81](/IGL/issues/IGL-81)). The first review asked for changes S1–S5 ([PR #8 review](https://github.com/valentinpalkovic/Igglo/pull/8#pullrequestreview-5728146214)); this revision addresses them as follows. The re-review ([IGL-90](/IGL/issues/IGL-90), [PR #8 re-review](https://github.com/valentinpalkovic/Igglo/pull/8#pullrequestreview-5728240406), against `73605ad`) approved them. Its non-blocking recommendations R1–R8 (all low: a DNS-level backstop for redirects via Chromium `--host-resolver-rules`, narrower purpose wording, references for credential-like `*Id` names, observation keys and `changes[].read.input`, a `configHash` mismatch warning, size caps on uncompressed bytes, backtick-safe summary escaping, and a parsed-hostname localhost check) are tracked in [IGL-49](/IGL/issues/IGL-49) and change no decision here.
- **Auth (S3):** contexts log in as test users. The MVP allows no secrets (consistent with ADR-006). Setup inputs never reach the export, summary or logs, `storageState` contents are never copied, and test users of a deployed preview are dedicated, low-privilege, limited to that preview and treated as public (sections 1, 6, 7).
- **Customer data (S1, S2, S3):** "test data only" is a policy, not a control; Fram cannot enforce it. The controls: observations hold only hashes by default; raw outputs and messages are opt-in with a public-repo warning; pooled values other than IDs are written as references; error messages appear only as normalized signatures; logs carry no app data; retention is 14 days for observations and 30 for the export (sections 5, 6, 8).
- **Baseline integrity (S4):** baseline runs are filtered by event, default branch, same repository, workflow and conclusion, and validated before use (section 5). Revision 2 keeps this filter and changes only what a `main` run's success means: it succeeds whenever Fram completes, findings or not. A fork PR still cannot produce a `push` run on the default branch. The Security Engineer confirmed this in [IGL-129](/IGL/issues/IGL-129) ([PR #18 review](https://github.com/valentinpalkovic/Igglo/pull/18#pullrequestreview-5729477731)). Occurrence keys add no new exposure class (same guess-confirmation as `outputHash`); R9–R13 from that review are applied in this revision, R14 is in IGL-49.
- **External network access (S5):** network containment is for determinism and to keep test runs away from real third parties, not an exfiltration boundary. HTTP and WebSockets are blocked by exact-origin allowlist, service workers are blocked, WebRTC is removed, and cross-origin redirects are detected and reported, not blocked (section 1). The wider question stays in [IGL-49](/IGL/issues/IGL-49).
- **Summary output (N1):** app strings are escaped in the job summary (section 8). Fram has no LLM, so prompt injection does not apply.
- **Partner code:** the config file and setup modules are the partner's own code, run in the partner's own CI, like `playwright.config.ts`. Fram does not run code from the app under test in Node (ADR-004). `crypto.getRandomValues` stays unseeded (N4).

## Changed in revision 2

The [QA review of PR #8](https://github.com/valentinpalkovic/Igglo/pull/8) (2/5, consolidated in [IGL-98](/IGL/issues/IGL-98)) found three contract defects after revision 1 was merged. Revision 1 decided:

- **Baseline:** `failOn` applied to every run, including `main`. Together with the S4 filter (`conclusion == "success"`), an app with any finding on `main` could never get a baseline. Now: `main` runs ignore `failOn` (sections 5 and 8). The S4 filter is unchanged.
- **Fixed:** a finding absent from the PR run was `fixed` unless its context was partial. A PR that stopped Fram from reaching the call got credit for a fix. Now: `fixed` needs every base occurrence re-executed, otherwise `not-checked` with a reason (section 5). The export gains `occurrences` and `notChecked` (section 6), a minor schema change before `1.0.0` ships.
- **Denials:** a denied call that threw was both an accepted denial and a `tool-threw` finding, with no precedence. Now: for calls a permission rule denies, the permission check decides, and timeouts and `isDenied` mismatches stay `tool-threw` (section 2).

From the review of revision 2 (Devin on PR #18, and the Security Engineer's R9–R13 in [IGL-129](/IGL/issues/IGL-129)), also in this revision:

- **Context identity** includes the contents of the `storageState` file and the setup module with its local imports, not only their paths. Before, a PR that changed the login behind an unchanged path could earn `fixed` for calls made as another user (section 5).
- **`fixed` also needs** an unchanged denial rule (`denialRule` in the export) and an occurrence list that was not cut. Occurrences are capped at 100 per finding, so a busy `main` export stays under the 5 MB baseline limit (sections 5 and 6).
- **Main mode** comes from the GitHub event context only (section 5). Context identity is never written on its own (section 5).

R14 (recommend `isDenied` to apps whose denials throw) belongs in the onboarding docs and is tracked in [IGL-49](/IGL/issues/IGL-49).

Acceptance requirements 10–13 are new (section 10). Nothing else changed: state, inputs, IDs, network containment and evidence rules are as in revision 1.

## Diagrams

- `docs/architecture/context.md`: added the baseline artifact from the `main` run, which the PR run downloads.
- `docs/architecture/fram-exploration.md` (new): the exploration loop of section 1 as a flowchart.
