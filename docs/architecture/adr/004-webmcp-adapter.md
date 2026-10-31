# ADR-004: WebMCP adapter

Status: proposed
Date: 2026-10-31
Owner: Architekt
Approver: Head of Tech
Issue: [IGL-46](/IGL/issues/IGL-46) (part of [IGL-40](/IGL/issues/IGL-40))

## Context

Fram tests web apps through their WebMCP tools. WebMCP is not stable ([spec note, IGL-9](/IGL/issues/IGL-9#document-spec-status)):

- The spec is a W3C Community Group Draft Report (3 September 2026), not on the Standards Track.
- The spec IDL puts `modelContext` on `Document`. Chrome's Intent to Experiment calls it `navigator.modelContext`. The attachment point is unsettled.
- Chrome has it only as an origin trial (Chrome 149 to 156, shipping planned for 157). Safari opposes it, Firefox is neutral.
- Open spec PRs change the tool shape (#254, #348) and rename members (#204). Issue #361 says Chrome and the spec disagree on how `executeTool()` encodes input.

Fram must run in CI on apps Iglo did not write. Those apps call `registerTool` in their own code. In a CI browser there is no origin trial token for their origin and no Chrome flag, so a stock Chromium has no `modelContext`, and the app's tools never register.

The company rule: all access to `modelContext` goes through one package, so a WebMCP change hits one place only. For Fram, that package has two sides:

- **Page side:** the WebMCP implementation that Fram injects into the test browser, so `registerTool` works without a flag or origin trial.
- **Driver side:** the Node API that `fram-core` uses to list tools, call a tool, and see when tools register or unregister.

API surface used in this ADR, read from the CG Draft of 3 September 2026:

```webidl
partial interface Document {
  [SecureContext, SameObject] readonly attribute ModelContext modelContext;
};
interface ModelContext : EventTarget {
  Promise<undefined> registerTool(ModelContextTool tool, optional ModelContextRegisterToolOptions options = {});
  Promise<sequence<RegisteredTool>> getTools(optional ModelContextGetToolOptions options = {});
  Promise<DOMString> executeTool(RegisteredTool tool, optional object inputObject, optional ModelContextExecuteToolOptions options = {});
  attribute EventHandler ontoolchange;
  attribute EventHandler ontoolactivated;
  attribute EventHandler ontoolcancel;
};
// ModelContextTool: name, title?, description, inputSchema?, execute(input, {signal}), annotations?
// ModelContextRegisterToolOptions: exposedTo?, signal? (aborting the signal unregisters the tool)
```

## Options

Page side (the driver side follows from it):

- **A. Our own implementation of the spec IDL, injected with Playwright `addInitScript`.** The script runs after the document is created and before any page script (Playwright docs), in every page and child frame of the context. It installs the same `ModelContext` object on `Document.prototype` and on `Navigator.prototype`.
- **B. Chrome's native implementation.** Turn the feature on with a launch flag and drive it through Chrome's WebMCP DevTools Protocol domain, which lists and invokes tools (spec note).
- **C. A third-party open-source polyfill** (for example the MCP-B project), plus our own hooks for the driver.
- **Do nothing** is not an option: without a page side, Fram finds no tools on any app in CI.

## Evaluation

| Criterion | Weight | A: own shim | B: native Chrome | C: third-party polyfill |
| --- | --- | --- | --- | --- |
| Agent fit | 25% | 4 | 2 | 3 |
| Ecosystem maturity | 20% | 3 | 2 | 2 |
| Cost of ownership | 15% | 3 | 3 | 3 |
| Lock-in risk | 15% | 5 | 2 | 3 |
| Security posture | 15% | 4 | 4 | 2 |
| Performance and scalability | 10% | 5 | 4 | 4 |
| Weighted total | | **3.90** | 2.65 | 2.75 |

- Agent fit: A is plain TypeScript against a short IDL, testable in Vitest and Playwright. B needs an experimental CDP domain with little documentation and few examples. C means learning another project's internals and keeping its shape in sync with ours.
- Ecosystem maturity: everything here is young. A depends only on Playwright's `addInitScript` and `exposeBinding`, which are stable. B depends on an origin-trial feature and its experimental CDP domain. C depends on a small project that follows its own idea of the API.
- Cost of ownership: A means we follow spec changes ourselves, but the adapter exists for that. B needs a Chromium build in the trial range, and Playwright's bundled Chromium moves on its own schedule. C needs us to track upstream releases and patch hooks into them.
- Lock-in risk: A depends on nothing we do not control. B ties Fram to Chrome versions 149 to 156 and to a flag that can disappear. C ties us to a third party's API choices.
- Security posture: A and B add no third-party code to the page. C injects third-party code into every app under test, and its updates become our supply chain.
- Performance: A is a small script and calls go through `page.evaluate`. B adds a CDP round trip, which is still fast.

## Decision

**Option A: an Iglo-owned WebMCP implementation in `@iglo/webmcp-adapter`, injected into the test browser, plus a driver API for `fram-core`.** Native Chrome (B) becomes a second backend behind the same driver API when Chrome ships WebMCP (see Evolution).

### Package shape

`packages/webmcp-adapter` (ADR-001) has two entry points:

| Entry point | Runs in | Depends on | Exports |
| --- | --- | --- | --- |
| `@iglo/webmcp-adapter/page` | the test browser | nothing (no imports, built to a single self-contained script) | the script source as a string, plus the `SPEC_REVISION` it implements |
| `@iglo/webmcp-adapter/driver` | Node (`fram-core`) | `playwright-core` (peer) | `attachWebMCP(context)`, `WebMCPDriver`, types |

### Page side

1. **Injection.** `attachWebMCP(context)` calls `context.addInitScript({ content })` before the first navigation. The script runs in every page and child frame of the Fram browser context, before any app script.
2. **API.** It implements the CG Draft of 2026-09-03 (`SPEC_REVISION = "cg-draft-2026-09-03"`):
   - `registerTool(tool, { signal, exposedTo })` with the spec's checks, each rejecting with `InvalidStateError`: empty or too-long name (over 128), a character outside `[A-Za-z0-9_.-]`, an empty description, a duplicate name, a non-serializable `inputSchema`. Aborting `signal` unregisters the tool.
   - `getTools()` returns the tools of this document.
   - `executeTool(tool, input)`: an omitted input becomes `{}` (spec PR #324). The result is the stringified return value of `execute`.
   - `toolchange` event and `ontoolchange`, fired after each register and unregister.
   - `ontoolactivated` and `ontoolcancel` exist as attributes, but the shim never fires them in the MVP (no user-interaction flow).
3. **Both attachment points.** One `ModelContext` instance per document, returned by a getter on `Document.prototype.modelContext` **and** on `Navigator.prototype.modelContext`. Both always return the same object, so an app that registers through `navigator` and one that registers through `document` see the same tools. If the spec settles on one, we keep the other as an alias until no target app uses it.
4. **Native API present.** If Chromium already has a native `modelContext` (for example because the app serves an origin trial token), the shim replaces it on both prototypes. The run metadata records `webmcp.implementation: "iglo-shim"`, `webmcp.specRevision` and `webmcp.nativeDetected: true|false`. One implementation, the one we can observe, keeps runs deterministic.
5. **Unknown members are reported, not hidden.** Apps written against older or Chrome-specific shapes (for example `provideContext` or `unregisterTool`) touch members the spec no longer has. The shim returns its object through a `Proxy`. Reading any member that is not in the spec emits a diagnostic `webmcp.unsupported-member` with the member name. The read still returns `undefined`, as it would in a browser without that member. Fram then shows "the app uses `X`, which Fram does not support" instead of reporting zero tools. Adding such a shape later is a change inside this package only.
6. **Scope:** top-level document only. The script runs in child frames too, and a frame that registers tools emits the diagnostic `webmcp.frame-tools-ignored`. Cross-origin exposure (`exposedTo`, `fromOrigins`) is accepted as input and ignored in the MVP.

### Driver side

```ts
// @iglo/webmcp-adapter/driver (shape, not final code)
export function attachWebMCP(context: BrowserContext): Promise<void>;
export function driverFor(page: Page): WebMCPDriver;

export interface WebMCPDriver {
  /** Tools of the top-level document, in registration order. */
  listTools(): Promise<ToolDescriptor[]>;
  /** Calls one tool through the page's own executeTool path. */
  callTool(name: string, input: unknown, opts?: { timeoutMs?: number }): Promise<CallOutcome>;
  /** Fires after every register or unregister, and when the document changes (navigation). */
  onToolsChanged(listener: (e: ToolsChangedEvent) => void): () => void;
  /** Diagnostics: unsupported members, ignored frame tools, native API detected. */
  diagnostics(): readonly WebMCPDiagnostic[];
}

export interface ToolDescriptor { name: string; title?: string; description: string; inputSchema?: object; annotations?: ToolAnnotations }
export type CallOutcome =
  | { kind: "ok"; result: string }
  | { kind: "error"; error: { name: string; message: string } } // execute threw or rejected
  | { kind: "timeout"; afterMs: number };
export interface ToolsChangedEvent { reason: "registered" | "unregistered" | "document-changed"; tools: ToolDescriptor[] }
```

How it works:
- **List and call** go through `page.evaluate` to the shim's internal registry. The registry is a non-enumerable global whose name is chosen per run and passed in as the init-script argument. `callTool` calls the same internal path as `executeTool`, so the app sees exactly what an agent's call would do.
- **Change events:** `context.exposeBinding` installs a callback. The shim looks the binding up each time it emits, so script order does not matter (Playwright does not define the order of init scripts). Each event carries the full tool list, so a missed event cannot leave the driver with a wrong state.
- **Untrusted data.** The page is the app under test, so everything that comes back (tool lists, results, error messages) is data. The driver validates its shape (zod schemas) and caps string lengths before handing it to `fram-core`. A page that tampers with the shim can only make its own test results wrong, not reach the Node process.

Timeouts, settle time after a call, and what counts as a state are `fram-core` decisions (ADR-007). The adapter only reports what happened.

### Declarative (form-based) tools: not in the MVP

Declarative tools are defined by attributes on existing `<form>` elements, not by script. The CG Draft of 2026-09-03 does not define them. Supporting them means building tool synthesis from form markup, mapping form fields to a schema, and submit semantics on top of a moving target. The MVP does not include that.

So the MVP is not silent about them: the page side counts forms that carry Chrome's declarative tool attributes and emits the diagnostic `webmcp.declarative-tools-not-tested` with the count. The export shows "N declarative tools found, not tested". The attribute names are confirmed with the Spec-Watcher before implementation.

### Automated check

An ESLint `no-restricted-syntax` rule fails CI on any member access, string key or destructuring named `modelContext` outside `packages/webmcp-adapter/`. Fixture apps (`fixtures/*`) are allowed, because they are the apps under test. It is added in the first scaffolding PR together with the ADR-001 checks.

## Evolution

Designed for: Chromium only, imperative tools only, top-level document only, one spec revision at a time.

Revisit when:
- **Chrome ships WebMCP to stable** (planned for 157), or Playwright's Chromium has it on by default: add a native backend behind `WebMCPDriver`, using the WebMCP CDP domain. Run the adapter's conformance tests against both backends. Write an ADR on whether native becomes the default.
- **The CG Draft changes the tool shape or attachment point** (Spec-Watcher report; open PRs #204, #254, #348, issue #361): update the shim and `SPEC_REVISION` in one PR. If apps in use still need the old shape, support both and report which one an app used.
- **A target or partner app uses declarative tools**, or the diagnostic `webmcp.declarative-tools-not-tested` shows up in at least one partner run: write an ADR to support them.
- **A target app registers tools in iframes** (the diagnostic `webmcp.frame-tools-ignored` appears): add frame support.
- **Another engine ships WebMCP**: check whether the shim works in that engine through Playwright.

## Consequences

Easier:
- Fram works on any app that calls `registerTool`, in any Chromium version Playwright ships, with no flag and no origin trial.
- A spec change means changing one package, and `SPEC_REVISION` in every export shows which revision a run used.
- Apps written against other shapes are reported, not misread as "no tools".

Harder:
- We own a WebMCP implementation and must follow the spec ourselves. The Spec-Watcher's reports feed adapter issues.
- The shim can differ from Chrome's native behavior (issue #361 is such a case). A Fram finding could come from a difference in our implementation, not from the app. Mitigation below.

We give up:
- Testing Chrome's own implementation in the MVP.
- Declarative tools, iframe tools and cross-origin exposure in the MVP.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Shim behavior differs from Chrome, so Fram reports a defect that is ours. | Conformance tests in the adapter, written from the spec text and the WPT tests for WebMCP where they exist. Every finding records `webmcp.specRevision`. When the native backend arrives, the same tests run against Chrome. |
| An app sees our shim instead of the native API and takes another code path. | `nativeDetected` in the run metadata. Diagnostics for unsupported members. |
| The app detects the shim (for example with `toString` checks) and behaves differently. | Not handled in the MVP. If a target app does this, it shows up as missing tools, and we handle it then. |
| Script order: the app's code runs before the shim. | `addInitScript` runs before any page script by Playwright's contract. An adapter integration test checks that a tool registered in an inline `<head>` script is found. |
| Untrusted page data reaches `fram-core` in an unexpected shape. | Schema validation and length caps in the driver. Page data is never run or read as instructions (no LLM in Fram, IGL-49). |

## Cost impact

None. No new services. The only dependency is `playwright-core`, which Fram needs anyway.

## Security review

Requested from the Security Engineer as part of [IGL-49](/IGL/issues/IGL-49). Reason: the page side injects Iglo code into third-party app pages, and the driver moves untrusted page data into the Node process that runs in CI. No auth, customer data or secrets are involved.

## Diagrams

- Added `docs/architecture/context.md`: Fram, the app under test, the test browser with the injected shim, and GitHub.
