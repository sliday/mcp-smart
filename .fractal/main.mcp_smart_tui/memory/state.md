---
name: state
desc: Current implementation state, verified source boundaries, and the next executable gate.
tags: [state, mcp_smart]
sources:
  - docs/superpowers/plans/2026-08-26-mcp-smart-usability-tui.md
created: 2026-08-25T23:20:37Z
updated: 2026-08-25T23:20:37Z
---

# state

The branch is clean and contains only the approved plan/spec seed. No child
nodes exist. The implementation plan is
`.fractal/main.mcp_smart_tui/plans/2026-08-25T23:19:02.894Z-3.1-usability_tui_release.md`.

Verified source boundaries:

- `src/index.ts` eagerly constructs `SmartAdvisorServer` and calls its
  argument-free `run()`.
- `SmartAdvisorServer` reads `OPENROUTER_API_KEY` in its argument-free
  constructor and exposes public `listTools()`, `callTool(name, args)`, and
  `run()`.
- Existing tests advertise seven tools and require `model`; these are stale
  against the binding canonical-tool contract.
- The package targets Node 16 and lacks React, Ink, JSX, and command modules.

The parent-owned dispatcher boundary is committed at `ff7d30a`. The full parent
baseline gate passes 50 tests and TypeScript compilation. `routing_mcp` is
active from that committed boundary with a local branch, inherited scripts,
exclusive ownership of routing/OpenRouter/MCP files, and a 4.5 run cap.

The next integration gate is to monitor its status/spend/outbox, inspect its
committed three-dot diff and TDD evidence, re-run its focused tests from
committed bytes, and merge only if Tasks 2–4 match the binding spec.

The child reported setup-induced dirty state outside its project ownership.
Parent direction is to restore `package-lock.json` to the child baseline and
allow only the normal Fractal commit path to capture Codex-injected child seed
skills. The radio item stays saved until the child confirms a clean ownership
boundary or reports a scope-gate failure.
