# System context

Source: [ADR-004](adr/004-webmcp-adapter.md), [ADR-007](adr/007-fram-mvp.md) and the Fram MVP scope in [IGL-40](/IGL/issues/IGL-40). The MVP has no Iglo backend: everything runs inside the CI runner of the repo under test.

```mermaid
flowchart LR
  dev(["Developer of the app under test"])
  gh["GitHub<br/>pull requests, Actions, artifacts"]

  subgraph runner["GitHub Actions runner (repo under test)"]
    action["Fram Action<br/>(@iglo/fram-action)"]
    core["fram-core"]
    driver["webmcp-adapter /driver"]
    subgraph browser["Playwright Chromium"]
      shim["webmcp-adapter /page<br/>injected ModelContext<br/>(document + navigator)"]
      app["App under test<br/>(calls registerTool)"]
    end
    server["App dev/preview server<br/>(start command)"]
  end

  dev -- "opens PR" --> gh
  gh -- "pull_request / push to main" --> action
  action --> core --> driver
  driver -- "addInitScript, evaluate, binding" --> shim
  app -- "registerTool / executeTool" --> shim
  browser -- "HTTP" --> server
  action -- "job summary, artifacts fram-run + fram-observations" --> gh
  gh -- "PR run: baseline artifacts of the main run for the base SHA (actions: read)" --> action
  core -- "reset hook before every edge" --> server
```

Not in the MVP: Iglo-hosted services (ADR-005), dashboards, LLMs.
