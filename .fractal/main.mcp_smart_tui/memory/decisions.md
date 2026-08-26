---
name: decisions
desc: Binding implementation rulings and their rework risks for the usability release.
tags: [implementation, contracts]
sources:
  - docs/superpowers/specs/2026-08-26-mcp-smart-usability-tui-design.md
created: 2026-08-25T23:20:37Z
updated: 2026-08-26T00:05:00Z
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
| Close the routing dirty-state gate only after verifying the child worktree directly. | The child state now confirms and `git status` proves that `package-lock.json` is restored, so keeping the radio item saved would preserve a false blocker. | Low; regenerated setup drift would be visible again at the child’s clean ownership gate. |
| Do not pre-spawn command or TUI children while routing is active. | Both consume interfaces produced by the preceding merge, and current budget is sufficient only with reviewed sequential handoffs. | Low; this sacrifices speculative parallel speed to avoid stale-contract rework. |
| Treat a coherent committed routing boundary as mandatory even near the child budget reserve. | Parent review and reproducible tests require committed bytes; absorbing unfinished child-owned implementation would violate ownership and hide missing evidence. | Medium; an incomplete child may require a narrowly priced continuation and reduce parent reserve. |
| Continue `routing_mcp` after its planning-only reserve exit instead of merging or absorbing its work. | The child produced no owned TypeScript or TDD evidence, so there is nothing implementation-complete to integrate and parent-side absorption would violate the assigned topology. | Medium; another routing run consumes integration reserve, but preserves ownership and auditability. |
| Block the routing merge on transport cancellation, stable MCP errors, real metadata normalization, and permanent-error circuit isolation even after its first clean test gate. | Independent review found that forwarding an `AbortSignal` alone was insufficient evidence, thrown domain errors lose their typed contract over MCP transport, documented OpenRouter metadata is nested, and non-transient failures can poison provider health. | Medium; the narrow child continuation consumes reserve, but merging first would force cross-owner rework during TUI integration. |
| Preserve only the binding `smart-auto` legacy route in the new resolver, not every undocumented legacy strategy token. | The design explicitly retains the GPT-5 Mini route as `smart-auto`, while compatibility acceptance names the seven tool aliases rather than old strategy values. | Medium; clients relying on undocumented strategy tokens may need a later migration ruling. |
| Parse only observed OpenRouter metadata and keep missing receipt fields absent. | Official OpenRouter API documentation places metadata under `openrouter_metadata`, with provider selection in `endpoints.available` and Auto classification in `pipeline[].data.task_type`; the spec forbids invented metadata. | Low; future metadata schema changes remain isolated to the normalizer and its fixture tests. |
| Merge routing only after a direct child execution session closed the specialist findings and a detached checkout passed 62 tests. | Small Fractal continuation iterations repeatedly exhausted their allowance during mandatory planning, so a direct node-scoped session was the only trimmed correction mechanism that preserved child ownership and the tree budget. | Low; all source changes remain on the child branch with focused RED/GREEN and labelled commits. |
