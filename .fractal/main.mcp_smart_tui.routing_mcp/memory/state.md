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

## Active review corrections

Parent review accepts the cancellation seam but requires five spec-critical
corrections, in order, within the existing seven-file boundary:

1. Keep permanent domain failures and cancellation from poisoning the circuit
   breaker; restore both API-key and rate-limit environment variables in the
   integration test.
2. Resolve the compatibility model `smart-auto` to the direct
   `openai/gpt-5-mini` route with no Auto plugin.
3. Preserve stable domain error code/action across the real MCP transport using
   safe `isError` content and structured details, after checking installed SDK
   declarations and capturing an in-memory transport RED.
4. Reject successful HTTP responses that lack a text completion with a stable
   provider-response error.
5. Parse only observed official `openrouter_metadata` values: selected provider
   at `endpoints.available[].selected` and Auto task type at
   `pipeline[].data.task_type`.

The actionable parent message is saved as radio UUID `5EC66F74`. Legacy cleanup,
broad optional-input validation, and MCP AbortSignal threading are explicitly
out of scope for this correction pass.

The executable correction sequence is recorded in plan 5.1. No correction test
or production edit has started: reserve mode activated immediately before
EXECUTE. Resume with boundary 1 preflight, focused circuit-breaker RED, and the
integration environment restoration; retain the saved directive until all five
boundaries are green.

## Correction implementation evidence

The production preflight confirms `SmartAdvisorServer` imports MCP `Server`,
`CallToolRequestSchema`, and `ListToolsRequestSchema`, registers the call handler
as `return this.callTool(request.params.name, request.params.arguments)`, and
keeps `listTools(): Promise<any>`, `callTool(name: string, args: any):
Promise<any>`, and `run()` public. `CircuitBreaker.execute(operation)` currently
counts every rejection, even though `OpenRouterClient.consult(input:
ConsultInput): Promise<ConsultationResult>` wraps stable permanent failures in
`OpenRouterError.details`. Axios 1.10.0 declares
`AxiosRequestConfig.signal?: GenericAbortSignal` and cancellation code
`ERR_CANCELED`. The integration suite snapshots only `OPENROUTER_API_KEY` and
leaks `RATE_LIMIT_REQUESTS`.

The contract/OpenRouter preflight confirms `resolveRoute(input: ConsultInput):
ResolvedRoute` treats `smart-auto` as the literal direct model rather than the
required `openai/gpt-5-mini` compatibility route. It can also retain a
`costTier` for direct models even though no Auto plugin applies it.

Installed MCP SDK 1.15.1 declares `InMemoryTransport.createLinkedPair():
[InMemoryTransport, InMemoryTransport]`, `new Client(Implementation)`,
`Client.connect(transport)`, and `Client.callTool(params, resultSchema?,
options?)`. `CallToolResult` permits `content`, `structuredContent`, and
`isError`; its declaration says tool-originated errors should use `isError:
true` rather than protocol errors. The current MCP handler lets domain errors
escape, so the actual transport converts them to JSON-RPC internal errors.

`OpenRouterClient.send()` currently accepts empty/missing completion text as an
empty answer, reads obsolete top-level `provider`, `task_type`, and
`fallback_used`, and derives `maxAttempts` with a NaN-unsafe clamp. The observed
nested response shape to cover is `openrouter_metadata.endpoints.available[]`
with `selected === true` and `openrouter_metadata.pipeline[].data.task_type`.
Context7 is unavailable in the callable registry, so installed declarations and
tests are the verified documentation fallback.

Circuit/environment RED: the two focused server files ran 13 tests with 2
failures: a 401 opened the threshold-1 breaker and cancellation normalized as
`PROVIDER_UNAVAILABLE`. GREEN: both files passed all 13 tests; adjacent
OpenRouter passed all 14. Canonical breaker accounting now counts only stable
transient provider-availability errors, cancellation is `REQUEST_CANCELLED`
and non-retryable, and integration teardown exactly restores or deletes both
`OPENROUTER_API_KEY` and `RATE_LIMIT_REQUESTS` according to their initial
presence.
