---
name: architecture/runtime_dispatch
desc: CLI-to-runtime boundary that preserves stdio MCP while lazy-loading interactive UI code.
tags: [architecture, cli, mcp]
sources:
  - src/cli.ts
  - src/index.ts
created: 2026-08-25T23:27:00Z
updated: 2026-08-25T23:27:00Z
---

# architecture/runtime_dispatch

`src/index.ts` is a thin executable wrapper around
`runCli(process.argv.slice(2), process.env)`. The dispatcher preserves the
no-argument stdio MCP behavior by constructing `SmartAdvisorServer` only in the
`mcp` branch. Help and version return without server construction, so neither
requires `OPENROUTER_API_KEY`.

The `tui` branch uses a dynamic module path and imports the Ink entry point only
after command selection. This keeps React and Ink out of normal stdio MCP,
help, and version startup. The setup, doctor, and ask modules are also imported
only after the dispatcher selects their command.

The supported runtime floor and development declarations are Node 22. React 19
and Ink 7 are package dependencies because the published executable loads them
for the interactive branch; Ink test utilities and React declarations remain
development dependencies.
