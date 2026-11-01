# fixtures

Test apps that Fram runs against in CI. Fixtures are apps under test, so they may use `modelContext` directly (ADR-004). Nothing in `packages/` may import from here (ADR-001).

| Fixture | What it is |
| --- | --- |
| [`ledger/`](ledger/) | The IGL-28 expense app with seeded bugs B1–B8, and Fram's acceptance spec (ADR-007, section 10). |
