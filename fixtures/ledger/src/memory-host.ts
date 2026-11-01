import { error, type LedgerTool, type ToolHost, type ToolResult } from "./ledger.js";

/** In-memory WebMCP host for unit tests of the fixture itself (not for Fram). */
export class MemoryHost implements ToolHost {
  readonly #tools = new Map<string, LedgerTool>();

  registerTool(tool: LedgerTool): void {
    this.#tools.set(tool.name, tool);
  }

  unregisterTool(name: string): void {
    this.#tools.delete(name);
  }

  /** Tool descriptors without `execute`, as copies. */
  listTools(): Omit<LedgerTool, "execute">[] {
    return [...this.#tools.values()].map(({ name, description, inputSchema }) =>
      structuredClone({ name, description, inputSchema }),
    );
  }

  names(): string[] {
    return [...this.#tools.keys()];
  }

  /** Resolves with the tool result; rejects if the tool throws. */
  callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const tool = this.#tools.get(name);
    if (!tool) return Promise.resolve(error("TOOL_NOT_FOUND"));
    return Promise.resolve(structuredClone(args)).then((copy) => tool.execute(copy));
  }
}
