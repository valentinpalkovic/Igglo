/**
 * Fram config for the Ledger acceptance test, in the shape of ADR-007
 * section 1. Plain data until fram-core exports its config type and
 * validation; the acceptance test passes this object to fram-core then.
 */
const ROLES = ["viewer", "member", "admin"] as const;
const WORKSPACES = ["alpha", "beta"] as const;

export const contexts = ROLES.flatMap((role) =>
  WORKSPACES.map((workspace) => ({
    name: `${role}@${workspace}`,
    tags: { role, workspace },
    setup: [
      { tool: "sign_in", input: { role } },
      ...(workspace === "alpha" ? [] : [{ tool: "switch_workspace", input: { workspace } }]),
    ],
  })),
);

export default {
  // The page is served statically; the query selects the build (see page.ts).
  app: { url: "http://localhost:4173/index.html" },
  contexts,
  readOnlyTools: ["list_expenses", "get_expense", "get_total"],
  permissions: [
    { when: { role: "viewer" }, deny: ["create_expense", "approve_expense", "delete_expense"] },
    { when: { role: "member" }, deny: ["approve_expense", "delete_expense"] },
  ],
  evidence: { raw: false },
};
