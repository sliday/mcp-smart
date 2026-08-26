---
name: state
desc: Delivered routing, OpenRouter, and MCP contracts with verified TDD evidence.
created: 2026-08-25T23:31:41Z
updated: 2026-08-25T23:55:00Z
---

# state

## Delivered boundary

The node owns and delivers `src/contracts.ts`, `src/openrouter.ts`,
`src/SmartAdvisorServer.ts`, and the four matching owned test files. No
parent-owned project file differs from the dispatcher baseline.

- Shared contracts default to Balanced `openrouter/auto`, medium tier, and the
  exact `auto-router` plugin. Direct routes omit the plugin.
- Cache identity includes prompt version, canonical intent, resolved route,
  restrictions, maximum tokens, task, and context without mutating inputs.
- OpenRouter requests use root `session_id`, usage opt-in, metadata headers, and
  plugin-local `allowed_models`/`excluded_models`. Optional response metadata is
  present only when observed.
- Stable errors cover missing key, authentication, credits, restrictions, no
  eligible model/provider, timeout, provider/local rate limits, and circuit
  breaker failures. Permanent responses stop immediately; transient timeout and
  503 paths never exceed three total attempts.
- MCP advertises exactly `consult`, `smart_doctor`, and `smart_status`, requires
  only `task`, returns readable plus typed output, and keeps all seven legacy
  aliases callable with canonical intent mapping. Raw input and existing prompt
  content remain intact; diagnostics expose no secret values.

## TDD evidence

- Contracts RED: 1 failed file and 0 collected tests because
  `../contracts.js` was absent. GREEN: 1 passed file and 8 passed tests;
  adjacent server suites passed 2 files and 34 tests.
- OpenRouter RED: 1 failed file and 0 collected tests because
  `../openrouter.js` was absent. GREEN: 1 passed file and 13 passed tests;
  adjacent suites passed 3 files and 42 tests.
- Cancellation seam RED: 1 failed and 13 passed OpenRouter tests because Axios
  received no signal. GREEN: 1 passed file and 14 passed tests after the
  optional client signal was forwarded.
- MCP RED: 2 failed files and 11 failed tests on the legacy advertised tools,
  required model, text-only output, and missing diagnostics/errors. GREEN: 2
  passed files and 11 passed tests.

## Verification

The required focused commands pass with 8, 14, and 11 tests respectively.
`npm run build`, `git diff --check`, and the node lint script exit 0. The node
test script exits 0 with 6 passed files, 49 passed tests, and a successful
TypeScript build.

Context7 was absent from the callable tool registry. Installed Axios 1.x and MCP
SDK 1.15.1 declarations plus repository tests were the verified documentation
fallback, and the blocker was reported before API implementation.

## Cancellation seam inspection

The production module imports Axios as its default export and exposes
`OpenRouterClient.consult(input: ConsultInput): Promise<ConsultationResult>`.
The focused test mocks `axios.post` directly. Installed Axios 1.x declares
`AxiosRequestConfig.signal?: GenericAbortSignal`. `OpenRouterClientOptions` now
accepts an optional `AbortSignal` and forwards it to the Axios request without
changing the public `consult(input)` signature or retry ceiling.
