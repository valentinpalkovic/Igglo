// Tests for the review-gate scripts. Run with: pnpm test:scripts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isForbidden } from "./check-forbidden-paths.mjs";
import { ARCHITEKT, SECURITY, labelsFor, newDependencies } from "./review-labels.mjs";

describe("isForbidden", () => {
  it("flags build output, node_modules and tool caches at any depth", () => {
    for (const path of [
      "node_modules/x/index.js",
      "packages/fram-core/node_modules/.bin/tsc",
      "packages/fram-core/dist/index.js",
      ".turbo/cache/abc.tar.zst",
      "packages/fram-cli/.turbo/turbo-build.log",
      ".nx/workspace-data/file-map.json",
      "coverage/lcov.info",
      "playwright-report/index.html",
      "packages/fram-core/tsconfig.tsbuildinfo",
    ]) {
      assert.equal(isForbidden(path), true, path);
    }
  });

  it("allows source files whose names only resemble forbidden dirs", () => {
    for (const path of [
      "packages/fram-core/src/dist.ts",
      "packages/fram-core/src/build-report.ts",
      "docs/architecture/deployment.md",
      "scripts/check-forbidden-paths.mjs",
    ]) {
      assert.equal(isForbidden(path), false, path);
    }
  });
});

/** @param {string[]} changedFiles @param {object} [base] @param {object} [head] */
function change(changedFiles, base = {}, head = base) {
  return {
    changedFiles,
    basePackages: new Map(Object.entries(base)),
    headPackages: new Map(Object.entries(head)),
  };
}

describe("labelsFor", () => {
  it("routes ADRs, Turborepo config and boundary rules to the Architekt", () => {
    for (const file of [
      "docs/architecture/adr/009-new.md",
      "turbo.json",
      "nx.json",
      ".dependency-cruiser.cjs",
      "pnpm-workspace.yaml",
    ]) {
      assert.deepEqual(labelsFor(change([file])), [ARCHITEKT], file);
    }
  });

  it("routes workflows, actions and auth or secrets code to the Security Engineer", () => {
    for (const file of [
      ".github/workflows/ci.yml",
      ".github/actions/setup/action.yml",
      "packages/fram-action/action.yml",
      "packages/fram-core/src/auth/session.ts",
      "packages/fram-cli/src/secrets.ts",
      "apps/web/.env.example",
    ]) {
      assert.deepEqual(labelsFor(change([file])), [SECURITY], file);
    }
  });

  it("adds no label to ordinary source, test and docs changes", () => {
    const files = [
      "packages/fram-core/src/explore.ts",
      "packages/fram-core/test/explore.test.ts",
      "packages/fram-core/src/tokenizer.ts",
      "docs/architecture/containers.md",
      "README.md",
    ];
    assert.deepEqual(labelsFor(change(files)), []);
  });

  it("does not flag a version bump of an existing dependency (Dependabot)", () => {
    const base = { "package.json": { devDependencies: { eslint: "^10.14.0" } } };
    const head = { "package.json": { devDependencies: { eslint: "^10.15.0" } } };
    assert.deepEqual(labelsFor(change(["package.json", "pnpm-lock.yaml"], base, head)), []);
  });

  it("flags a dependency that no package used before", () => {
    const base = { "package.json": { devDependencies: { eslint: "^10.14.0" } } };
    const head = {
      "package.json": { devDependencies: { eslint: "^10.14.0", "left-pad": "^1.3.0" } },
    };
    const c = change(["package.json", "pnpm-lock.yaml"], base, head);
    assert.deepEqual(newDependencies(c), ["left-pad"]);
    assert.deepEqual(labelsFor(c), [SECURITY]);
  });

  it("does not flag a dependency another package already uses", () => {
    const base = {
      "package.json": { devDependencies: { vitest: "catalog:" } },
      "packages/fram-cli/package.json": { name: "@iglo/fram-cli" },
    };
    const head = {
      ...base,
      "packages/fram-cli/package.json": {
        name: "@iglo/fram-cli",
        devDependencies: { vitest: "catalog:" },
      },
    };
    assert.deepEqual(labelsFor(change(["packages/fram-cli/package.json"], base, head)), []);
  });

  it("routes a changed package entry point or workspace dependency to the Architekt", () => {
    const file = "packages/fram-cli/package.json";
    const base = {
      [file]: {
        exports: { ".": "./dist/index.js" },
        dependencies: { "@iglo/fram-core": "workspace:*" },
      },
      "packages/webmcp-adapter/package.json": { name: "@iglo/webmcp-adapter" },
    };
    const newExport = {
      ...base,
      [file]: { ...base[file], exports: { ".": "./dist/index.js", "./x": "./dist/x.js" } },
    };
    assert.deepEqual(labelsFor(change([file], base, newExport)), [ARCHITEKT]);

    const newWorkspaceDep = {
      ...base,
      [file]: {
        ...base[file],
        dependencies: {
          "@iglo/fram-core": "workspace:*",
          "@iglo/webmcp-adapter": "workspace:*",
        },
      },
    };
    assert.deepEqual(labelsFor(change([file], base, newWorkspaceDep)), [ARCHITEKT]);
  });

  it("can add both labels", () => {
    assert.deepEqual(labelsFor(change(["turbo.json", ".github/workflows/ci.yml"])), [
      ARCHITEKT,
      SECURITY,
    ]);
  });
});
