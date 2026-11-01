// Fram's acceptance test on Ledger (ADR-007, section 10).
//
// Pending until fram-core implements ADR-007: each requirement is an
// `it.todo` now and becomes a real test in the fram-core implementation work.
// That work is only done when every test here passes. Do not delete a todo to
// make the suite green.
import { describe, expect, it } from "vitest";
import { EXPECTED, REQUIREMENTS } from "./expected.js";
import config, { contexts } from "./fram.config.js";
import { BUGS } from "./ledger.js";

describe("Ledger acceptance spec (ADR-007, section 10)", () => {
  it("covers every seeded bug", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...BUGS]);
  });

  it("predicts 4 of 8 in baseline mode and 8 of 8 in PR mode", () => {
    const rows = Object.values(EXPECTED);
    expect(rows.filter((r) => r.baseline.kind === "finding")).toHaveLength(4);
    expect(rows.filter((r) => r.pr.kind === "finding")).toHaveLength(4);
    expect(rows.filter((r) => r.pr.kind === "change")).toHaveLength(4);
    expect(rows.filter((r) => r.pr.kind === "nothing")).toHaveLength(0);
  });

  it("declares the 6 role × workspace contexts and 3 read-only tools", () => {
    expect(contexts.map((c) => c.name)).toEqual([
      "viewer@alpha",
      "viewer@beta",
      "member@alpha",
      "member@beta",
      "admin@alpha",
      "admin@beta",
    ]);
    expect(config.readOnlyTools).toEqual(["list_expenses", "get_expense", "get_total"]);
  });
});

describe("Fram on Ledger (pending fram-core)", () => {
  for (const requirement of REQUIREMENTS) it.todo(requirement);
  for (const bug of BUGS) {
    it.todo(`${bug} baseline mode, both enum orders: ${EXPECTED[bug].baseline.kind}`);
    it.todo(`${bug} PR mode, both enum orders: ${EXPECTED[bug].pr.kind}`);
  }
});
