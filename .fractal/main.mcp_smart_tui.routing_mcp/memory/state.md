---
name: state
desc: Delivered routing, OpenRouter, and MCP contracts with verified TDD evidence.
created: 2026-08-25T23:31:41Z
updated: 2026-08-26T00:30:00Z
---

# state

## Delivered boundary

The node owns and delivers `src/contracts.ts`, `src/openrouter.ts`,
`src/SmartAdvisorServer.ts`, and the four matching owned test files. No
parent-owned project file differs from the dispatcher baseline.

- Shared contracts default to Balanced `openrouter/auto`, medium tier, and the
  exact `auto-router` plugin. Direct routes omit the plugin and unapplied Auto
  cost tiers; `smart-auto` is the direct `openai/gpt-5-mini` compatibility route.
- Cache identity includes prompt version, canonical intent, resolved route,
  restrictions, maximum tokens, task, and context without mutating inputs.
- OpenRouter requests use root `session_id`, usage opt-in, metadata headers, and
  plugin-local `allowed_models`/`excluded_models`. Optional response metadata is
  present only when observed.
- Stable errors cover missing key, authentication, credits, restrictions, no
  eligible model/provider, timeout, provider/local rate limits, and circuit
  breaker failures. Permanent responses stop immediately; transient timeout and
  503 paths never exceed three total attempts. Only those retryable transient
  failures affect the canonical OpenRouter circuit breaker.
- MCP advertises exactly `consult`, `smart_doctor`, and `smart_status`, requires
  only `task`, returns readable plus typed output, and keeps all seven legacy
  aliases callable with canonical intent mapping. Raw input and existing prompt
  content remain intact; diagnostics expose no secret values. Stable domain
  failures cross the actual MCP transport as safe `isError` results rather than
  JSON-RPC internal errors.

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

The required focused commands pass with 10, 20, and 16 tests respectively.
`npm run build` and `git diff --check` exit 0. The full suite and node test
script each exit 0 with 6 passed files and 62 passed tests; the node script also
completes a successful TypeScript build.

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

## Review correction implementation

The production surface keeps `OpenRouterClient.consult(input: ConsultInput):
Promise<ConsultationResult>`, `SmartAdvisorServer.listTools(): Promise<any>`,
`callTool(name: string, args: any): Promise<any>`, and `run()` source-compatible.
Axios 1.10.0 declares `AxiosRequestConfig.signal?: GenericAbortSignal` and
`ERR_CANCELED`; the integration suite restores both modified environment
variables exactly.

Installed MCP SDK 1.15.1 declares `InMemoryTransport.createLinkedPair()`,
`new Client(Implementation)`, `Client.connect(transport)`, and
`Client.callTool(params, resultSchema?, options?)`. Its `CallToolResult` permits
`content`, `structuredContent`, and `isError` and directs tool-originated errors
to that result shape. The MCP request boundary follows this contract while the
direct public `callTool()` method retains its throwing behavior.

`resolveRoute(input: ConsultInput): ResolvedRoute` maps `smart-auto` to direct
`openai/gpt-5-mini` and omits Auto plugin and cost-tier data for every direct
model. `OpenRouterClient.send()` rejects empty/missing completion text, ignores
obsolete top-level metadata, parses only the observed nested metadata shape,
and derives a finite-safe attempt count. Context7 was unavailable in the
callable registry, so installed declarations and tests were the verified
documentation fallback.

Circuit/environment RED: the two focused server files ran 13 tests with 2
failures: a 401 opened the threshold-1 breaker and cancellation normalized as
`PROVIDER_UNAVAILABLE`. GREEN: both files passed all 13 tests; adjacent
OpenRouter passed all 14. Canonical breaker accounting now counts only stable
transient provider-availability errors, cancellation is `REQUEST_CANCELLED`
and non-retryable, and integration teardown exactly restores or deletes both
`OPENROUTER_API_KEY` and `RATE_LIMIT_REQUESTS` according to their initial
presence.

Compatibility-route RED: contracts ran 10 tests with 2 failures (literal
`smart-auto` and direct `costTier`/preset leakage); OpenRouter ran 15 tests with
1 failure (literal wire model). GREEN: contracts 10/10, OpenRouter 15/15, and
adjacent server suites 13/13. `smart-auto` now resolves to direct
`openai/gpt-5-mini` with custom preset and no plugin, and all direct routes omit
unapplied Auto cost tiers from resolved routes and receipts.

MCP-transport RED: the integration suite ran 4 tests with 1 failure; SDK
`Client.callTool()` rejected with JSON-RPC internal error `-32603`. GREEN:
integration 4/4 and both server suites 14/14. The registered MCP request handler
now catches only validated stable domain details and returns safe readable
content, `{error: SmartErrorDetails}` structured content, and `isError: true`.
The advertised consult output schema accepts either the existing success shape
or the typed error shape, while direct public `callTool()` retains its throwing
behavior and signature.

Malformed-response RED: OpenRouter ran 16 tests with 1 failure and the server
suite ran 11 tests with 1 failure; both accepted/cached empty answers. GREEN:
OpenRouter 16/16 and adjacent server suites 15/15. A missing, non-string, empty,
or whitespace-only first completion now raises single-attempt
`INVALID_PROVIDER_RESPONSE` before receipt construction or cache insertion, so
an identical later consultation reaches the provider again.

Nested-metadata/retry RED: OpenRouter ran 20 tests with 3 failures: obsolete
top-level provider/task values won, NaN produced zero attempts and the generic
error, and negative infinity produced one attempt. GREEN: OpenRouter 20/20,
contracts 10/10, and adjacent server suites 15/15. Receipt provider now comes
only from the nested available endpoint with `selected === true`; task type
comes only from a nested pipeline stage `data.task_type`; top-level provider,
task, and fallback fields are ignored. Non-finite attempt configuration safely
defaults to three, while finite values are truncated and clamped to 1–3.

Final breaker-accounting RED: the server suite ran 12 tests with 1 failure
because non-retryable catch-all `PROVIDER_UNAVAILABLE` opened the threshold-1
breaker. GREEN: both server suites passed 16/16 after breaker accounting was
restricted to the retryable timeout/503 codes used by the client. Final full
verification is 6 files and 62 tests, with focused counts 10, 20, and 16.
