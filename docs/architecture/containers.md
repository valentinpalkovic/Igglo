# Containers and packages

Source: [ADR-001](adr/001-repo-structure.md). Arrows are the only allowed workspace dependencies. dependency-cruiser enforces them in CI. Dashed boxes are reserved and do not exist yet.

```mermaid
flowchart TD
  subgraph packages
    adapter["@iglo/webmcp-adapter<br/>/page: injected WebMCP implementation<br/>/driver: list, call, watch tools"]
    core["@iglo/fram-core<br/>explorer, findings, run export"]
    cli["@iglo/fram-cli"]
    action["@iglo/fram-action<br/>JavaScript action, node24"]
  end
  subgraph reserved["reserved (later ADRs)"]
    ui["packages/ui (ADR-003)"]:::reserved
    docs["apps/docs (ADR-002)"]:::reserved
    demos["apps/demos"]:::reserved
  end
  fixtures["fixtures/*<br/>test apps for CI"]

  core --> adapter
  cli --> core
  action --> core
  fixtures -. "may use" .-> packages

  pw[["playwright-core (npm)"]]
  adapter --> pw
  core --> pw

  classDef reserved stroke-dasharray: 5 5;
```

Release path of the Action: `main` (source only) → release workflow (esbuild + `pnpm deploy --prod`) → branch `release/fram-action` → tags `fram-action-vX.Y.Z` and `fram-action-vX`.
