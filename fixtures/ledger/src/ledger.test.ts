// The fixture's own contract (EXPECTED.md), ported from the IGL-28 self-check.
// These tests check Ledger itself, not Fram; Fram's acceptance spec is in
// acceptance.test.ts.
import { describe, expect, it } from "vitest";
import { BUGS, error, expenseId, startLedger, type Bug, type EnumOrder } from "./ledger.js";
import { MemoryHost } from "./memory-host.js";
import { optionsFromQuery } from "./page.js";

const ROLES = ["viewer", "member", "admin"] as const;
const ORDERS: EnumOrder[] = ["declared", "reversed"];
const SIGNED_IN = [
  "list_expenses",
  "get_expense",
  "create_expense",
  "approve_expense",
  "delete_expense",
  "get_total",
  "switch_workspace",
  "sign_out",
];
const SEED = {
  alpha: [
    { id: "a1", amount_cents: 1200, currency: "EUR", note: "", status: "pending" },
    { id: "a2", amount_cents: 3000, currency: "EUR", note: "", status: "approved" },
  ],
  beta: [
    { id: "b1", amount_cents: 500, currency: "EUR", note: "", status: "pending" },
    { id: "b2", amount_cents: 1000, currency: "USD", note: "", status: "pending" },
  ],
};
type Role = (typeof ROLES)[number];
type Workspace = keyof typeof SEED;

async function session(role: Role, workspace: Workspace, bug?: Bug, enumOrder?: EnumOrder) {
  const host = new MemoryHost();
  startLedger(host, { ...(bug && { bug }), ...(enumOrder && { enumOrder }) });
  expect(host.names()).toEqual(["sign_in"]);
  expect(await host.callTool("sign_in", { role })).toEqual({ content: { ok: true } });
  if (workspace === "beta") await host.callTool("switch_workspace", { workspace });
  expect(host.names()).toEqual(SIGNED_IN);
  return host;
}

/** `(await call(...)).content` for results known to succeed. */
async function content(host: MemoryHost, name: string, args?: Record<string, unknown>) {
  const result = await host.callTool(name, args);
  expect(result).not.toHaveProperty("isError");
  return result.content as Record<string, unknown> & Record<string, unknown>[];
}

describe("clean build: role × workspace × tool matrix", () => {
  for (const order of ORDERS)
    for (const role of ROLES)
      for (const workspace of ["alpha", "beta"] as const) {
        it(`${role}@${workspace}, ${order} enums`, async () => {
          const host = await session(role, workspace, undefined, order);
          const descriptors = host.listTools();
          const total = workspace === "alpha" ? 4200 : 1400;
          const first = SEED[workspace][0]!;
          const other: Workspace = workspace === "alpha" ? "beta" : "alpha";

          expect(await host.callTool("list_expenses")).toEqual({ content: SEED[workspace] });
          for (const row of SEED[workspace]) {
            expect(await host.callTool("get_expense", { id: row.id })).toEqual({ content: row });
          }
          expect(await host.callTool("get_total")).toEqual({
            content: { amount_cents: total, currency: "EUR" },
          });
          for (const missing of ["unknown", SEED[other][0]!.id]) {
            expect(await host.callTool("get_expense", { id: missing })).toEqual(error("NOT_FOUND"));
            for (const tool of ["approve_expense", "delete_expense"]) {
              expect(await host.callTool(tool, { id: missing })).toEqual(
                error(role === "admin" ? "NOT_FOUND" : "FORBIDDEN"),
              );
            }
          }

          // Returned rows and schemas are copies.
          (await content(host, "list_expenses"))[0]!["amount_cents"] = 0;
          (host.listTools()[0]!.inputSchema as { type: string }).type = "null";
          expect(await host.callTool("list_expenses")).toEqual({ content: SEED[workspace] });
          expect(host.listTools()).toEqual(descriptors);

          for (const currency of ["EUR", "USD"]) {
            const result = await host.callTool("create_expense", {
              amount_cents: 100,
              currency,
              note: "check",
            });
            if (role === "viewer") {
              expect(result).toEqual(error("FORBIDDEN"));
              expect(await host.callTool("list_expenses")).toEqual({ content: SEED[workspace] });
            } else {
              const id = currency === "EUR" ? "e1" : "e2";
              expect(result).toEqual({
                content: { id, amount_cents: 100, currency, note: "check", status: "pending" },
              });
              expect(await host.callTool("get_expense", { id })).toEqual(result);
            }
          }
          expect(await host.callTool("get_total")).toEqual({
            content: { amount_cents: total + (role === "viewer" ? 0 : 190), currency: "EUR" },
          });

          const before = await host.callTool("list_expenses");
          const approval = await host.callTool("approve_expense", { id: first.id });
          if (role !== "admin") {
            expect(approval).toEqual(error("FORBIDDEN"));
            expect(await host.callTool("delete_expense", { id: first.id })).toEqual(
              error("FORBIDDEN"),
            );
            expect(await host.callTool("list_expenses")).toEqual(before);
          } else {
            expect(approval).toEqual({ content: { ...first, status: "approved" } });
            expect(await host.callTool("get_expense", { id: first.id })).toEqual(approval);
            expect(await host.callTool("approve_expense", { id: first.id })).toEqual(approval);
            if (workspace === "beta") {
              expect((await content(host, "approve_expense", { id: "b2" }))["status"]).toBe(
                "approved",
              );
            }
            expect(await host.callTool("delete_expense", { id: first.id })).toEqual({
              content: { ok: true },
            });
            expect(await host.callTool("get_expense", { id: first.id })).toEqual(
              error("NOT_FOUND"),
            );
            expect(await host.callTool("get_total")).toEqual({
              content: { amount_cents: total + 190 - first.amount_cents, currency: "EUR" },
            });
          }

          const written = await host.callTool("list_expenses");
          await host.callTool("switch_workspace", { workspace: other });
          expect(await host.callTool("list_expenses")).toEqual({ content: SEED[other] });
          await host.callTool("switch_workspace", { workspace });
          expect(await host.callTool("list_expenses")).toEqual(written);
          expect(host.listTools()).toEqual(descriptors);

          expect(await host.callTool("sign_out")).toEqual({ content: { ok: true } });
          expect(host.names()).toEqual(["sign_in"]);
          expect(await host.callTool("get_total")).toEqual(error("TOOL_NOT_FOUND"));
          await host.callTool("sign_in", { role });
          expect(await host.callTool("list_expenses")).toEqual(
            workspace === "alpha" ? written : { content: SEED.alpha },
          );
        });
      }
});

/** Runs the bug's witness steps and returns the observation (EXPECTED.md, "Seeded-defect witnesses"). */
async function witness(bug: Bug, enabled: boolean, order: EnumOrder, role: Role) {
  const host = await session(role, "alpha", enabled ? bug : undefined, order);
  const call = (name: string, args?: Record<string, unknown>) => host.callTool(name, args);
  switch (bug) {
    case "B1":
      await call("approve_expense", { id: "a1" });
      return (await content(host, "get_expense", { id: "a1" }))["status"];
    case "B2":
      await call("delete_expense", { id: "a1" });
      return (await content(host, "list_expenses")).map((row) => row["id"]);
    case "B3":
      await call("switch_workspace", { workspace: "beta" });
      return (await content(host, "get_total"))["amount_cents"];
    case "B4":
      await call("switch_workspace", { workspace: "beta" });
      await call("switch_workspace", { workspace: "alpha" });
      return (await content(host, "list_expenses")).map((row) => row["id"]);
    case "B5":
      await call("approve_expense", { id: "a1" });
      return (await content(host, "get_expense", { id: "a1" }))["status"];
    case "B6":
      await call("switch_workspace", { workspace: "beta" });
      return call("approve_expense", { id: "b2" }).then(
        (r) => (r.content as Record<string, unknown>)["status"],
        (e: unknown) => (e instanceof TypeError ? "TypeError" : e),
      );
    case "B7":
      await call("create_expense", { amount_cents: 100, currency: "USD", note: "" });
      return host.names().length;
    case "B8":
      return call("get_expense", { id: "unknown" }).then(
        (r) => r,
        (e: unknown) => (e instanceof TypeError ? "TypeError" : e),
      );
  }
}

const WITNESSES: Record<Bug, { roles: readonly Role[]; clean: unknown; faulty: unknown }> = {
  B1: { roles: ["viewer"], clean: "pending", faulty: "approved" },
  B2: { roles: ["admin"], clean: ["a2"], faulty: ["a1", "a2"] },
  B3: { roles: ROLES, clean: 1400, faulty: 1500 },
  B4: { roles: ROLES, clean: ["a1", "a2"], faulty: ["b1", "b2"] },
  B5: { roles: ["admin"], clean: "approved", faulty: "pending" },
  B6: { roles: ["admin"], clean: "approved", faulty: "TypeError" },
  B7: { roles: ["member", "admin"], clean: 8, faulty: 0 },
  B8: { roles: ROLES, clean: error("NOT_FOUND"), faulty: "TypeError" },
};

describe("seeded-defect witnesses", () => {
  for (const bug of BUGS)
    for (const role of WITNESSES[bug].roles)
      for (const order of ORDERS) {
        it(`${bug} as ${role}, ${order} enums`, async () => {
          expect(await witness(bug, false, order, role)).toEqual(WITNESSES[bug].clean);
          expect(await witness(bug, true, order, role)).toEqual(WITNESSES[bug].faulty);
        });
      }

  it("B1–B6 and B8 keep the signed-in tool descriptors", async () => {
    const clean = (await session("admin", "alpha")).listTools();
    for (const bug of BUGS.filter((b) => b !== "B7")) {
      expect((await session("admin", "alpha", bug)).listTools()).toEqual(clean);
    }
  });
});

describe("enum order", () => {
  function reverseEnums(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(reverseEnums);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        key === "enum" ? [...(v as unknown[])].reverse() : reverseEnums(v),
      ]),
    );
  }

  it("reverses every enum and changes nothing else", async () => {
    for (const signedIn of [false, true]) {
      const declared = new MemoryHost();
      const reversed = new MemoryHost();
      startLedger(declared);
      startLedger(reversed, { enumOrder: "reversed" });
      if (signedIn) {
        await declared.callTool("sign_in", { role: "admin" });
        await reversed.callTool("sign_in", { role: "admin" });
      }
      expect(reversed.listTools()).toEqual(reverseEnums(declared.listTools()));
    }
  });
});

describe("argument validation and fresh loads", () => {
  it("rejects invalid arguments without a throw", async () => {
    const host = await session("admin", "alpha");
    for (const amount_cents of [0, -1, 1.5, "1"]) {
      expect(
        await host.callTool("create_expense", { amount_cents, currency: "EUR", note: "" }),
      ).toEqual(error("INVALID_ARGUMENT"));
    }
    expect(
      await host.callTool("create_expense", { amount_cents: 1, currency: "GBP", note: "" }),
    ).toEqual(error("INVALID_ARGUMENT"));
    expect(await host.callTool("switch_workspace", { workspace: "unknown" })).toEqual(
      error("INVALID_ARGUMENT"),
    );
    expect(await host.callTool("get_expense", { id: "a1", extra: 1 })).toEqual(
      error("INVALID_ARGUMENT"),
    );
  });

  it("restores seed data and the ID sequence on a fresh load", async () => {
    const host = await session("admin", "alpha");
    expect(
      (await content(host, "create_expense", { amount_cents: 1, currency: "EUR", note: "" }))["id"],
    ).toBe("e1");
    for (const row of await content(host, "list_expenses")) {
      await host.callTool("delete_expense", { id: row["id"] });
    }
    expect(await host.callTool("list_expenses")).toEqual({ content: [] });
    expect(await host.callTool("get_total")).toEqual({
      content: { amount_cents: 0, currency: "EUR" },
    });
    expect(await (await session("admin", "alpha")).callTool("list_expenses")).toEqual({
      content: SEED.alpha,
    });
  });
});

describe("uuid variant (acceptance requirement 7)", () => {
  it("uses UUID IDs, declares format uuid and throws on a malformed ID", async () => {
    const host = new MemoryHost();
    startLedger(host, { variant: "uuid" });
    await host.callTool("sign_in", { role: "admin" });
    const getExpense = host.listTools().find((t) => t.name === "get_expense")!;
    expect(getExpense.inputSchema.properties["id"]).toEqual({ type: "string", format: "uuid" });
    const a1 = expenseId("a1", "uuid");
    expect(a1).toBe("00000000-0000-4000-8000-0000000000a1");
    expect((await content(host, "list_expenses")).map((r) => r["id"])).toEqual([
      a1,
      expenseId("a2", "uuid"),
    ]);
    expect((await content(host, "get_expense", { id: a1 }))["id"]).toBe(a1);
    expect(
      await host.callTool("get_expense", { id: "00000000-0000-4000-8000-000000000000" }),
    ).toEqual(error("NOT_FOUND"));
    await expect(host.callTool("get_expense", { id: "x" })).rejects.toThrow(TypeError);
  });
});

describe("page query", () => {
  it("parses bug, enum order and variant", () => {
    expect(optionsFromQuery("")).toEqual({});
    expect(optionsFromQuery("?bug=B7&enumOrder=reversed&variant=uuid")).toEqual({
      bug: "B7",
      enumOrder: "reversed",
      variant: "uuid",
    });
  });

  it("fails on unknown values instead of loading a clean build", () => {
    expect(() => optionsFromQuery("?bug=B9")).toThrow(TypeError);
    expect(() => optionsFromQuery("?bug=b1")).toThrow(TypeError);
    expect(() => optionsFromQuery("?enumOrder=random")).toThrow(TypeError);
    expect(() => optionsFromQuery("?variant=ulid")).toThrow(TypeError);
  });

  it("fails on a repeated key instead of picking one build", () => {
    expect(() => optionsFromQuery("?bug=B1&bug=B2")).toThrow(TypeError);
    expect(() => optionsFromQuery("?bug=B1&bug=B1")).toThrow(TypeError);
    expect(() => optionsFromQuery("?enumOrder=declared&enumOrder=reversed")).toThrow(TypeError);
  });
});
