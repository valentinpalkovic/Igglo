#!/usr/bin/env node
// Usage: node cli.mjs <path-to-app-module> [--enum-order reversed]
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { explore } from "./explore.mjs";

function parseArgs(argv) {
  let modulePath;
  let enumOrder = "declared";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--enum-order") {
      enumOrder = argv[++i];
      if (enumOrder !== "declared" && enumOrder !== "reversed") {
        throw new Error(`--enum-order must be "declared" or "reversed", got ${enumOrder}`);
      }
    } else if (modulePath === undefined) {
      modulePath = argv[i];
    } else {
      throw new Error(`Unexpected argument: ${argv[i]}`);
    }
  }
  if (!modulePath) throw new Error("Usage: node cli.mjs <path-to-app-module> [--enum-order reversed]");
  return { modulePath, enumOrder };
}

try {
  const { modulePath, enumOrder } = parseArgs(process.argv.slice(2));
  const app = await import(pathToFileURL(resolve(modulePath)).href);
  if (typeof app.load !== "function") throw new Error(`${modulePath} does not export load()`);
  const report = await explore(app.load, { enumOrder });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} catch (err) {
  process.stderr.write(`fram-core: ${err.message}\n`);
  process.exitCode = 1;
}
