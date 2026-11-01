# Ledger expected behaviour

Ledger is the expense app from the IGL-28 spike ([result](/IGL/issues/IGL-28#document-result)), ported for Fram's acceptance test ([ADR-007](../../docs/architecture/adr/007-fram-mvp.md), section 10). This file specifies the **app**: the clean build and each seeded bug. What **Fram** must report on it is in `src/expected.ts`.

`src/ledger.test.ts` checks every statement here (`pnpm --filter @iglo/fixture-ledger test`).

**Builds.** The page (`index.html`) reads its build from the query: `bug=B1`…`B8` (at most one), `enumOrder=declared|reversed`, `variant=default|uuid|hide-b2|throw-denial`. An unknown value throws, so a typo cannot load the clean build. Tools are registered on `document.modelContext`, which Fram provides through the adapter (ADR-004).

Each table cell starts from a fresh load, signs in as its role, and selects its workspace.
All successful results are `{ content: value }`. Errors are exactly
`{ isError: true, content: { code: "FORBIDDEN" | "NOT_FOUND" } }`, with no throw.
Permission checks precede ID lookup. IDs are scoped to the current workspace.

Signed out: only `sign_in` is registered. Each of viewer/member/admin signs in
successfully and starts in alpha. Signed in: exactly list_expenses, get_expense,
create_expense, approve_expense, delete_expense, get_total, switch_workspace,
sign_out, regardless of role, workspace, or dataset.

Seed rows have fields id, amount_cents, currency, note (empty), status:
alpha: a1 / 1200 / EUR / pending; a2 / 3000 / EUR / approved.
beta: b1 / 500 / EUR / pending; b2 / 1000 / USD / pending.
List returns these rows in insertion order. Get returns one row.

| Role   | Workspace | list_expenses          | get_expense                                    | create_expense                             | approve_expense                   | delete_expense                              | get_total                        | switch_workspace     | sign_out                 |
| ------ | --------- | ---------------------- | ---------------------------------------------- | ------------------------------------------ | --------------------------------- | ------------------------------------------- | -------------------------------- | -------------------- | ------------------------ |
| viewer | alpha     | [a1,a2] full seed rows | each seed row; unknown/other tenant: NOT_FOUND | FORBIDDEN; no change                       | FORBIDDEN; no change              | FORBIDDEN; no change                        | {amount_cents:4200,currency:EUR} | ok; reads show beta  | ok; only sign_in remains |
| viewer | beta      | [b1,b2] full seed rows | each seed row; unknown/other tenant: NOT_FOUND | FORBIDDEN; no change                       | FORBIDDEN; no change              | FORBIDDEN; no change                        | {amount_cents:1400,currency:EUR} | ok; reads show alpha | ok; only sign_in remains |
| member | alpha     | [a1,a2] full seed rows | each seed row; unknown/other tenant: NOT_FOUND | new pending row; visible in list/get/total | FORBIDDEN; no change              | FORBIDDEN; no change                        | {amount_cents:4200,currency:EUR} | ok; reads show beta  | ok; only sign_in remains |
| member | beta      | [b1,b2] full seed rows | each seed row; unknown/other tenant: NOT_FOUND | new pending row; visible in list/get/total | FORBIDDEN; no change              | FORBIDDEN; no change                        | {amount_cents:1400,currency:EUR} | ok; reads show alpha | ok; only sign_in remains |
| admin  | alpha     | [a1,a2] full seed rows | each seed row; unknown/other tenant: NOT_FOUND | new pending row; visible in list/get/total | approved row; visible in list/get | ok; removed from list/total; get: NOT_FOUND | {amount_cents:4200,currency:EUR} | ok; reads show beta  | ok; only sign_in remains |
| admin  | beta      | [b1,b2] full seed rows | each seed row; unknown/other tenant: NOT_FOUND | new pending row; visible in list/get/total | approved row; visible in list/get | ok; removed from list/total; get: NOT_FOUND | {amount_cents:1400,currency:EUR} | ok; reads show alpha | ok; only sign_in remains |

Create accepts EUR and USD, integer cents >= 1, and any string note. It returns
the created row. IDs are deterministic `e1`, `e2`, ... per load; status is pending.
Approve returns the approved row (including already-approved rows). Delete,
switch, sign_in and sign_out return `{ok:true}`. Admin approve/delete of an unknown
or other-workspace ID returns NOT_FOUND. Forbidden mutations never change data.
Successful creation and deletion update totals; USD converts at 0.90, with the
workspace sum rounded to the nearest cent. All seed and test amounts convert exactly.
Switch beta → alpha must restore alpha reads; sign-out/re-sign-in resets the current
workspace to alpha but preserves writes. Fresh load restores seed data and ID sequence.
No wall clock or randomness is used (the clock is fixed by having no time-dependent fields).
Ledger validates its own arguments: invalid ones return INVALID_ARGUMENT. Unavailable tools return TOOL_NOT_FOUND (in the test host).
Returned rows and schemas are copies, so callers cannot mutate the app through them.

Every enum is reversed with enumOrder=reversed, with identical execution outcomes.
A throwing tool rejects the call. Ledger has no background work and no uncaught
page errors, so a `page-error` finding on any build is a Fram bug.

## Seeded-defect witnesses

Each witness runs on a fresh app with only the named flag, and also runs clean.
B1–B6 and B8 retain the complete signed-in tool descriptors; only B7 empties them.

| Flag | Steps                        | Clean observation   | Flag observation                     |
| ---- | ---------------------------- | ------------------- | ------------------------------------ |
| B1   | viewer; approve a1; get a1   | FORBIDDEN; pending  | success; approved                    |
| B2   | admin; delete a1; get/list   | NOT_FOUND; absent   | ok; a1 remains                       |
| B3   | any role; switch beta; total | 1400 EUR cents      | 1500 EUR cents                       |
| B4   | any role; beta → alpha; list | a1,a2               | b1,b2                                |
| B5   | admin; approve a1; get a1    | approved            | pending                              |
| B6   | admin; beta; approve b2      | approved; no throw  | TypeError rejection                  |
| B7   | member/admin; create USD     | created; same tools | created; store corrupted; zero tools |
| B8   | any role; get unknown        | NOT_FOUND result    | TypeError rejection                  |

The self-check compares observable outcomes, including writes after denials, stale
reads, tenant boundaries, and error channels. It imports no spike or run harness.

## uuid variant (acceptance requirement 7)

`variant=uuid` changes only IDs: seed and created IDs are UUIDs ending in the short ID
(`a1` becomes `00000000-0000-4000-8000-0000000000a1`), and `get_expense` declares
`id: { type: "string", format: "uuid" }` and **throws** on a malformed ID. A Fram that
generates an input its schema rejects (for example `"x"`) reports a false `tool-threw`
here. A well-formed unknown UUID returns NOT_FOUND.

## hide-b2 variant (acceptance requirement 10a)

`variant=hide-b2` changes only `list_expenses`: it never returns `b2`. The expense still
exists, and with `bug=B6` an admin approve of `b2` in beta still throws. Fram can no longer
pool `b2`, so it never calls `approve_expense("b2")`. Compared with a B6 base, B6 must be
`not-checked` (reason `call-not-made`), never `fixed`.

## throw-denial variant (acceptance requirement 11)

`variant=throw-denial` changes only how denials look: every FORBIDDEN result becomes a
thrown `ForbiddenError` (message `Forbidden`). The clean build is still correct, so Fram
must report 0 findings: a throw on a call that a permission rule denies is a denial, not
`tool-threw`. Other errors are unchanged (for example NOT_FOUND stays an `isError` result).

## Transient IDs (acceptance requirement 6)

The clean build already covers this: `create_expense` returns a new ID (`e1`, `e2`, …)
that exists only until the next fresh load. If Fram passes such an ID to a tool in a
later edge, the tool returns NOT_FOUND or FORBIDDEN, never a throw, so the requirement
is checked on Fram's inputs (no `e*` ID outside the edge that created it), not on findings.
