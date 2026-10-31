# ADR-006: CI/CD, and the shape and permissions of the Fram Action

Status: proposed
Date: 2026-10-31
Owner: Architekt
Approver: Head of Tech
Issue: [IGL-46](/IGL/issues/IGL-46) (part of [IGL-40](/IGL/issues/IGL-40))
Supersedes: the ADR-006 draft in the iglo-handbook (`references/hosting-and-ci.md`, "GitHub Actions + Blacksmith"). That draft was never accepted.

## Context

The handbook draft proposed GitHub Actions with Blacksmith runners, to be decided after a one-week-per-runner comparison of GitHub, Blacksmith and Ubicloud. That comparison takes at least three weeks. The Fram MVP must run on a real app's PRs by 2026-12-15, and Fram code cannot be merged until this ADR is approved. The Head of Tech decided on [IGL-46](/IGL/issues/IGL-46): approve with GitHub-hosted runners now, and turn the runner comparison into an evolution trigger. No paid runner and no usage beyond the included minutes without CEO approval.

This ADR decides three things:

1. **CI for the Iglo monorepo:** platform, runners, cost guardrails, and the workflows that ADR-001 and ADR-004 need (boundary checks, the Action release).
2. **The shape of the Fram Action:** JavaScript, composite or Docker.
3. **The minimum `permissions`** that the Fram Action needs in a user's workflow.

Facts this relies on (GitHub Actions docs, checked through Context7 on 2026-10-31):
- Standard GitHub-hosted runners are free and unlimited in public repositories. Larger runners are billed per minute, even in public repositories.
- In private repositories, usage draws from the plan's monthly included compute (GitHub Free: USD 12 of compute, 500 MB artifact storage). Usage beyond that is billed.
- `valentinpalkovic/Igglo` is public (checked through the GitHub API on 2026-10-31).
- On `pull_request` events from forks, `GITHUB_TOKEN` is read-only and no other secrets reach the runner. `pull_request_target` runs with the base repo's token and secrets.
- If a workflow sets `permissions`, every scope not listed is `none` (except `metadata: read`).
- JavaScript actions run with `runs.using: node24` and `runs.main`.

## Options

### Runners (Iglo monorepo)

- **A. GitHub-hosted standard runners** (`ubuntu-24.04`).
- **B. GitHub Actions with Blacksmith runners** (the handbook draft). Third-party, billed beyond its free tier.
- **C. GitHub Actions with Ubicloud runners.** Third-party, EU data centers, billed.
- **D. Self-hosted runners.** We would run machines ourselves.

CircleCI and Buildkite were already ruled out in the handbook draft (a second CI platform, or our own agents). GitHub Actions stays the CI system: the Architecture Review trigger is a GitHub Action, and the Fram product itself is a GitHub Action.

### Shape of the Fram Action

- **J. JavaScript action** (`node24`), bundled per ADR-001.
- **K. Composite action:** YAML steps that install Node and Playwright, then run the Fram CLI.
- **L. Docker container action:** an image with Chromium and Fram preinstalled.

## Evaluation

### Runners

| Criterion | Weight | A: GitHub-hosted | B: Blacksmith | C: Ubicloud | D: self-hosted |
| --- | --- | --- | --- | --- | --- |
| Agent fit | 25% | 5 | 4 | 4 | 3 |
| Ecosystem maturity | 20% | 5 | 3 | 3 | 4 |
| Cost of ownership | 15% | 5 | 3 | 3 | 1 |
| Lock-in risk | 15% | 4 | 4 | 4 | 4 |
| Security posture | 15% | 5 | 3 | 3 | 2 |
| Performance and scalability | 10% | 3 | 5 | 4 | 4 |
| Weighted total | | **4.65** | 3.60 | 3.50 | 3.00 |

- Agent fit: every agent knows `runs-on: ubuntu-*`. B and C only change that label, but add a vendor dashboard and its quirks. D needs machine administration.
- Ecosystem maturity: GitHub-hosted runners are the default for almost all public projects. B and C are younger vendors.
- Cost of ownership: A is free for our public repo and needs no account. B and C need an account and a bill, which needs CEO approval. D needs machines and patching.
- Lock-in risk: all four use the same workflow files, so switching is one line (the handbook rule stays).
- Security posture: A is a fresh VM per job, run by GitHub, with no third party in the path. B and C add a third party that sees our code and CI logs. D is risky with untrusted PR code, because machines can persist between jobs.
- Performance: A is slower per job than B or C (vendor claims, not measured by us). That is why the comparison stays as a trigger.

### Shape of the Fram Action

| Criterion | Weight | J: JavaScript | K: composite | L: Docker |
| --- | --- | --- | --- | --- |
| Agent fit | 25% | 5 | 4 | 3 |
| Ecosystem maturity | 20% | 5 | 4 | 4 |
| Cost of ownership | 15% | 4 | 3 | 2 |
| Lock-in risk | 15% | 4 | 4 | 4 |
| Security posture | 15% | 4 | 3 | 3 |
| Performance and scalability | 10% | 4 | 4 | 2 |
| Weighted total | | **4.45** | 3.70 | 3.10 |

- Agent fit: J is TypeScript in the same toolchain as `fram-core`, tested with Vitest. Its inputs, summary and artifact go through the official `@actions/*` toolkit. K moves logic into YAML and shell, which is hard to test. L adds a Dockerfile, an image registry and a separate release.
- Ecosystem maturity: JavaScript actions are the most common kind, with a stable toolkit. Composite and Docker actions are mature too, but have fewer building blocks for summaries and artifacts.
- Cost of ownership: J has one build (ADR-001). K has to keep the YAML steps, the CLI and their Node version in sync. L has to rebuild and publish an image (about 1 to 2 GB with Chromium) for every release.
- Security posture: J ships a fixed bundle with a lockfile-pinned `playwright-core`, at a pinnable SHA. K resolves tools at run time, unless every step is pinned. L adds a base image to the supply chain.
- Performance: J and K install Chromium per run (the Playwright CLI download). L pulls a large image on every job. L also runs Fram inside a container, while the app under test is started by the user's own toolchain on the host, which makes networking and the start command awkward.
- The deciding point for L: Docker container actions run only on Linux runners, and the user's app is built and started on the host. Fram should start the app with the user's own toolchain (ADR-007), so it belongs on the host.

## Decision

### 1. CI for the Iglo monorepo: GitHub Actions on GitHub-hosted standard runners

Rules:
- `runs-on: ubuntu-24.04` (a pinned image label, not `ubuntu-latest`). Larger runners, third-party runners (Blacksmith, Ubicloud, other vendors) and self-hosted runners need CEO approval first, because each costs money or adds a vendor.
- Every job sets `timeout-minutes` (default 15, Playwright jobs 20). Pull-request workflows use `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`.
- **Private repositories** (for example the private mirror of the target app, IGL-49) draw from the included compute. Before the first workflow runs in a private repo, the account owner (CEO) checks that the Actions budget stops usage at the included amount instead of billing overage. CI usage is reported in the Monthly Review (handbook rule).
- Every workflow declares top-level `permissions: { contents: read }`, and jobs widen it only where needed. The repo setting "Workflow permissions" is set to read-only (an admin action for the CEO, listed under Follow-ups).
- `pull_request_target` and `workflow_run` with PR code are not used.
- Third-party actions are pinned to a full commit SHA, with the version in a comment. Dependabot updates `github-actions` and `npm` weekly.
- No secrets are needed for CI in the MVP. If one is ever added, it lives only in GitHub encrypted secrets, scoped to an environment, and never reaches `pull_request` jobs.

Workflows (built as scaffolding after approval):

| Workflow | Trigger | Jobs | Permissions |
| --- | --- | --- | --- |
| `ci.yml` | `pull_request`, `push` to `main` | install (`--frozen-lockfile`), lint (incl. the ADR-004 `modelContext` rule), typecheck, dependency-cruiser (ADR-001), unit tests, build. Then `fram-selftest`: build the Action folder, install Chromium, run it as `uses: ./…` against `fixtures/`. | `contents: read`, `actions: read` (only `fram-selftest`, for the baseline download) |
| `workflow-lint.yml` | `pull_request` touching `.github/` | `actionlint`, plus a script that fails on any `uses:` without a full SHA (local `./` actions excepted) and on any `pull_request_target`. | `contents: read` |
| `release-fram-action.yml` | `workflow_dispatch` only, environment `release` with the CEO as required reviewer | build (ADR-001), self-test, commit to `release/fram-action`, create tags `fram-action-vX.Y.Z` and move `fram-action-vX`. | `contents: write`, this job only |
| `arch-review-trigger.yml` | `pull_request: closed` on `main` (handbook routine) | counts merged PRs since tag `arch-review-last`. | per the handbook |

The ADR-001 rule "nothing but the release workflow writes to `release/fram-action`" is enforced by a branch ruleset (an admin action, under Follow-ups).

### 2. The Fram Action is a JavaScript action (`node24`)

```yaml
# packages/fram-action/action.yml (shape; inputs are decided in ADR-007)
name: Fram
description: Explore a WebMCP app's tools on every PR and report findings.
inputs:
  start-command: { description: Command that starts the app, required: true }
  url:           { description: URL that Fram opens once the app is up, required: true }
  github-token:  { description: Token to read the main baseline, default: "${{ github.token }}" }
runs:
  using: node24
  main: dist/index.js
  post: dist/post.js   # stops the app process tree, also when the main step fails
```

What the Action does, in order:
1. reads and validates inputs (validation lives in `fram-core`, shared with the CLI);
2. installs the Chromium build that matches its pinned `playwright-core` version, with system dependencies (`playwright-core` CLI `install --with-deps chromium`). No cache in the MVP; we add one only if install time shows up as a large share of run time;
3. starts the app with the user's command on the host and waits for the URL (details in ADR-007);
4. runs `fram-core`;
5. writes the job summary (`@actions/core` summary) and uploads the run export as an artifact (`@actions/artifact`);
6. in `post`: stops the app.

The Action is released and versioned as described in ADR-001 (branch `release/fram-action`, tags `fram-action-vX.Y.Z` and `fram-action-vX`, CEO release approval).

### 3. Minimum permissions for the Fram Action

Recommended workflow for a user's repo:

```yaml
name: Fram
on:
  pull_request:
  push:
    branches: [main]        # main baseline (ADR-007)
permissions:
  contents: read            # checkout of the app's code
  actions: read             # find and download the latest main-baseline artifact from another run
jobs:
  fram:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@<full-sha>   # vX
        with: { persist-credentials: false }
      # the app's own setup (setup-node, install, build)
      - uses: valentinpalkovic/Igglo/packages/fram-action@<full-sha>   # fram-action-v0.x.y
        with:
          start-command: npm run preview
          url: http://localhost:4173
```

| Scope | Level | Why |
| --- | --- | --- |
| `contents` | `read` | Checkout. Needed in private repos. Fram never writes to the repo. |
| `actions` | `read` | A PR run compares with the latest baseline from a `push` to `main`, which is an artifact of a different workflow run. Listing and downloading it needs `actions: read`. If ADR-007 stores the baseline elsewhere, this scope is dropped. |
| everything else | `none` | Uploading the artifact and writing the job summary do not use `GITHUB_TOKEN` scopes. |

Not granted:
- `pull-requests: write`. The MVP reports through the job summary and an artifact, not a PR comment (ADR-007 decides whether a comment comes later). Adding it needs a change to this ADR and a Security Engineer review. For fork PRs the token is read-only anyway.
- `checks: write` or `statuses: write`. The job's own pass/fail is the check.
- `id-token: write`. No cloud access.

Trigger rules for users (in the Action's README):
- Use `pull_request`, never `pull_request_target`. Fram executes the PR's code, and `pull_request` keeps that code away from secrets and write tokens.
- Fram needs no secrets. A workflow that runs Fram should not pass any.
- Pin the Action to a full commit SHA. The moving tag `fram-action-v0` is for people who accept updates.

## Evolution

Designed for: one public monorepo, a handful of PRs per day, the Fram Action running in a few external repos on their own minutes.

Revisit with the runner comparison (GitHub vs Blacksmith vs Ubicloud, owner Architekt with the Staff Engineer, method as in the handbook draft) when any of these holds:
- median time from push to green check on `main` PRs is above 15 minutes for two weeks in a row;
- median queue time before a job starts is above 3 minutes for a week;
- usage in Iglo's private repos reaches 80% of the included compute in any month;
- customer test data starts to flow through Iglo's CI. Then evaluate EU runners (Ubicloud), with a Security Engineer review;
- a partner says Fram's run time on their own minutes blocks adoption. Then measure Fram's own run time first (ADR-007 limits), before looking at runners.

A switch to a paid runner always needs CEO approval.

Revisit the Action's shape when:
- a partner needs Fram on non-GitHub CI (then the CLI on npm, see ADR-001), or on Windows or macOS runners;
- Chromium install takes more than 25% of median Fram run time (then add a browser cache, or compare with a container action).

## Consequences

Easier:
- No vendor accounts, no bills, and the CI setup that agents know best.
- A partner adds Fram with one job and two read scopes. Fram needs no secrets, so fork PRs work the same as internal PRs.

Harder:
- GitHub-hosted runners may be slower per job than the alternatives. We accept that until a trigger fires.
- Fram runs on the partner's minutes. In private repos, Fram's run time is a cost the partner sees, so ADR-007's limits on states, calls and time matter.

We give up:
- The measured runner comparison before the decision. It now runs only when a trigger fires.
- PR comments in the MVP.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Untrusted app code (the app under test, PR code) runs in the same job as `GITHUB_TOKEN`. | The token has only `contents: read` and `actions: read`. No secrets. `persist-credentials: false` on checkout. Full threat model in [IGL-49](/IGL/issues/IGL-49). |
| Usage in a private repo exceeds the included minutes and gets billed. | Actions budget stops at the included amount (checked by the CEO before the first private run), `timeout-minutes` on every job, `cancel-in-progress` on PR workflows, usage in the Monthly Review. |
| A compromised third-party action in our workflows. | Full-SHA pinning, checked by `workflow-lint.yml`. Dependabot PRs for updates. Minimal permissions per job. |
| A user pins `fram-action-v0` and gets a broken release. | The release workflow self-tests against the fixture before tagging. Users are told to pin a SHA. |
| The release workflow's `contents: write` is misused. | It runs only on `workflow_dispatch`, in the `release` environment with the CEO as required reviewer. Only that job has the scope. |
| The export artifact contains secrets or personal data from the app under test. | Retention and content rules come from IGL-49 and ADR-007. Until then, artifacts use `retention-days: 14`. |

## Cost impact

- Iglo monorepo (public): USD 0. Standard runners are free in public repos.
- Iglo private repos (for example the target app mirror): within the included compute (GitHub Free: USD 12 per month, 500 MB artifact storage). Cost rises with Fram run time × number of PRs. We cannot see the account's plan through the API, so the CEO confirms it with the budget check above.
- Partner repos: the partner's own minutes, USD 0 for Iglo.
- No paid runner. Any change needs CEO approval.

## Security review

Required: this ADR decides token permissions, secret handling, the trigger events that run untrusted code, and the supply chain that partners trust when they install our Action. Requested from the Security Engineer in [IGL-49](/IGL/issues/IGL-49). The ADR stays `proposed` until the review is linked here.

## Follow-ups after approval

- Architekt: scaffolding PR with `ci.yml`, `workflow-lint.yml`, Dependabot config, and the ADR-001/ADR-004 checks.
- CEO (repo admin): set "Workflow permissions" to read-only; add a ruleset that blocks direct pushes to `release/fram-action` and `main`; create the `release` environment with the CEO as required reviewer; confirm the Actions budget for private repos.

## Diagrams

- Added `docs/architecture/deployment.md`: CI only. Hosting is added with ADR-005.
