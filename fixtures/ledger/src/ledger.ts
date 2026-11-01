/**
 * Ledger: the expense app from the IGL-28 spike, with seeded bugs B1–B8.
 * Behaviour of the clean build and of each bug is specified in EXPECTED.md.
 *
 * The app logic is independent of where tools are registered: the browser
 * page (page.ts) passes `document.modelContext`, the unit tests pass an
 * in-memory host. The app validates its own arguments, so the result does not
 * depend on the WebMCP implementation.
 */

export const BUGS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"] as const;
export type Bug = (typeof BUGS)[number];

export type EnumOrder = "declared" | "reversed";

/**
 * `uuid`: IDs are UUIDs, `get_expense` declares `format: "uuid"` and throws on
 * a malformed ID (ADR-007 acceptance requirement 7).
 */
export type Variant = "default" | "uuid";

export interface LedgerOptions {
  bug?: Bug;
  enumOrder?: EnumOrder;
  variant?: Variant;
}

type PropertySchema =
  { type: "string"; enum?: string[]; format?: "uuid" } | { type: "integer"; minimum: number };

export interface InputSchema {
  type: "object";
  properties: Record<string, PropertySchema>;
  required: string[];
  additionalProperties: false;
}

export type ErrorCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID_ARGUMENT" | "TOOL_NOT_FOUND";

export type ToolResult = { content: unknown } | { isError: true; content: { code: ErrorCode } };

export interface LedgerTool {
  name: string;
  description: string;
  inputSchema: InputSchema;
  execute: (args: Record<string, unknown>) => ToolResult;
}

/** Where the app registers its tools: `document.modelContext` or a test host. */
export interface ToolHost {
  registerTool(tool: LedgerTool): void;
  unregisterTool(name: string): void;
}

type Role = "viewer" | "member" | "admin";
type Workspace = "alpha" | "beta";
type Currency = "EUR" | "USD";

interface Expense {
  id: string;
  amount_cents: number;
  currency: Currency;
  note: string;
  status: "pending" | "approved";
}

const USD_TO_EUR = 0.9;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const ok = (content: unknown): ToolResult => ({ content: structuredClone(content) });
export const error = (code: ErrorCode): ToolResult => ({ isError: true, content: { code } });

/** Seed and created IDs: `a1` in the default variant, a UUID ending in `a1` in the uuid variant. */
export function expenseId(shortId: string, variant: Variant = "default"): string {
  return variant === "uuid" ? `00000000-0000-4000-8000-${shortId.padStart(12, "0")}` : shortId;
}

export function isBug(value: string): value is Bug {
  return (BUGS as readonly string[]).includes(value);
}

/** Starts Ledger signed out and registers its tools on `host`. */
export function startLedger(host: ToolHost, options: LedgerOptions = {}): void {
  const { bug, enumOrder = "declared", variant = "default" } = options;
  const has = (b: Bug) => bug === b;
  const id = (shortId: string) => expenseId(shortId, variant);
  const row = (
    shortId: string,
    amount_cents: number,
    currency: Currency,
    status: Expense["status"] = "pending",
  ): Expense => ({ id: id(shortId), amount_cents, currency, note: "", status });

  let store: Record<Workspace, Expense[]> | null = {
    alpha: [row("a1", 1200, "EUR"), row("a2", 3000, "EUR", "approved")],
    beta: [row("b1", 500, "EUR"), row("b2", 1000, "USD")],
  };
  let role: Role | null = null;
  let workspace: Workspace = "alpha";
  let listWorkspace: Workspace = "alpha";
  let nextId = 1;
  const stale = new Map<string, Expense>();
  const registered = new Set<string>();

  const rows = (ws: Workspace): Expense[] => {
    if (!store) throw new TypeError("Cannot read properties of null (reading 'alpha')");
    return store[ws];
  };
  const enumeration = (values: string[]): PropertySchema => ({
    type: "string",
    enum: enumOrder === "reversed" ? [...values].reverse() : values,
  });
  const idProperty: Record<string, PropertySchema> = {
    id: variant === "uuid" ? { type: "string", format: "uuid" } : { type: "string" },
  };

  type Execute = (args: Record<string, unknown>) => ToolResult;
  const definitions: [string, string, Record<string, PropertySchema>, Execute][] = [
    [
      "sign_in",
      "Sign in with a role.",
      { role: enumeration(["viewer", "member", "admin"]) },
      (args) => {
        role = args["role"] as Role;
        workspace = listWorkspace = "alpha";
        refresh();
        return ok({ ok: true });
      },
    ],
    ["list_expenses", "List expenses in the current workspace.", {}, () => ok(rows(listWorkspace))],
    [
      "get_expense",
      "Read an expense in the current workspace.",
      idProperty,
      (args) => {
        const wanted = args["id"] as string;
        if (variant === "uuid" && !UUID.test(wanted)) throw new TypeError("Malformed expense ID");
        const item = rows(workspace).find((e) => e.id === wanted);
        if (!item) {
          if (has("B8")) throw new TypeError("Cannot read unknown expense");
          return error("NOT_FOUND");
        }
        return ok(stale.get(wanted) ?? item);
      },
    ],
    [
      "create_expense",
      "Create a pending expense.",
      {
        amount_cents: { type: "integer", minimum: 1 },
        currency: enumeration(["EUR", "USD"]),
        note: { type: "string" },
      },
      (args) => {
        if (role === "viewer") return error("FORBIDDEN");
        const item: Expense = {
          ...row(`e${nextId++}`, args["amount_cents"] as number, args["currency"] as Currency),
          note: args["note"] as string,
        };
        rows(workspace).push(item);
        if (has("B7") && item.currency === "USD") {
          store = null;
          for (const name of [...registered]) unregister(name);
        }
        return ok(item);
      },
    ],
    [
      "approve_expense",
      "Approve an expense.",
      idProperty,
      (args) => {
        const wanted = args["id"] as string;
        const item = rows(workspace).find((e) => e.id === wanted);
        const viewerBypass = has("B1") && role === "viewer" && item?.status === "pending";
        if (role !== "admin" && !viewerBypass) return error("FORBIDDEN");
        if (!item) return error("NOT_FOUND");
        if (has("B6") && role === "admin" && item.currency === "USD") {
          throw new TypeError("Cannot approve USD expense");
        }
        if (has("B5") && wanted === id("a1") && !stale.has(wanted)) {
          stale.set(wanted, structuredClone(item));
        }
        item.status = "approved";
        return ok(item);
      },
    ],
    [
      "delete_expense",
      "Delete an expense.",
      idProperty,
      (args) => {
        if (role !== "admin") return error("FORBIDDEN");
        const wanted = args["id"] as string;
        const list = rows(workspace);
        const index = list.findIndex((e) => e.id === wanted);
        if (index < 0) return error("NOT_FOUND");
        if (!has("B2")) {
          list.splice(index, 1);
          stale.delete(wanted);
        }
        return ok({ ok: true });
      },
    ],
    [
      "get_total",
      "Total the current workspace in EUR cents.",
      {},
      () => {
        const skipConversion = has("B3") && workspace === "beta";
        const sum = rows(workspace).reduce(
          (total, e) =>
            total + e.amount_cents * (e.currency === "USD" && !skipConversion ? USD_TO_EUR : 1),
          0,
        );
        return ok({ amount_cents: Math.round(sum), currency: "EUR" });
      },
    ],
    [
      "switch_workspace",
      "Select the current workspace.",
      { workspace: enumeration(["alpha", "beta"]) },
      (args) => {
        const selected = args["workspace"] as Workspace;
        if (!(has("B4") && workspace === "beta" && selected === "alpha")) listWorkspace = selected;
        workspace = selected;
        return ok({ ok: true });
      },
    ],
    [
      "sign_out",
      "Sign out.",
      {},
      () => {
        role = null;
        refresh();
        return ok({ ok: true });
      },
    ],
  ];

  function unregister(name: string): void {
    registered.delete(name);
    host.unregisterTool(name);
  }

  function refresh(): void {
    for (const name of [...registered]) unregister(name);
    for (const [name, description, properties, execute] of definitions) {
      const signedOutTool = name === "sign_in";
      if ((role === null) !== signedOutTool) continue;
      const inputSchema: InputSchema = {
        type: "object",
        properties: structuredClone(properties),
        required: Object.keys(properties),
        additionalProperties: false,
      };
      registered.add(name);
      host.registerTool({
        name,
        description,
        inputSchema,
        execute: (args) => (isValid(properties, args) ? execute(args) : error("INVALID_ARGUMENT")),
      });
    }
  }

  refresh();
}

function isValid(
  properties: Record<string, PropertySchema>,
  args: unknown,
): args is Record<string, unknown> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return false;
  const record = args as Record<string, unknown>;
  if (Object.keys(record).some((key) => !Object.hasOwn(properties, key))) return false;
  return Object.entries(properties).every(([key, schema]) => {
    const value = record[key];
    if (schema.type === "integer") {
      return Number.isSafeInteger(value) && (value as number) >= schema.minimum;
    }
    return typeof value === "string" && (!schema.enum || schema.enum.includes(value));
  });
}
