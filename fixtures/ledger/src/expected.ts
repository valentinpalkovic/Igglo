/**
 * Expected Fram results on Ledger: the table in ADR-007, section 10.
 * Encoded as data so the acceptance test and the spec cannot drift apart.
 * A change to this table needs a superseding ADR, not a test edit.
 */
import type { Bug } from "./ledger.js";

export type FindingType = "permission-violation" | "tool-threw" | "dead-end";

/** What Fram must report for one build. */
export type Outcome =
  | { kind: "finding"; type: FindingType; tool: string; context?: string }
  | { kind: "change"; tools: string[]; contexts?: string }
  | { kind: "nothing" };

export interface ExpectedRow {
  defect: string;
  /** The bug is already on `main`: Fram runs on the bug build alone. */
  baseline: Outcome;
  /** The PR introduces the bug: base = clean build, head = bug build. */
  pr: Outcome;
}

export const EXPECTED: Record<Bug, ExpectedRow> = {
  B1: {
    defect: "Viewer can approve a pending expense",
    baseline: { kind: "finding", type: "permission-violation", tool: "approve_expense" },
    pr: { kind: "finding", type: "permission-violation", tool: "approve_expense" },
  },
  B2: {
    defect: "Admin delete returns ok, item stays",
    baseline: { kind: "nothing" },
    pr: { kind: "change", tools: ["get_expense", "list_expenses"] },
  },
  B3: {
    defect: "get_total in beta skips conversion",
    baseline: { kind: "nothing" },
    pr: { kind: "change", tools: ["get_total"], contexts: "*@beta" },
  },
  B4: {
    defect: "After beta → alpha, list shows beta",
    baseline: { kind: "nothing" },
    pr: { kind: "change", tools: ["list_expenses"], contexts: "*@beta" },
  },
  B5: {
    defect: "Read after approve is stale",
    baseline: { kind: "nothing" },
    pr: { kind: "change", tools: ["get_expense"], contexts: "admin@alpha" },
  },
  B6: {
    defect: "Admin approve of USD throws",
    baseline: {
      kind: "finding",
      type: "tool-threw",
      tool: "approve_expense",
      context: "admin@beta",
    },
    pr: { kind: "finding", type: "tool-threw", tool: "approve_expense", context: "admin@beta" },
  },
  B7: {
    defect: "Member/admin USD create removes all tools",
    baseline: { kind: "finding", type: "dead-end", tool: "create_expense" },
    pr: { kind: "finding", type: "dead-end", tool: "create_expense" },
  },
  B8: {
    defect: "Unknown ID makes get_expense throw",
    baseline: { kind: "finding", type: "tool-threw", tool: "get_expense" },
    pr: { kind: "finding", type: "tool-threw", tool: "get_expense" },
  },
};

/** Hard requirements 1–9 of ADR-007, section 10. All must hold. */
export const REQUIREMENTS = [
  "1. clean build: 0 findings; clean vs clean: 0 changes",
  "2. declared and reversed enum order: identical finding IDs and changes; clean declared vs clean reversed: 0 new, 0 fixed, 0 changes",
  "3. each finding's path reproduces on a fresh load of its build and not on the clean build",
  "4. the same build twice: byte-identical findings and changes",
  "5. bug build as base, clean as head: every found bug is reported fixed",
  "6. transient IDs: an ID created by create_expense in one edge is never used in another; clean build gives 0 findings",
  "7. uuid variant: schema-valid inputs only; clean build gives 0 findings",
  "8. evidence.raw false: no setup input, non-ID pooled value or raw error message in fram-run, fram-observations, job summary or stdout",
  "9. network containment: service-worker fetch, WebSocket and direct request to a blocked origin are blocked; cross-origin redirect is detected and counted; WebRTC is unavailable",
] as const;
