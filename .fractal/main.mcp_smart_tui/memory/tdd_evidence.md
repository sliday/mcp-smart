---
name: tdd_evidence
desc: Focused RED and GREEN evidence for parent-owned usability behaviors.
tags: [tdd, verification]
sources:
  - src/__tests__/cli.test.ts
created: 2026-08-25T23:24:59Z
updated: 2026-08-25T23:24:59Z
---

# tdd_evidence

## Dispatcher boundary

Verified before the test:

- `src/index.ts` eagerly imported and constructed `SmartAdvisorServer`.
- The server constructor takes no arguments and immediately reads
  `process.env.OPENROUTER_API_KEY`.
- Public `run()` takes no arguments; `listTools()` and `callTool(name, args)`
  are also public and must remain source-compatible.
- No `src/cli.ts` existed.

RED command: `npm test -- --run src/__tests__/cli.test.ts`

RED result: Vitest failed before collecting tests because `../cli.js` could not
be resolved. This is the expected missing dispatcher module, not an unrelated
assertion or environment failure.

GREEN commands:

- `npm test -- --run src/__tests__/cli.test.ts`
- `npm run build`

GREEN result: all three dispatcher tests passed and TypeScript compiled without
diagnostics. The tested behaviors are default MCP parsing, help without a key or
server construction, and version output without a key or server construction.

Adjacent baseline gate:

`bash .fractal/main.mcp_smart_tui/scripts/test.sh` passed with 50 tests across
four files, a successful TypeScript build, and a clean whitespace diff. Existing
server tests emit verbose diagnostic logs; clean final output remains an
integration requirement after the routing/MCP refactor.

Review re-validation: after aligning `@types/node` to the Node 22 runtime floor,
`npm run build`, the three focused CLI tests, and `git diff --check` all pass.
