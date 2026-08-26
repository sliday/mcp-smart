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

`npm run build` completed successfully after the focused suite.
