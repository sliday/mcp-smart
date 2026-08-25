---
name: state
desc: Current routing, OpenRouter, and MCP contract implementation state and verified interfaces.
created: 2026-08-25T23:31:41Z
updated: 2026-08-25T23:31:41Z
---

# state

## Scope

The node owns only `src/contracts.ts`, `src/openrouter.ts`,
`src/SmartAdvisorServer.ts`, and their four named test files. The execution order
is shared contracts, OpenRouter client, then MCP adapter compatibility.

## Verified baseline

- The contract and OpenRouter source/test files are absent.
- `SmartAdvisorServer.ts` imports MCP `Server`, `StdioServerTransport`,
  `CallToolRequestSchema`, and `ListToolsRequestSchema`; Axios is imported as the
  default client plus `AxiosError`.
- Public server methods are `listTools()`, `callTool(name: string, args: any)`,
  `getHealthCheck()`, and `run()` with no arguments.
- Current MCP behavior advertises seven aliases, requires `model` plus `task`,
  rewrites whitespace, uses a provider/task/context text cache, and returns only
  text content.
- Installed MCP SDK 1.15.1 declarations allow tool `outputSchema` and optional
  object `structuredContent` on call results. Installed Axios declarations expose
  three-argument `post<T>`, timeout/abort configuration, and `AxiosError`
  response/status/code fields.
- Callable-tool discovery exposes no Context7 tool. The documentation call path
  is stopped; installed declarations and tests are the verified fallback.
- A parent directive restored the incidental `package-lock.json` engine diff to
  this branch's HEAD. No parent- or sibling-owned project change remains. The
  node-local `.system/` skill directory is generated seed state and remains
  hand-edit-free for the normal Fractal lifecycle.

## Binding decisions

- Auto defaults are `openrouter/auto`, Balanced, medium, and plugin ID
  `auto-router`; direct models have no plugin.
- Provider-omitted request/provider/cost/usage/classification/fallback metadata
  remains absent even where an illustrative type shows a required field.
- Existing prompt strings remain intact, and raw task/context whitespace reaches
  OpenRouter unchanged.
- Cache identity uses a fixed-order serialization of prompt version, intent,
  resolved route, restrictions, max tokens, task, and context. `fresh` bypasses
  reads only.

## Working checklist

Planning, source/declaration inspection, and the Context7-blocker report are
complete. No owned TypeScript source or test file has been edited, and no focused
RED/GREEN run exists yet. Tasks 2–4 remain unstarted.

- Capture focused RED/GREEN evidence for contracts.
- Capture focused RED/GREEN evidence for OpenRouter request, receipt, retry, and
  error behavior.
- Capture focused RED/GREEN evidence for canonical MCP tools, diagnostics,
  hidden aliases, cache behavior, and stable local errors.
- Run focused suites, build, diff checks, node test script, commit, and finish.
