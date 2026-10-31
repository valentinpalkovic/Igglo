// @ts-check
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * ADR-004: all access to WebMCP's `modelContext` goes through
 * packages/webmcp-adapter, so a spec change hits one package only.
 * The selectors catch member access (`document.modelContext`), string keys
 * (`document["modelContext"]`, `Reflect.get(x, "modelContext")`,
 * `"modelContext" in navigator`), template keys and destructuring
 * (`const { modelContext } = navigator`).
 */
const MODEL_CONTEXT_MESSAGE =
  "Access WebMCP only through @iglo/webmcp-adapter (ADR-004, docs/architecture/adr/004-webmcp-adapter.md).";
const modelContextRule = /** @type {const} */ ([
  "error",
  { selector: "Identifier[name='modelContext']", message: MODEL_CONTEXT_MESSAGE },
  { selector: "Literal[value='modelContext']", message: MODEL_CONTEXT_MESSAGE },
  { selector: "TemplateElement[value.cooked='modelContext']", message: MODEL_CONTEXT_MESSAGE },
]);

export default defineConfig(
  globalIgnores(["**/dist/", "**/.turbo/", "**/coverage/"]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: { "no-restricted-syntax": modelContextRule },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    // The adapter is the one place that touches modelContext. Fixtures are
    // apps under test, so they register tools the way real apps do.
    files: ["packages/webmcp-adapter/**", "fixtures/**"],
    rules: { "no-restricted-syntax": "off" },
  },
);
