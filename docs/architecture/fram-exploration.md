# Fram exploration loop

Source: [ADR-007](adr/007-fram-mvp.md), section 1. One loop per declared context. Contexts are explored one after another in the MVP, in canonical order of their names.

```mermaid
flowchart TD
  start(["Context C (name, tags, setup)"]) --> s0["Fresh edge: new BrowserContext, reset hook,<br/>load app, run setup → initial state S0 = (C, tool set)"]
  s0 --> q[["Queue of states (breadth-first)"]]
  q --> pick{"Next unexpanded state S?<br/>and limits not hit"}
  pick -- no --> done(["Context done<br/>(partial if a limit was hit)"])
  pick -- yes --> reads["Reads, 2 rounds: each read-only tool × each input candidate<br/>(pool values first, then one schema value; canonical order)<br/>→ outputs feed the value pool of C"]
  reads --> writes["Writes: each other tool × each input candidate"]
  writes --> edge["Each call is its own edge: fresh BrowserContext, reset,<br/>load, setup, replay shortest path to S, call"]
  edge --> checks["Checks: tool threw, page error, dead end,<br/>permission rule for C's tags"]
  checks --> wr{"Write that did not throw?"}
  wr -- yes --> rr["Same session: re-run all read-only tools,<br/>touched values first → observations (for the base-vs-PR diff)"]
  wr -- no --> ns
  rr --> ns{"Tool set new for C?"}
  ns -- yes --> enq["Record shortest path, queue (C, new tool set)"] --> q
  ns -- no --> q
```

The value pool belongs to one context, and a pooled value is used only in edges whose path starts with the path that produced it; values from a write stay in that session. Finding IDs are computed from (type, tool, signature) only, never from the context, path, input or order (ADR-007, section 4).
