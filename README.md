# Igglo

Iglo Labs monorepo: Fram and the WebMCP adapter. Structure and rules: [ADR-001](docs/architecture/adr/001-repo-structure.md), [ADR-004](docs/architecture/adr/004-webmcp-adapter.md), diagrams in [docs/architecture](docs/architecture/).

## Setup

Node.js 24 (`.nvmrc`) and pnpm (version pinned in `packageManager`, use `corepack enable`).

```sh
pnpm install --frozen-lockfile
pnpm check   # lint, format, build, typecheck, test, package boundaries
```

## Checks that CI runs

| Command              | What it enforces                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`          | ESLint, including the ADR-004 rule: `modelContext` only in `packages/webmcp-adapter` (and `fixtures/`)                      |
| `pnpm depcruise`     | ADR-001 package boundaries, no cycles, no cross-package relative imports, declared dependencies (`.dependency-cruiser.cjs`) |
| `pnpm workflow-pins` | ADR-006: every `uses:` pinned to a full commit SHA, no `pull_request_target`                                                |
