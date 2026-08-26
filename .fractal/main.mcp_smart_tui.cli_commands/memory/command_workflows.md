---
name: command_workflows
desc: Verified command-module dependencies and TDD evidence.
tags: [commands, cli]
created: 2026-08-26T00:44:50Z
updated: 2026-08-26T00:44:50Z
---

# command_workflows

## Source preflight

`src/contracts.ts` exports `ConsultInput`, `ConsultationResult`,
`ConsultationReceipt`, `SmartErrorDetails`, and `resolveRoute(input)`. The
default resolved route is `openrouter/auto`, preset `balanced`, cost tier
`medium`, and plugin `auto-router`.

`src/openrouter.ts` exports `OpenRouterClient`, constructed with
`OpenRouterClientOptions` including optional `apiKey`, and its public method is
`consult(input: ConsultInput): Promise<ConsultationResult>`. It throws an
`OpenRouterError` carrying `details: SmartErrorDetails` and does not issue a
request for a blank key. Its test suite mocks Axios.

`src/cli.ts` parses `init`, `doctor`, and `ask` but deliberately throws that
they are unavailable; parent-owned wiring is required to consume the delivered
pure modules.

Correction preflight: `src/commands/doctor.ts` defines the private default
`defaultProbe(apiKey: string): Promise<void>`, which initially called native
`fetch` with `GET https://openrouter.ai/api/v1/models` plus an `Authorization:
Bearer <key>` header. `DoctorOptions.probeOpenRouter` is injectable, but there
is no fetch injection seam, so the focused regression test must mock global
`fetch`. The API's authenticated current-key validation endpoint is instead
`https://openrouter.ai/api/v1/key`; a non-OK response is intentionally mapped
by `runDoctor` to the typed, key-free failed check.

## TDD evidence

The focused command test command is `npm test -- --run
src/__tests__/commands.test.ts`.

- Init guidance RED: the command failed to load `../commands/init.js`; GREEN:
  the new module returned environment and client setup data and the test passed.
- Doctor missing-key RED: the command failed to load `../commands/doctor.js`;
  GREEN: the missing check had its stable action, the access probe was not
  called, and JSON output contained no stack.
- Empty ask RED: the command failed to load `../commands/ask.js`; GREEN: blank
  input rejected with `CommandError.details.code` `TASK_REQUIRED` and its
  action.
- Delegation and exact multiline preservation RED: the injected client received
  only `task`; GREEN: it received the unchanged task, context, and model and
  returned the typed consultation result.
- Copyable client configuration RED: the init result had narrative client text
  instead of `{command: 'mcp-smart', args: []}`; GREEN: it returned that
  structured configuration. The doctor test also verified Node, terminal,
  OpenRouter probe, and default route checks without serializing its supplied
  API-key sentinel.
- Authenticated doctor probe RED: `npm test -- --run
  src/__tests__/commands.test.ts` ran 6 tests with 1 failure. The mocked fetch
  received `https://openrouter.ai/api/v1/models` while the regression expected
  `https://openrouter.ai/api/v1/key`; the bearer header itself matched. The
  mocked 401 path already mapped to the existing actionable failed result.
- Authenticated doctor probe GREEN: after changing only the default URL to
  `/api/v1/key`, `npm test -- --run src/__tests__/commands.test.ts` passed all
  6 tests. `npm run build` passed, and the inherited
  `.fractal/main.mcp_smart_tui.cli_commands/scripts/test.sh` passed its 68-test
  suite and build. The mocked 401 test proves the bearer header is sent and the
  sentinel key is absent from serialized result data.

`npm run build` completed successfully after the focused suite.
