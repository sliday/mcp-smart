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

The command child delivered and the parent reviewed and merged its pure command
boundary. Source preflight for parent wiring verified `runInit(options = {})`,
`runDoctor(options = {})`, and `runAsk(task, options = {})`. The notable plan
discrepancy is that `AskOptions` flattens the optional `ConsultInput` fields
instead of nesting them under `input`; parent CLI wiring must pass task separately
and route settings directly. `runDoctor` uses `probeOpenRouter` for dependency
injection and already skips it when the process environment lacks a key.

Parent CLI tests currently cover only default MCP parsing, help, and version;
they contain no command-result formatting seam. The next TDD slice adds an
optional dependency object to `runCli` while preserving its existing two-argument
call signature, then proves init/doctor/ask text and JSON dispatch.

CLI integration RED evidence: `npm test -- --run src/__tests__/cli.test.ts`
ran seven tests with the three existing dispatcher cases green and four new
command cases failing at the expected placeholder branches (`init`, `doctor`,
and both `ask` forms reported “not available in this build”). No provider call
was attempted.

CLI integration GREEN evidence: the parent added an optional command dependency
seam, human text formatting, machine JSON formatting, and answer-before-receipt
output. `npm test -- --run src/__tests__/cli.test.ts
src/__tests__/commands.test.ts` passes 12/12 and `npm run build` passes. The
first build exposed that the typed `ConsultationReceipt` intentionally lacks a
string index signature; narrowing the formatter input from
`Record<string, unknown>` to `object` preserved optional-field omission and made
the build green. Non-interactive smokes for `init --json`, missing-key `doctor
--json`, `--help`, and `--version` all exit successfully without a key.

The command boundary’s authenticated Doctor probe was corrected after review.
Official OpenRouter documentation identifies `GET /api/v1/key` as the current
authenticated-key endpoint and lists 401 for unauthorized credentials; the model
catalog is not sufficient proof of key validity. The retained command child
captured RED/GREEN and committed the endpoint plus mocked 401 regression at
`58290ed`; the parent merged it as `41b7491`. Focused command/CLI verification
passes 17/17 plus TypeScript build.

The Ink child delivered its initial TUI commit `c42abe3` with 9 focused and 80
full tests. It remains active on a narrow review-correction pass for default Ink
exit behavior, real Shift+Enter coverage, and terminal punctuation. Do not merge
the child until that correction commit, clean ownership state, keyboard and
cancellation review, and an independent focused/build gate are complete. The
child branch/worktree remain available.
