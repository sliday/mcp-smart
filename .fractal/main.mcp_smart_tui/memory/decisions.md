---
name: decisions
desc: Binding implementation rulings and their rework risks for the usability release.
tags: [implementation, contracts]
sources:
  - docs/superpowers/specs/2026-08-26-mcp-smart-usability-tui-design.md
created: 2026-08-25T23:20:37Z
updated: 2026-08-25T23:20:37Z
---

# decisions

| Choice | Reason | Rework risk |
| --- | --- | --- |
| Treat the design spec as authoritative over plan examples. | The node contract explicitly makes the spec binding when the plan leaves room for judgment. | Low; only a later written spec revision should change this. |
| Execute dispatcher, routing/MCP, commands, and TUI serially, with the parent integrating between children. | Each child requires the previous merged interfaces, so simultaneous children would fork stale contracts. | Low; parallelizing now would create predictable merge/interface rework. |
| Reserve child caps of 4.5, 2.5, and 4.5, leaving more than 8.3 of the current subtree budget for parent work and wind-down. | Routing/MCP and TUI carry more behavioral depth than the pure command modules; integration still needs a substantial reserve. | Medium; soft caps can overshoot, so active spend monitoring is required. |
| Preserve public `SmartAdvisorServer.run()`, `listTools()`, and `callTool(name, args)` signatures while replacing their internal contracts. | Source-compatible dispatch and hidden alias support depend on these boundaries. | Medium; child refactoring must not accidentally make the adapter test-only or constructor-injected in an incompatible way. |
| Re-check Context7 availability before dependency API assumptions and do not guess if it remains unavailable. | The runtime exposes no Context7 tool, MCP resource, or template despite the binding documentation requirement. | High; Ink 7 or MCP SDK assumptions made without current docs could cause late integration failures. |
| Keep all three child branches and worktrees after merge. | The release contract requires their audit evidence to remain available. | Low; cleanup automation must not retire them. |
| Align `@types/node` with the Node 22 runtime floor. | Review found that the dispatcher commit raised `engines.node` but left development declarations on Node 20. | Low; the focused CLI tests and build pass with Node 22 declarations. |
| Require children to restore setup-induced changes to parent-owned project files while allowing normal Fractal commits to capture runtime-injected child seed files. | `routing_mcp` setup normalized the root lock metadata and Codex injected its own `.system` skills; only the latter belongs to the child lifecycle. | Medium; if the scope gate rejects injected seed state, the parent must normalize Fractal configuration without weakening file ownership. |
