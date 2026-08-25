# MCP Smart Usability and TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Node 22 release with guided CLI commands, an Ink terminal interface, one canonical MCP consultation tool, OpenRouter Auto routing, and typed execution receipts.

**Architecture:** A command dispatcher selects stdio MCP, CLI commands, or the lazy-loaded TUI before constructing the server. Shared contracts and an OpenRouter client separate routing and response normalization from the MCP adapter. The parent establishes shared interfaces, then Fractal children own non-overlapping file groups and merge only after their focused tests pass.

**Tech Stack:** Node.js 22, TypeScript ESM, MCP SDK, Axios, Ink 7, React 19, Vitest

**Spec:** `docs/superpowers/specs/2026-08-26-mcp-smart-usability-tui-design.md`

## Global Constraints

- Require Node.js 22 or newer.
- Preserve `mcp-smart` with no arguments as the stdio MCP entry point.
- Load Ink and React only for `mcp-smart tui`.
- Read `OPENROUTER_API_KEY` from the process environment and never persist it.
- Advertise `consult`, `smart_doctor`, and `smart_status`; accept legacy aliases without advertising them.
- Default consultations to `openrouter/auto` with the `auto-router` plugin.
- Preserve task whitespace, indentation, and code fences.
- Return human-readable content and typed receipt data.
- Stop retries after three attempts and stop at the first rate-limit or quota signal.
- Do not modify `AGENTS.md`, `.channels_cache_v2.json`, or `codedb.snapshot`.

## Fractal Topology

The top-level `mcp_smart_tui` node owns integration and may spawn three children after Task 1 fixes shared interfaces:

| Child | Owned files |
| --- | --- |
| `routing_mcp` | `src/contracts.ts`, `src/openrouter.ts`, `src/SmartAdvisorServer.ts`, related tests |
| `cli_commands` | `src/commands/`, command tests |
| `ink_tui` | `src/tui/`, TUI tests |

The parent owns `package.json`, `package-lock.json`, `tsconfig.json`, `src/index.ts`, `src/cli.ts`, CLI dispatcher tests, README updates, full-suite verification, and merges. After merging `cli_commands`, the parent wires its pure command functions into `src/cli.ts`. One node writes each file.

---

### Task 1: Runtime, dependency, and dispatcher boundary

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `src/index.ts`
- Create: `src/cli.ts`
- Create: `src/__tests__/cli.test.ts`

**Interfaces:**
- Produces: `parseCommand(argv: string[]): CliCommand`
- Produces: `runCli(argv: string[], env: NodeJS.ProcessEnv): Promise<number>`
- Consumes: `SmartAdvisorServer.run()` for the default MCP path

- [ ] **Step 1: Verify current source signatures before editing tests**

Read `src/index.ts`, `src/SmartAdvisorServer.ts` around `run()`, `package.json`, and `tsconfig.json`. Record that the current entry point constructs `SmartAdvisorServer` before inspecting arguments and that `run()` accepts no arguments.

- [ ] **Step 2: Write failing dispatcher tests**

```ts
import {describe, expect, it, vi} from 'vitest';
import {parseCommand, runCli} from '../cli.js';

describe('CLI dispatch', () => {
  it('selects MCP when no command is supplied', () => {
    expect(parseCommand([])).toEqual({name: 'mcp'});
  });

  it('prints help without an API key', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await expect(runCli(['--help'], {})).resolves.toBe(0);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('mcp-smart tui'));
    write.mockRestore();
  });
});
```

- [ ] **Step 3: Run the dispatcher tests and confirm RED**

Run: `npm test -- --run src/__tests__/cli.test.ts`

Expected: FAIL because `src/cli.ts` does not exist.

- [ ] **Step 4: Add Node 22 and Ink dependencies**

Set `engines.node` to `>=22.0.0`. Add `ink`, `react`, and `ink-testing-library`; add `@types/react` as a development dependency. Set TypeScript JSX to `react-jsx` without reformatting unrelated compiler options.

- [ ] **Step 5: Implement command parsing and lazy dispatch**

```ts
export type CliCommand =
  | {name: 'mcp'}
  | {name: 'help'}
  | {name: 'version'}
  | {name: 'tui'}
  | {name: 'init'; json: boolean}
  | {name: 'doctor'; json: boolean}
  | {name: 'ask'; task: string; json: boolean};

export function parseCommand(argv: string[]): CliCommand {
  if (argv.length === 0) return {name: 'mcp'};
  if (argv.includes('--help') || argv[0] === 'help') return {name: 'help'};
  if (argv.includes('--version')) return {name: 'version'};
  const json = argv.includes('--json');
  if (argv[0] === 'tui') return {name: 'tui'};
  if (argv[0] === 'init') return {name: 'init', json};
  if (argv[0] === 'doctor') return {name: 'doctor', json};
  if (argv[0] === 'ask') return {name: 'ask', task: argv.filter(value => value !== '--json').slice(1).join(' '), json};
  throw new Error(`Unknown command: ${argv[0]}`);
}
```

`runCli` must import `./tui/index.js` only inside the `tui` branch and construct `SmartAdvisorServer` only inside the `mcp` branch.

- [ ] **Step 6: Update the executable entry point**

```ts
#!/usr/bin/env node
import {runCli} from './cli.js';

process.exitCode = await runCli(process.argv.slice(2), process.env).catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  return 1;
});
```

- [ ] **Step 7: Run tests and build, then confirm GREEN**

Run: `npm test -- --run src/__tests__/cli.test.ts && npm run build`

Expected: PASS and a successful TypeScript build.

- [ ] **Step 8: Commit the dispatcher boundary**

```bash
git add package.json package-lock.json tsconfig.json src/index.ts src/cli.ts src/__tests__/cli.test.ts
git commit -m "feat: add command dispatcher and Node 22 runtime"
```

### Task 2: Shared consultation contracts and cache identity

**Files:**
- Create: `src/contracts.ts`
- Create: `src/__tests__/contracts.test.ts`

**Interfaces:**
- Produces: `ConsultInput`, `ConsultationResult`, `ConsultationReceipt`, `SmartErrorDetails`
- Produces: `resolveRoute(input: ConsultInput): ResolvedRoute`
- Produces: `buildConsultationCacheKey(input: ConsultInput, promptVersion: string): string`

- [ ] **Step 1: Write failing contract tests**

```ts
import {describe, expect, it} from 'vitest';
import {buildConsultationCacheKey, resolveRoute} from '../contracts.js';

describe('consultation contracts', () => {
  it('defaults to balanced OpenRouter Auto', () => {
    expect(resolveRoute({task: 'Review this'})).toMatchObject({
      model: 'openrouter/auto',
      preset: 'balanced',
      costTier: 'medium',
      pluginId: 'auto-router',
    });
  });

  it('separates cache entries by intent and route', () => {
    const advice = buildConsultationCacheKey({task: 'x', intent: 'advice'}, 'v2');
    const review = buildConsultationCacheKey({task: 'x', intent: 'code-review'}, 'v2');
    expect(advice).not.toBe(review);
  });
});
```

- [ ] **Step 2: Run contract tests and confirm RED**

Run: `npm test -- --run src/__tests__/contracts.test.ts`

Expected: FAIL because the contracts module does not exist.

- [ ] **Step 3: Implement exact shared types**

Define the spec's `ConsultInput`, receipt, result, and error types. Add this resolved route:

```ts
export interface ResolvedRoute {
  model: string;
  preset: 'fast' | 'balanced' | 'best' | 'custom';
  costTier?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  pluginId?: 'auto-router';
  allowedModels?: string[];
  excludedModels?: string[];
}
```

Build cache identity from a stable JSON array containing prompt version, intent, model, preset, cost tier, allowed models, excluded models, maximum tokens, task, and context.

- [ ] **Step 4: Run contract tests and confirm GREEN**

Run: `npm test -- --run src/__tests__/contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit shared contracts**

```bash
git add src/contracts.ts src/__tests__/contracts.test.ts
git commit -m "feat: define consultation contracts"
```

### Task 3: OpenRouter Auto client and typed receipts

**Files:**
- Create: `src/openrouter.ts`
- Create: `src/__tests__/openrouter.test.ts`

**Interfaces:**
- Consumes: `ConsultInput`, `ResolvedRoute`, `ConsultationResult`
- Produces: `OpenRouterClient.consult(input: ConsultInput): Promise<ConsultationResult>`
- Produces: `normalizeOpenRouterError(error: unknown): SmartErrorDetails`

- [ ] **Step 1: Write failing request-shape and receipt tests**

```ts
import axios from 'axios';
import {describe, expect, it, vi} from 'vitest';
import {OpenRouterClient} from '../openrouter.js';

vi.mock('axios');

it('sends Auto settings and returns a receipt', async () => {
  vi.mocked(axios.post).mockResolvedValue({
    data: {
      id: 'gen-1',
      model: 'anthropic/claude-sonnet-4.5',
      choices: [{message: {content: 'Answer'}}],
      usage: {prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.01},
    },
    headers: {'x-request-id': 'req-1'},
  });

  const client = new OpenRouterClient({apiKey: 'test-key'});
  const result = await client.consult({task: 'Review this'});

  expect(axios.post).toHaveBeenCalledWith(
    'https://openrouter.ai/api/v1/chat/completions',
    expect.objectContaining({
      model: 'openrouter/auto',
      plugins: [{id: 'auto-router', cost_tier: 'medium'}],
      usage: {include: true},
    }),
    expect.any(Object),
  );
  expect(result.receipt).toMatchObject({selectedModel: 'anthropic/claude-sonnet-4.5', costUsd: 0.01});
});
```

- [ ] **Step 2: Run OpenRouter tests and confirm RED**

Run: `npm test -- --run src/__tests__/openrouter.test.ts`

Expected: FAIL because `OpenRouterClient` does not exist.

- [ ] **Step 3: Implement the request builder and response normalizer**

Send `messages`, `session_id`, Auto plugins, `usage.include`, `max_tokens`, and `X-OpenRouter-Metadata: enabled`. Direct model IDs must omit Auto plugins. Measure latency with `Date.now()` and use absent optional fields when OpenRouter omits metadata.

- [ ] **Step 4: Implement stable error normalization and retry limits**

Map status 401 to `AUTHENTICATION_FAILED`, 402 to `INSUFFICIENT_CREDITS`, 404 to `NO_ELIGIBLE_MODEL`, 408 and client timeouts to `REQUEST_TIMEOUT`, 429 to `PROVIDER_RATE_LIMITED`, and 503 to `NO_PROVIDER_AVAILABLE`. Copy `Retry-After` into `retryAfterMs` when present.

Add tests that prove the client stops at the first 402 or 429 response and never exceeds three attempts for transient timeouts or 503 responses.

- [ ] **Step 5: Run OpenRouter tests and confirm GREEN**

Run: `npm test -- --run src/__tests__/openrouter.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the OpenRouter client**

```bash
git add src/openrouter.ts src/__tests__/openrouter.test.ts
git commit -m "feat: add OpenRouter Auto client"
```

### Task 4: Canonical MCP tools and compatibility aliases

**Files:**
- Modify: `src/SmartAdvisorServer.ts`
- Modify: `src/__tests__/SmartAdvisorServer.test.ts`
- Modify: `src/__tests__/integration.test.ts`

**Interfaces:**
- Consumes: shared contracts and `OpenRouterClient`
- Produces: `tools/list` with `consult`, `smart_doctor`, and `smart_status`
- Preserves: `callTool(name, args)` for seven legacy aliases

- [ ] **Step 1: Verify imports and method signatures before editing tests**

Read `SmartAdvisorServer.listTools`, `callTool`, `getHealthCheck`, and each test import. Record discrepancies: current tests expect seven advertised tools, current input requires `model`, current cache key omits intent, and current responses contain text only.

- [ ] **Step 2: Replace stale expectations with failing contract tests**

```ts
it('advertises one consultation tool and diagnostics', async () => {
  const result = await server.listTools();
  expect(result.tools.map(tool => tool.name)).toEqual(['consult', 'smart_doctor', 'smart_status']);
  expect(result.tools[0].inputSchema.required).toEqual(['task']);
});

it('accepts a legacy alias without advertising it', async () => {
  const response = await server.callTool('code_review', {task: 'Review this'});
  expect(response.structuredContent).toBeDefined();
});
```

- [ ] **Step 3: Run server tests and confirm RED**

Run: `npm test -- --run src/__tests__/SmartAdvisorServer.test.ts src/__tests__/integration.test.ts`

Expected: FAIL on the old tool list and required model.

- [ ] **Step 4: Implement canonical handlers**

Advertise three tools. Route `consult` and legacy aliases through one consultation method. Map each alias to an intent, use the new cache key, honor `fresh`, and attach `structuredContent` with the answer and receipt.

- [ ] **Step 5: Expose doctor and status results**

`smart_status` returns health and circuit-breaker state. `smart_doctor` reports Node version, API key presence, and configuration checks without including secret values.

- [ ] **Step 6: Run server tests and confirm GREEN**

Run: `npm test -- --run src/__tests__/SmartAdvisorServer.test.ts src/__tests__/integration.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit MCP compatibility**

```bash
git add src/SmartAdvisorServer.ts src/__tests__/SmartAdvisorServer.test.ts src/__tests__/integration.test.ts
git commit -m "feat: expose canonical MCP consultation tools"
```

### Task 5: Init, doctor, and one-shot ask commands

**Files:**
- Create: `src/commands/init.ts`
- Create: `src/commands/doctor.ts`
- Create: `src/commands/ask.ts`
- Create: `src/__tests__/commands.test.ts`
- Parent integration after merge: `src/cli.ts`

**Interfaces:**
- Produces: `runInit(options): Promise<CommandResult>`
- Produces: `runDoctor(options): Promise<DoctorResult>`
- Produces: `runAsk(task, options): Promise<ConsultationResult>`

- [ ] **Step 1: Write failing command tests**

Test that init output references `OPENROUTER_API_KEY`, doctor reports `missing` without a stack trace, JSON output parses, and ask rejects an empty task with `TASK_REQUIRED`.

```ts
it('reports a missing key without exposing a stack', async () => {
  const result = await runDoctor({env: {}, probe: false});
  expect(result.checks.apiKey).toEqual({status: 'missing', action: expect.any(String)});
  expect(JSON.stringify(result)).not.toContain('stack');
});
```

- [ ] **Step 2: Run command tests and confirm RED**

Run: `npm test -- --run src/__tests__/commands.test.ts`

Expected: FAIL because command modules do not exist.

- [ ] **Step 3: Implement pure command functions**

Return data from command modules and let the parent-owned `runCli` format text or JSON. Doctor must skip the network probe when the key is missing. Ask must use `OpenRouterClient` and print the answer before the receipt in text mode.

- [ ] **Step 4: Run command and CLI tests and confirm GREEN**

Run: `npm test -- --run src/__tests__/commands.test.ts src/__tests__/cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit command workflows**

```bash
git add src/commands src/__tests__/commands.test.ts
git commit -m "feat: add setup and diagnostic commands"
```

### Task 6: Ink terminal interface

**Files:**
- Create: `src/tui/App.tsx`
- Create: `src/tui/TextArea.tsx`
- Create: `src/tui/index.tsx`
- Create: `src/tui/theme.ts`
- Create: `src/__tests__/tui.test.tsx`

**Interfaces:**
- Consumes: command functions and consultation contracts
- Produces: `runTui(options?): Promise<void>`

- [ ] **Step 1: Write failing render and navigation tests**

```tsx
import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import {App} from '../tui/App.js';

it('shows the main navigation and balanced route', () => {
  const view = render(<App terminalWidth={100} />);
  expect(view.lastFrame()).toContain('Consult');
  expect(view.lastFrame()).toContain('Balanced');
  expect(view.lastFrame()).toContain('OpenRouter Auto');
});

it('opens Doctor from the navigation rail', () => {
  const view = render(<App terminalWidth={100} />);
  view.stdin.write('\u001b[B');
  view.stdin.write('\u001b[B');
  view.stdin.write('\r');
  expect(view.lastFrame()).toContain('Environment checks');
});
```

- [ ] **Step 2: Run TUI tests and confirm RED**

Run: `npm test -- --run src/__tests__/tui.test.tsx`

Expected: FAIL because the TUI modules do not exist.

- [ ] **Step 3: Implement theme, layout, and focus model**

Use Ink `Box`, `Text`, `useInput`, and alternate-screen rendering. Add the navigation rail, main panel, footer, selected and focused states, status colors, and the compact header below 80 columns.

- [ ] **Step 4: Implement the multiline editor**

`TextArea` must preserve input bytes except terminal control keys. `Shift+Enter` inserts a newline, `Enter` submits when the form action has focus, and `Esc` returns to navigation. Test indentation, fenced code, narrow-terminal navigation, first-press request cancellation, and omitted receipt fields.

- [ ] **Step 5: Connect Consult, Compare, Doctor, Setup, and Receipt screens**

Call shared command and OpenRouter functions. Show request stages, cancel with `Ctrl+C`, retain partial compare successes, and render receipt fields only when present. Add a test where one Compare advisor succeeds and one fails, then assert that the result labels both outcomes and preserves the successful answer.

- [ ] **Step 6: Run TUI tests and confirm GREEN**

Run: `npm test -- --run src/__tests__/tui.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the terminal interface**

```bash
git add src/tui src/__tests__/tui.test.tsx
git commit -m "feat: add Ink consultation TUI"
```

### Task 7: Documentation, compatibility, and release gate

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Test: all test files

**Interfaces:**
- Consumes: final CLI, MCP, OpenRouter, and TUI surfaces
- Produces: copyable setup and smoke-test documentation

- [ ] **Step 1: Rewrite Quick Start around a verified first call**

Document Node 22, `OPENROUTER_API_KEY`, `mcp-smart doctor`, `mcp-smart tui`, one MCP configuration, the canonical `consult` schema, OpenRouter Auto presets, receipts, and legacy alias compatibility. Remove stale model claims and fake direct `await smart_advisor(...)` examples.

- [ ] **Step 2: Run static checks**

Run: `git diff --check && npm run build`

Expected: no whitespace errors and a successful build.

- [ ] **Step 3: Run the full test suite**

Run: `npm test -- --run`

Expected: all tests pass with no unexpected warnings.

- [ ] **Step 4: Run CLI smoke checks**

Run:

```bash
env -u OPENROUTER_API_KEY node dist/index.js --help
env -u OPENROUTER_API_KEY node dist/index.js doctor --json
node dist/index.js --version
```

Expected: help exits 0, doctor emits valid JSON with a missing-key action, and version prints one line.

- [ ] **Step 5: Review the final diff against the spec**

Confirm every acceptance criterion. Confirm no API key appears in tracked files or logs. Confirm `.channels_cache_v2.json` and `codedb.snapshot` remain untracked and unchanged.

- [ ] **Step 6: Commit documentation and verification fixes**

```bash
git add README.md package.json package-lock.json
git commit -m "docs: publish the guided MCP Smart workflow"
```
