#!/usr/bin/env node
// Review gate 3 (handbook, Code review): path-based review routing.
// Agents have no GitHub user accounts, so CODEOWNERS cannot name them.
// This script computes labels instead; the QA Engineer reads them and
// requests the Architekt (needs-architekt) or Security Engineer (needs-security).
//
// Usage: node scripts/review-labels.mjs <base-ref> <head-ref>
// Prints one label per line. Run in a checkout that has both refs.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const ARCHITEKT = "needs-architekt";
export const SECURITY = "needs-security";

/** Package boundaries, Turborepo/Nx config, ADRs. */
const ARCHITEKT_PATHS = [
  /^docs\/architecture\/adr\//,
  /^\.dependency-cruiser\.c?js$/,
  /^pnpm-workspace\.yaml$/,
  /(^|\/)turbo\.json$/,
  /(^|\/)nx\.json$/,
  /^tsconfig\.base\.json$/,
];

/** Workflows, actions, dependency-update config, auth and secrets handling. */
const SECURITY_PATHS = [
  /^\.github\/workflows\//,
  /^\.github\/actions\//,
  /(^|\/)action\.ya?ml$/,
  /^\.github\/dependabot\.ya?ml$/,
  /(^|\/)renovate\.json5?$/,
  /(^|\/)\.env(\.|$)/,
  /(^|[/._-])(auth|oauth|secrets?|credentials?|tokens?|crypto)([/._-]|$)/i,
];

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

/**
 * @typedef {{ [field: string]: unknown }} PackageJson
 * @typedef {{
 *   changedFiles: string[];
 *   basePackages: Map<string, PackageJson>;
 *   headPackages: Map<string, PackageJson>;
 * }} Change
 */

/** @param {PackageJson | undefined} pkg @returns {Map<string, string>} */
function dependenciesOf(pkg) {
  const deps = new Map();
  for (const field of DEPENDENCY_FIELDS) {
    const value = pkg?.[field];
    if (value && typeof value === "object") {
      for (const [name, spec] of Object.entries(value)) deps.set(name, String(spec));
    }
  }
  return deps;
}

/**
 * Third-party dependency names added in head that no package.json in base
 * depends on. Version bumps of existing dependencies and workspace packages
 * (`workspace:` specs) are not new.
 * @param {Change} change
 */
export function newDependencies({ basePackages, headPackages }) {
  const known = new Set(
    [...basePackages.values()].flatMap((pkg) => [...dependenciesOf(pkg).keys()]),
  );
  const added = new Set();
  for (const pkg of headPackages.values()) {
    for (const [name, spec] of dependenciesOf(pkg)) {
      if (!known.has(name) && !spec.startsWith("workspace:")) added.add(name);
    }
  }
  return [...added].sort();
}

/**
 * A package boundary changes when a package's public entry points or its
 * workspace dependencies change (ADR-001).
 * @param {Change} change
 */
function boundaryChanged({ changedFiles, basePackages, headPackages }) {
  return changedFiles
    .filter((file) => /^(packages|apps|fixtures)\/[^/]+\/package\.json$/.test(file))
    .some((file) => {
      const base = basePackages.get(file);
      const head = headPackages.get(file);
      const workspaceDeps = (/** @type {PackageJson | undefined} */ pkg) =>
        JSON.stringify(
          [...dependenciesOf(pkg)].filter(([, spec]) => spec.startsWith("workspace:")).sort(),
        );
      return (
        JSON.stringify(base?.exports) !== JSON.stringify(head?.exports) ||
        workspaceDeps(base) !== workspaceDeps(head)
      );
    });
}

/** @param {Change} change @returns {string[]} */
export function labelsFor(change) {
  const labels = [];
  const matches = (/** @type {RegExp[]} */ patterns) =>
    change.changedFiles.some((file) => patterns.some((pattern) => pattern.test(file)));
  if (matches(ARCHITEKT_PATHS) || boundaryChanged(change)) labels.push(ARCHITEKT);
  if (matches(SECURITY_PATHS) || newDependencies(change).length > 0) labels.push(SECURITY);
  return labels;
}

/** @param {string[]} args */
function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** @param {string} ref @returns {Map<string, PackageJson>} */
function packagesAt(ref) {
  const files = git("ls-tree", "-r", "--name-only", ref)
    .split("\n")
    .filter((file) => /(^|\/)package\.json$/.test(file) && !file.includes("node_modules/"));
  return new Map(
    files.map((file) => [
      file,
      /** @type {PackageJson} */ (JSON.parse(git("show", `${ref}:${file}`))),
    ]),
  );
}

function main() {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error("Usage: node scripts/review-labels.mjs <base-ref> <head-ref>");
    process.exit(2);
  }
  const changedFiles = git("diff", "--name-only", "--no-renames", base, head)
    .split("\n")
    .filter(Boolean);
  const labels = labelsFor({
    changedFiles,
    basePackages: packagesAt(base),
    headPackages: packagesAt(head),
  });
  for (const label of labels) console.log(label);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
