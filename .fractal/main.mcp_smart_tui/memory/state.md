---
name: state
desc: Current implementation state and verified source boundaries for the usability release.
tags: [state, mcp_smart]
sources:
  - docs/superpowers/plans/2026-08-26-mcp-smart-usability-tui.md
created: 2026-08-25T23:20:37Z
updated: 2026-08-26T00:05:00Z
---

# state

The parent branch contains the committed dispatcher boundary plus the approved
plan/spec seed. Parent memory and the routing-integration plan are the only
uncommitted files while child review is active.

Current source boundaries:

- `src/index.ts` delegates to `runCli`, while `src/cli.ts` constructs
  `SmartAdvisorServer` only for stdio MCP and dynamically imports the TUI only
  for the `tui` command.
- `SmartAdvisorServer` still exposes public `listTools()`,
  `callTool(name, args)`, and argument-free `run()`; the routing child keeps
  those source boundaries while replacing the internal contracts.
- The package and declarations target Node 22 and include React 19, Ink 7, JSX,
  and the focused dispatcher tests.

The parent-owned dispatcher boundary is committed at `ff7d30a`; its baseline
gate passes 50 tests and TypeScript compilation. `routing_mcp` delivered Tasks
2–4 at `920e96d`, including focused RED/GREEN evidence and an optional Axios
`AbortSignal`. An independent detached-worktree gate passes 49 tests and the
TypeScript build.

The reviewed routing boundary is merged. Its detached-checkout gate passes 62
tests and TypeScript compilation. It prevents non-transient failures from
opening the circuit breaker, restores test environment state, resolves the
binding `smart-auto` route, preserves typed errors over actual MCP transport,
rejects malformed successful provider payloads, normalizes documented
`openrouter_metadata`, and forwards cancellation to Axios. The child branch and
worktree remain available as required.

The command child is the next sequential boundary. It must fork this merged
state and may edit only `src/commands/` and `src/__tests__/commands.test.ts`;
parent wiring in `src/cli.ts` remains separate.
