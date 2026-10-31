// Package boundaries and cycle rules from ADR-001
// (docs/architecture/adr/001-repo-structure.md, "Allowed dependencies").
// Workspace packages resolve through pnpm symlinks to their real path under
// packages/<name>/, so the rules below match on those paths.

/** Workspace packages and the workspace packages each may depend on. */
const ALLOWED = {
  "webmcp-adapter": [],
  "fram-core": ["webmcp-adapter"],
  "fram-cli": ["fram-core"],
  "fram-action": ["fram-core"],
};
const KNOWN = Object.keys(ALLOWED).join("|");

const boundaryRules = Object.entries(ALLOWED).map(([pkg, deps]) => ({
  name: `boundary-${pkg}`,
  comment: `ADR-001: ${pkg} may depend on ${deps.length ? deps.join(", ") : "no workspace package"}.`,
  severity: "error",
  from: { path: `^packages/${pkg}/` },
  to: { path: "^packages/", pathNot: `^packages/(${[pkg, ...deps].join("|")})/` },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...boundaryRules,
    {
      name: "boundary-unlisted-package",
      comment:
        "ADR-001: a package that is not in the allowed-dependencies table may not depend on other packages. Add it to the ADR and to ALLOWED first.",
      severity: "error",
      from: { path: `^packages/(?!(${KNOWN})/)([^/]+)/` },
      to: { path: "^packages/", pathNot: "^packages/$2/" },
    },
    {
      name: "fram-core-uses-adapter-driver-only",
      comment: "ADR-001: fram-core uses @iglo/webmcp-adapter/driver only, never the page side.",
      severity: "error",
      from: { path: "^packages/fram-core/" },
      to: { path: "^packages/webmcp-adapter/(src|dist)/(?!driver/)" },
    },
    {
      name: "adapter-page-is-self-contained",
      comment:
        "ADR-004: the page side runs inside the app under test and imports nothing (no Node, no npm, no driver code).",
      severity: "error",
      from: { path: "^packages/webmcp-adapter/src/page/" },
      to: { pathNot: "^packages/webmcp-adapter/src/page/" },
    },
    {
      name: "actions-toolkit-only-in-fram-action",
      comment: "ADR-001: only fram-action may use @actions/*.",
      severity: "error",
      from: { path: "^packages/(?!fram-action/)" },
      to: { path: "node_modules/@actions/" },
    },
    {
      name: "packages-not-to-apps-or-fixtures",
      comment: "ADR-001: nothing in packages/ may import from apps/ or fixtures/.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^(apps|fixtures)/" },
    },
    {
      name: "no-relative-import-across-packages",
      comment:
        "ADR-001: import other packages by name (@iglo/...), never by relative path into their directory.",
      severity: "error",
      from: { path: "^(packages|apps|fixtures)/([^/]+)/" },
      to: { dependencyTypes: ["local"], pathNot: "^$1/$2/" },
    },
    {
      name: "no-circular",
      comment: "ADR-001: no circular dependencies, inside or across packages.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "npm-dependency-declared",
      comment:
        "ADR-001: every imported npm package is declared in the importing package's own package.json.",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "not-to-unresolvable",
      comment: "An import that cannot be resolved hides a dependency from these rules.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "not-to-dev-dependency",
      comment: "Production code may not import devDependencies.",
      severity: "error",
      from: { path: "^packages/[^/]+/src/", pathNot: "\\.(test|spec)\\.[cm]?[jt]s$" },
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
    },
  ],
  options: {
    doNotFollow: { path: ["node_modules", "/dist/"] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types"],
    },
    combinedDependencies: false,
  },
};
