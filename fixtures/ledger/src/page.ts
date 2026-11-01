/**
 * Browser entry of the Ledger fixture. Registers the tools on
 * `document.modelContext`, which Fram provides by injecting the page side of
 * the WebMCP adapter (ADR-004). Fixtures are apps under test, so they use
 * `modelContext` directly, as real apps do.
 *
 * Query parameters: `bug=B1`…`B8`, `enumOrder=declared|reversed`,
 * `variant=default|uuid`. Unknown values fail loudly, so a typo cannot turn a
 * bug build into a clean build.
 */
import { isBug, startLedger, type LedgerOptions, type ToolHost } from "./ledger.js";

export function optionsFromQuery(query: string): LedgerOptions {
  const params = new URLSearchParams(query);
  const options: LedgerOptions = {};
  const bug = params.get("bug");
  if (bug !== null) {
    if (!isBug(bug)) throw new TypeError(`Unknown bug "${bug}"; use B1–B8`);
    options.bug = bug;
  }
  const enumOrder = params.get("enumOrder");
  if (enumOrder !== null) {
    if (enumOrder !== "declared" && enumOrder !== "reversed") {
      throw new TypeError(`Unknown enumOrder "${enumOrder}"`);
    }
    options.enumOrder = enumOrder;
  }
  const variant = params.get("variant");
  if (variant !== null) {
    if (variant !== "default" && variant !== "uuid") {
      throw new TypeError(`Unknown variant "${variant}"`);
    }
    options.variant = variant;
  }
  return options;
}

declare global {
  interface Document {
    modelContext?: ToolHost;
  }
}

if (typeof document !== "undefined") {
  const host = document.modelContext;
  if (!host) throw new Error("document.modelContext is missing: load Ledger through Fram");
  startLedger(host, optionsFromQuery(location.search));
}
