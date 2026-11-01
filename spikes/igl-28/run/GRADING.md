# Ledger blind-spike grading

**Accepted under protocol rev 2 (`37dbd04e-534c-4ed6-bca2-05d31604e68c`) by Head of Tech:** [acceptance decision](/IGL/issues/IGL-35#comment-1669fc73-d7cc-41ce-8714-733bde01955d). The gate was written after the run, but evidence that predates the run met it: `self-check.mjs` in fixture commit `73f5567` exercised the independent clean/seeded witnesses before execution. The 18 runs in `6959fc0` are the run of record; no replacement experiment is required. QA read section 6 after saving the grading, but git history cannot verify that ordering because grading and runs are in one commit. The mechanism letters are QA's analysis. The protocol amendment and this acceptance do not change the original execution revision recorded below.

Protocol revision: **adbe1ec6-8c1a-42b4-8ce5-3d208ccab6fe** (current at start, 2026-10-31).
Fixture/explorer source commit: `8ae8db4` (fixture introduced in `73f5567`).
Scope: Node built-ins only, in-process fixture, no browser, no dependencies. Spike and fixture were not modified. QA criteria were saved in CASES.md before implementation inspection. Sections 1–5 were read before running; the initial grading below was saved before reading section 6.

## Results

3 found / 16 seeded runs; 13 misses; zero findings in either clean control, zero unmatched findings. These are fixture results, not a coverage estimate for real applications.

Path notation: `sign_in(viewer)` means `{tool:"sign_in",input:{role:"viewer"}}`, likewise for admin. `get_expense(x)` uses `{id:"x"}`. `create_USD` uses `{amount_cents:1,currency:"USD",note:"x"}`. Full structured paths and all raw states/edges/findings are in results.json.

Mechanisms: A = no output oracle; B = state aliasing; C = no real entity IDs; D = enum tie-break. Trigger barriers describe the recorded exploration; detection barriers describe the independent triggered witnesses under protocol 5.1. Multiple trigger letters identify coexisting barriers, not counts. Witness references below cite exact self-check output lines and their source assertions.

| Bug | Enum order | Grade | Matched finding: type / tool / path | Trigger barrier | Detection barrier if triggered | False positives |
| --- | --- | --- | --- | --- | --- | --- |
| clean | declared | clean control | none | — | — | 0 |
| clean | reversed | clean control | none | — | — | 0 |
| B1 | declared | missed | none | C | A — no rejection/page error; same 8 tools ([B1 witness](#seed-witness-evidence)) | 0 |
| B1 | reversed | missed | none | B, C | A — no rejection/page error; same 8 tools ([B1 witness](#seed-witness-evidence)) | 0 |
| B2 | declared | missed | none | B, C | A — no rejection/page error; same 8 tools ([B2 witness](#seed-witness-evidence)) | 0 |
| B2 | reversed | missed | none | C, B | A — no rejection/page error; same 8 tools ([B2 witness](#seed-witness-evidence)) | 0 |
| B3 | declared | missed | none | B | A — no rejection/page error; same 8 tools ([B3 witness](#seed-witness-evidence)) | 0 |
| B3 | reversed | missed | none | B | A — no rejection/page error; same 8 tools ([B3 witness](#seed-witness-evidence)) | 0 |
| B4 | declared | missed | none | B | A — no rejection/page error; same 8 tools ([B4 witness](#seed-witness-evidence)) | 0 |
| B4 | reversed | missed | none | B | A — no rejection/page error; same 8 tools ([B4 witness](#seed-witness-evidence)) | 0 |
| B5 | declared | missed | none | B, C | A — no rejection/page error; same 8 tools ([B5 witness](#seed-witness-evidence)) | 0 |
| B5 | reversed | missed | none | C, B | A — no rejection/page error; same 8 tools ([B5 witness](#seed-witness-evidence)) | 0 |
| B6 | declared | missed | none | B, C | None — TypeError would fire 4(a) ([B6 witness](#seed-witness-evidence)) | 0 |
| B6 | reversed | missed | none | B, C | None — TypeError would fire 4(a) ([B6 witness](#seed-witness-evidence)) | 0 |
| B7 | declared | missed | none | B, D | None — zero tools would fire 4(c) ([B7 witness](#seed-witness-evidence)) | 0 |
| B7 | reversed | found | dead_end / create_expense / sign_in(admin) → create_USD | — | — | 0 |
| B8 | declared | found | tool_threw / get_expense / sign_in(viewer) → get_expense(x) | — | — | 0 |
| B8 | reversed | found | tool_threw / get_expense / sign_in(admin) → get_expense(x) | — | — | 0 |

## Why the misses happened

Every run has 13 edges: three sign-ins from the initial state and ten calls from the one signed-in representative. All three sign-ins reach S1. Declared order expands S1 as viewer/alpha; reversed expands it as admin/alpha. Workspace switches and successful writes return to S1 and never get a follow-up expansion. Each edge starts fresh, so calls do not accumulate mutations. No explored path calls a tool in beta or reads after a write. Every ID argument is `x`; no generated call references a seeded or created entity.

- **B1:** Declared does attempt viewer approval, but only on unknown `x`, yielding FORBIDDEN. Reversed additionally never expands the viewer state. Even if triggered with a real pending ID, silent success would need an output/permission oracle (A); that is a limitation, not a claim that this run triggered the bug.
- **B2:** Declared never expands admin. Reversed attempts admin deletion only on `x`, yielding NOT_FOUND. No post-delete read is explored because writes would preserve the signed-in state (B); there is also no output oracle (A).
- **B3:** Switch-to-beta is called, but its resulting state aliases alpha. The only total queried is alpha's 4200, never beta's incorrect 1500. B prevents exposure; A would prevent detection of the wrong numeric result even if reached.
- **B4:** No beta → alpha → list sequence is executed: each switch begins in fresh alpha. B prevents the trigger and subsequent read; A cannot check tenant contents.
- **B5:** Declared expands viewer, and both orders supply only `x`. No real approval occurs; no later read follows an approval. C and B prevent the defect, and A lacks a stale-read check.
- **B6:** The real USD ID `b2` is never generated, and beta is never expanded; declared also excludes admin expansion. C and B hide the throw. A is not a barrier here: a reached throw is an existing oracle.
- **B7:** Declared executes both currencies only as viewer; each call returns FORBIDDEN. Member/admin sign-ins alias the viewer state. Reversing enum order selects admin, and USD creation reaches empty S2. Thus D demonstrably changes found/missed through B. Currency order also reverses but both currencies are tried in separate fresh instances, so it does not explain detection.
- **B8:** Unknown `x` triggers the seeded TypeError in both representative roles. Clean replay returns NOT_FOUND without throwing. This is a direct match.

## Seed witness evidence

Rechecked on 2026-11-01 with `node spikes/igl-28/fixture/self-check.mjs`: **820 comparisons passed**. These are the existing validity-gate witnesses, not replacement spike runs. Each printed line summarizes clean and single-flag observations verified equal across both enum orders ([source lines 126–136](../fixture/self-check.mjs#L126)). Selected exact output lines:

```text
B1 viewer: {"clean":"pending","faulty":"approved"}
B2 admin: {"clean":["a2"],"faulty":["a1","a2"]}
B3 viewer: {"clean":1400,"faulty":1500}
B4 viewer: {"clean":[{"id":"a1","amount_cents":1200,"currency":"EUR","note":"","status":"pending"},{"id":"a2","amount_cents":3000,"currency":"EUR","note":"","status":"approved"}],"faulty":[{"id":"b1","amount_cents":500,"currency":"EUR","note":"","status":"pending"},{"id":"b2","amount_cents":1000,"currency":"USD","note":"","status":"pending"}]}
B5 admin: {"clean":"approved","faulty":"pending"}
B6 admin: {"clean":"approved","faulty":"TypeError"}
B7 member: {"clean":8,"faulty":0}
B7 admin: {"clean":8,"faulty":0}
```

B1–B5's triggered calls resolve normally ([source lines 89–108](../fixture/self-check.mjs#L89)); the witness asserts unchanged descriptors and no page errors ([lines 122–123](../fixture/self-check.mjs#L122)), with the signed-in eight-tool set asserted in [lines 5–24](../fixture/self-check.mjs#L5). Thus none of finding types 4(a)–(c) can fire on these triggered traces: A is independently demonstrated as their detection barrier. B3 and B4 give the same observations for member and admin too.

B6's admin/beta `approve_expense(b2)` witness explicitly rejects with TypeError ([lines 109–113](../fixture/self-check.mjs#L109)); this would fire 4(a), so A is not its barrier. B7's member/admin USD creation witness leaves zero tools ([lines 114–116](../fixture/self-check.mjs#L114)); this would fire 4(c), so A is not its barrier either. These witness traces were never supplied to the explorer.

## Verification and deviations

- `node spikes/igl-28/fixture/self-check.mjs`: 820 behavioral comparisons passed, including clean role/workspace matrix and clean-versus-seeded witnesses for every defect in both enum orders. This establishes the defects exist independently of what the spike reaches.
- `node --test spikes/igl-28/fram-core/dev/explore.test.mjs`: 4 tests passed.
- `node spikes/igl-28/run/run.mjs`: all 18 outputs reproduced byte for byte within the harness. Fresh-load call traces matched every source path plus its single edge; each tool-name state is unique. All three finding paths were replayed against fresh seeded and clean fixtures, reproducing the seeded error/dead end and no corresponding clean failure. See validation.json for observations and source SHA-256 hashes.
- `node spikes/igl-28/run/run.mjs --check` regenerates and compares both committed JSON artifacts without overwriting them.
- Every run has two states except B7/reversed (three). All 18 have 13 edges. No page-error findings or unrelated findings appeared.
- No observed spike deviation from sections 2–5 for this fixture. The CLI has no bug-flag option, so the harness calls the exported explorer with a load closure that injects exactly one flag. It supplies no fixture data or expected outcomes to the explorer. The README's finite asynchronous-error observation window and schema interpretations did not affect these fixtures, which emit no independent page errors and use only the specified schema types.
- The blind construction claim belongs to the explorer's implementation history; this QA run does not independently prove what its author previously read. The grader deliberately knows the seeds, as required for matching and mechanisms.

## Interpretation

The five silent wrong-result defects were all missed in both orders. However, these executions never exercised their failing behavior: aliasing and/or synthetic IDs blocked it first. Therefore the spike misses cannot isolate lack of an output oracle as their sole cause. Separately, the triggered gate witnesses demonstrate A for B1–B5: their incorrect outputs produce none of the supported finding signals. B6 also went undetected despite having a supported throw oracle. B7's outcome changed solely with representative selection induced by enum order. B8 confirms a reachable supported failure is detected.

## Prediction comparison (read after grading)

All 18 outcomes match section 6. No unexpected findings or outcome reversals occurred. Mechanism detail differs: B1/declared does reach the relevant viewer role, so C is the immediate trigger barrier rather than role aliasing; B2 and B5 also lack post-write expansion, and their declared runs never expand admin. These observations refine the predicted mechanism lists without changing the grades.
