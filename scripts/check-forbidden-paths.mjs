#!/usr/bin/env node
// Review gate 1 (handbook, Code review): no node_modules, build output or
// tool caches in git. .gitignore keeps them out locally; this check fails CI
// if one is committed anyway (e.g. with `git add -f`).
// Usage: node scripts/check-forbidden-paths.mjs   (checks `git ls-files`)
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** A tracked path is forbidden if any of its directory segments is listed here. */
export const FORBIDDEN_DIRS = [
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".nx",
  ".cache",
  ".pnpm-store",
  ".eslintcache",
  "playwright-report",
  "test-results",
  "blob-report",
  "storybook-static",
];

/** Forbidden file names, matched against the last path segment. */
const FORBIDDEN_FILES = [/\.tsbuildinfo$/, /^\.eslintcache$/, /^\.DS_Store$/];

/** @param {string} path @returns {boolean} */
export function isForbidden(path) {
  const segments = path.split("/");
  const name = segments.at(-1) ?? "";
  return (
    segments.slice(0, -1).some((segment) => FORBIDDEN_DIRS.includes(segment)) ||
    FORBIDDEN_FILES.some((pattern) => pattern.test(name))
  );
}

function main() {
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const forbidden = tracked.filter(isForbidden);
  for (const path of forbidden) console.error(`${path}: build output or tool cache is tracked`);
  if (forbidden.length > 0) {
    console.error(
      `\n${forbidden.length} forbidden path(s). Remove them with \`git rm -r --cached <path>\` ` +
        "and make sure .gitignore covers them.",
    );
    process.exit(1);
  }
  console.log(`Checked ${tracked.length} tracked file(s): no build output or tool caches.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
