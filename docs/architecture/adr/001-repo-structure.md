# ADR-001: Repo structure

Status: proposed
Date: 2026-10-31
Owner: Architekt
Approver: Head of Tech
Issue: [IGL-46](/IGL/issues/IGL-46) (part of [IGL-40](/IGL/issues/IGL-40))

## Context

The repo `valentinpalkovic/Igglo` is empty apart from a placeholder README. The Fram MVP must run on pull requests of an app Iglo did not write by 2026-12-15 ([IGL-40](/IGL/issues/IGL-40)), and no Fram code can be merged before this ADR, ADR-004 and ADR-006 are approved.

The MVP needs four packages:

1. the WebMCP adapter (ADR-004),
2. `fram-core`, the explorer (ADR-007),
3. the Fram CLI,
4. the Fram GitHub Action (shape and permissions in ADR-006).

Later, the repo must also hold the docs site (ADR-002), a UI library with Storybook (ADR-003) and demo apps. None of these are needed for the MVP, so this ADR only reserves their place.

Constraints:
- Everything is TypeScript on Node.js. Fram drives Chromium through Playwright.
- A GitHub Action inside a monorepo is unusual: GitHub runs the action from a Git ref, without installing dependencies. So the action needs a build and release path of its own.
- Package boundaries must be checked in CI, not just written down.
- The spike on `spike/igl-28` is throwaway code and is never merged ([IGL-33](/IGL/issues/IGL-33)).

## Options

- **A. pnpm workspaces + Turborepo.** pnpm links the packages, Turborepo runs tasks in dependency order and caches them. Package boundaries are checked with dependency-cruiser.
- **B. pnpm workspaces + Nx.** Nx runs and caches tasks, and its ESLint rule `@nx/enforce-module-boundaries` checks tag-based dependency rules.
- **C. pnpm workspaces only.** `pnpm -r run build` runs in topological order. No task cache. Boundaries are checked with dependency-cruiser.
- **D. Separate repos** for the adapter, core, CLI and action. Not chosen: four repos, four CI setups, and cross-repo version bumps for every change to the adapter, which is the package that changes most while WebMCP moves.

## Evaluation

| Criterion | Weight | A: pnpm + Turborepo | B: pnpm + Nx | C: pnpm only |
| --- | --- | --- | --- | --- |
| Agent fit | 25% | 5 | 4 | 5 |
| Ecosystem maturity | 20% | 5 | 5 | 4 |
| Cost of ownership | 15% | 4 | 3 | 5 |
| Lock-in risk | 15% | 5 | 3 | 5 |
| Security posture | 15% | 4 | 4 | 5 |
| Performance and scalability | 10% | 4 | 5 | 2 |
| Weighted total | | **4.60** | 4.00 | 4.50 |

- Agent fit: A and C use plain `package.json` scripts plus one small `turbo.json`, a very common pattern. Nx adds generators, plugins and inferred targets that agents get wrong more often.
- Ecosystem maturity: Turborepo and Nx are both widely used and maintained. Plain pnpm lacks a task cache and task graph, which matters once there are more packages.
- Cost of ownership: C has the fewest moving parts. Turborepo adds one config file. Nx adds a plugin system and migrations on every major version.
- Lock-in risk: Turborepo only reads `package.json` scripts, so removing it means deleting `turbo.json`. Nx projects tend to depend on Nx executors and project config.
- Security posture: every tool adds a supply-chain dependency. C adds none, A and B add one each. All of them need the same pinning (lockfile, `pnpm install --frozen-lockfile`).
- Performance and scalability: with four packages all options are fast. A and B cache tasks, so CI time stays flat as packages are added. B also has affected-only runs.

Boundary checks: Nx's module-boundary rule is mature. Turborepo's own `turbo boundaries` (tags, allow/deny) is still marked experimental in the Turborepo docs, so we do not rely on it. dependency-cruiser does the same job for A and C, does not depend on the task runner, and also finds cycles.

## Decision

**Option A: pnpm workspaces + Turborepo, with package boundaries and cycles checked by dependency-cruiser.**

A and C score almost the same. A wins because the task cache and dependency-ordered runs come at the cost of one config file, and the cache keeps CI minutes down (ADR-006: no paid runners, stay within the included minutes). If Turborepo causes trouble, falling back to C means deleting `turbo.json`.

### Layout

```text
.
├── packages/
│   ├── webmcp-adapter/   @iglo/webmcp-adapter   ADR-004: the only code that touches modelContext
│   ├── fram-core/        @iglo/fram-core        ADR-007: explorer, findings, run export
│   ├── fram-cli/         @iglo/fram-cli         thin shell: argv/config file -> fram-core
│   └── fram-action/      @iglo/fram-action      thin shell: action inputs -> fram-core (ADR-006)
├── apps/                 reserved: docs (ADR-002), demos
├── fixtures/             test apps that Fram runs against in CI (e.g. the IGL-28 fixture, once approved for main)
├── docs/architecture/    ADRs and diagrams
├── .github/workflows/    CI (ADR-006)
├── package.json          private root, scripts only
├── pnpm-workspace.yaml   packages/*, apps/*, fixtures/*
├── turbo.json
└── .dependency-cruiser.cjs
```

`packages/ui` (ADR-003) is added when ADR-003 is accepted. Spike branches stay outside `main`.

### Allowed dependencies

| Package | May depend on (workspace) | Notes |
| --- | --- | --- |
| `webmcp-adapter` | none | Has two entry points, `/page` (browser, no Node or npm imports) and `/driver` (Node, peer dependency `playwright-core`). See ADR-004. |
| `fram-core` | `webmcp-adapter` (`/driver` only) | No GitHub or CLI code. No `@actions/*`. |
| `fram-cli` | `fram-core` | Does not import `fram-action`. |
| `fram-action` | `fram-core` | Does not import `fram-cli`. May use `@actions/*`. |
| `apps/*`, `fixtures/*` | anything in `packages/` | Nothing in `packages/` may import from `apps/` or `fixtures/`. |

The CLI and the Action are both thin shells. Shared logic (config parsing and validation, defaults, export writing) lives in `fram-core`, so the CLI and the Action cannot drift apart.

Rules that CI checks (dependency-cruiser, in the first scaffolding PR):
- the table above, as allow rules: anything not listed fails;
- no circular dependencies, inside or across packages;
- no relative imports across package directories (`../../fram-core/src/...`). Packages are imported by name only;
- every imported npm package is declared in that package's own `package.json`.

The rule "only `webmcp-adapter` touches `modelContext`" is an ADR-004 check (an ESLint rule), because dependency-cruiser sees imports, not property access.

### Toolchain

- Node.js 24 LTS. Pinned in `.nvmrc` and `engines`. Same major as the `node24` Actions runtime (ADR-006).
- pnpm, pinned through the root `packageManager` field. CI runs `pnpm install --frozen-lockfile`.
- TypeScript in strict mode, one shared `tsconfig.base.json`. Libraries are built with `tsc` to ESM plus `.d.ts`.
- Tests: Vitest for unit tests. `fram-core` and the adapter run their integration tests against fixture apps in Playwright Chromium.
- Lint: ESLint (flat config) and Prettier.

### How the GitHub Action is built and versioned

GitHub runs a JavaScript action straight from a Git ref, with no install step. Everything the action needs must therefore be in that commit. We do not commit build output to `main`:

1. **Source on `main`.** `packages/fram-action/` holds `action.yml`, `src/` and `package.json`. `main` never contains `dist/`.
2. **Build.** `pnpm --filter @iglo/fram-action build` bundles the action and its workspace dependencies (`fram-core`, `webmcp-adapter`) with esbuild into `dist/index.js`. `playwright-core` is not bundled, because it loads its own files at runtime. It is shipped as a normal dependency through `pnpm deploy --prod`, which writes a self-contained folder with `action.yml`, `dist/` and production-only `node_modules/`.
3. **Release commit.** A `workflow_dispatch` release workflow (ADR-006) builds that folder, runs it as a local action (`uses: ./<folder>`) against the fixture app, and then commits it to the branch `release/fram-action` at the path `packages/fram-action/`. The path stays the same as on `main`, so users always write the same `uses:` line. Each release commit records the source commit SHA from `main` in its message.
4. **Version.** The `version` in `packages/fram-action/package.json` is the action version (SemVer, starting at `0.1.0`). It is changed in an ordinary PR. The release workflow refuses to run if the tag already exists.
5. **Tags.** On the release commit: an exact tag `fram-action-v0.1.0` and a moving major tag `fram-action-v0`. Users reference
   `uses: valentinpalkovic/Igglo/packages/fram-action@fram-action-v0`,
   or pin a full commit SHA from `release/fram-action` (recommended, see ADR-006).
6. **Approval.** A tag on this public repo is a release to users, so creating one needs CEO release approval. Until then, Iglo's own test runs pin a full SHA from `release/fram-action`, without a tag.

The Fram CLI is not published to npm in the MVP. Publishing is a one-way door and the MVP does not need it, because the Action embeds `fram-core`. Locally the CLI runs from the repo (`pnpm fram ...`).

## Evolution

Designed for: one team, four packages, one Action, no hosted service, no UI.

Revisit when:
- CI for a PR that touches only one package takes more than 10 minutes with a warm cache: consider affected-only runs (`turbo run --affected`) or Nx.
- More than 15 workspace packages, or dependency-cruiser rules need more than about 30 lines to describe the boundaries: compare with Nx module boundaries.
- `turbo boundaries` loses its experimental label: check whether it can replace dependency-cruiser and remove a tool.
- We want a GitHub Marketplace listing, or a partner's security policy only allows actions from a repo with `action.yml` at the root: write a new ADR to mirror `release/fram-action` into its own repo (for example `iglo-labs/fram-action`). Users then change only the `uses:` line.
- A partner asks to run Fram outside GitHub Actions: write an ADR for publishing `@iglo/fram-cli` to npm (needs CEO approval).

## Consequences

Easier:
- One PR can change the adapter, core and Action together. When WebMCP changes, that is one PR, not four.
- CLI and Action share all logic through `fram-core`.
- Wrong dependencies fail CI instead of review.

Harder:
- The Action has its own release path (release branch and tags), so it needs a release workflow.
- The repo owns its tags. Tags have a package prefix (`fram-action-v*`), so later packages can have their own tags.

We give up:
- `uses: ...@main` does not work for users, because `main` has no `dist/`. That is intended: a user is never on unreleased code.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The release folder misses a runtime file (for example a `playwright-core` asset) and the Action breaks for users. | The release workflow runs the built folder as a local action against the fixture before it commits anything. |
| `release/fram-action` drifts from `main`. | Only the release workflow writes to that branch (branch rule: no direct pushes). Each release commit names its source SHA. |
| Boundaries erode before the checks exist. | The first scaffolding PR adds dependency-cruiser before any Fram code. Until it is merged, the Architekt reviews each PR for boundary violations. |
| Tool upgrades (Turborepo, pnpm) break CI. | Versions pinned in the lockfile and `packageManager`. Upgrades go through Dependabot PRs. |

## Cost impact

No money: Turborepo runs locally and in CI without a remote cache. We do not use Vercel Remote Cache. If we ever want a remote cache, that needs its own decision, because it sends build artifacts to an external service. The task cache inside CI uses the GitHub Actions cache (ADR-006). Cost goes up only with CI minutes, which ADR-006 limits.

## Security review

Not required. This ADR covers repo layout and build tooling. It does not touch auth, customer data, secrets or external network access. The release workflow's token permissions and the supply-chain view of the Action are in ADR-006, which needs Security Engineer review.

## Diagrams

- Added `docs/architecture/containers.md`: packages and allowed dependencies.
