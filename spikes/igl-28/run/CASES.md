# Criteria recorded before implementation inspection

Protocol: adbe1ec6-8c1a-42b4-8ce5-3d208ccab6fe, sections 1–5 only.
Run clean and each of B1–B8 with declared and reversed enum order (18 runs).
For each finding, replay its path against fresh clean and seeded fixtures. Match the seeded defect by tool and causal path; clean findings are false positives. Record all unmatched findings.

| Bug | Reproduction criterion from acceptance contract |
| --- | --- |
| B1 | viewer approves real pending expense; expected FORBIDDEN and unchanged status |
| B2 | admin deletes real expense; expected subsequent NOT_FOUND |
| B3 | total in beta; expected 1400 EUR cents |
| B4 | beta then alpha; expected list contains alpha items |
| B5 | approve a1 then read a1; expected approved |
| B6 | admin approves real USD expense; expected success without throw |
| B7 | member/admin creates USD expense; expected tools remain available |
| B8 | unknown expense id; expected NOT_FOUND without throw |

For misses, inspect reached paths and generated inputs to distinguish A (no output oracle), B (state aliasing), C (no real entity references), D (enum tie-break). Multiple mechanisms may coexist; separate observed blocking conditions from hypothetical detection.
Validate fresh loads, schema-only inputs, breadth-first paths, single expansion per tool-name state, denial handling, finding replay, and byte-identical repeated output. Read protocol section 6 only after saving grading.
