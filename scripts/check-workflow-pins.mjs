#!/usr/bin/env node
// ADR-006 supply-chain rules for workflows and action metadata:
//   1. every `uses:` is pinned to a full 40-character commit SHA
//      (local `./` actions and `docker://...@sha256:` images excepted);
//   2. no workflow uses the `pull_request_target` trigger.
// Usage: node scripts/check-workflow-pins.mjs [file ...]
// Without arguments it checks .github/workflows/* and every action.yml in the repo.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".turbo", "coverage"]);
const USES = /^\s*-?\s*uses:\s*["']?([^\s"'#]+)/;
const FULL_SHA_PIN = /@[0-9a-f]{40}$/;
const DOCKER_DIGEST_PIN = /^docker:\/\/[^@]+@sha256:[0-9a-f]{64}$/;
const PULL_REQUEST_TARGET = /(^|[\s[,-])pull_request_target\s*(:|,|\]|$)/;

/** @param {string} dir @returns {string[]} */
function findFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : findFiles(path);
    const isWorkflow = /[/\\]\.github[/\\]workflows[/\\][^/\\]+\.ya?ml$/.test(path);
    const isAction = /^action\.ya?ml$/.test(entry.name);
    return isWorkflow || isAction ? [path] : [];
  });
}

/** @param {string} line */
function withoutComment(line) {
  const hash = line.search(/(^|\s)#/);
  return hash === -1 ? line : line.slice(0, hash);
}

/** @param {string} file @returns {string[]} */
function check(file) {
  const problems = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((rawLine, index) => {
      const line = withoutComment(rawLine);
      const where = `${relative(ROOT, file)}:${index + 1}`;
      const ref = USES.exec(line)?.[1];
      if (ref && !ref.startsWith("./")) {
        const pinned = ref.startsWith("docker://")
          ? DOCKER_DIGEST_PIN.test(ref)
          : FULL_SHA_PIN.test(ref);
        if (!pinned) problems.push(`${where}: "${ref}" is not pinned to a full commit SHA`);
      }
      if (PULL_REQUEST_TARGET.test(line)) {
        problems.push(`${where}: pull_request_target is not allowed (ADR-006)`);
      }
    });
  return problems;
}

const files = process.argv.length > 2 ? process.argv.slice(2) : findFiles(ROOT);
const problems = files.flatMap(check);
for (const problem of problems) console.error(problem);
if (problems.length > 0) {
  console.error(
    `\n${problems.length} problem(s). See docs/architecture/adr/006-ci-cd.md, "CI for the Iglo monorepo".`,
  );
  process.exit(1);
}
console.log(`Checked ${files.length} file(s): all uses: pinned, no pull_request_target.`);
