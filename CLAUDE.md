# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**mcp-smart** is an MCP (Model Context Protocol) server for routed and multi-advisor consultations through OpenRouter. Canonical consultations default to OpenRouter Auto. Hidden compatibility routes retain direct access to six models (Claude Sonnet 4.5, OpenAI GPT-5 Pro, xAI Grok 4, Google Gemini 3 Pro, DeepSeek v3.2, and Moonshot Kimi-K2 Thinking), caching, rate limiting, and circuit-breaker protection.

## Architecture

### Core Components

- **SmartAdvisorServer** (`src/SmartAdvisorServer.ts`): Main server class implementing MCP protocol
  - Advertises `consult`, `smart_doctor`, and `smart_status`
  - Keeps `smart_advisor`, `code_review`, `get_advice`, `expert_opinion`, `smart_llm`, `ask_expert`, and `review_code` callable as hidden compatibility aliases
  - Routes consultations through OpenRouter with specialized prompts based on intent or legacy tool role

- **CircuitBreaker** (within `SmartAdvisorServer.ts`): OpenRouter health protection for canonical and compatibility requests
  - States: CLOSED (healthy), OPEN (failing), HALF_OPEN (testing recovery)
  - Prevents cascading failures by opening circuits after consecutive failures
  - Automatic recovery testing with configurable timeouts
  - Manual resets invalidate stale half-open trial results

- **Logger** (within `SmartAdvisorServer.ts`): Structured logging with context and log levels (ERROR, WARN, INFO, DEBUG)

### Legacy Model Routes

Hidden aliases accept these compatibility values in `model`:

1. **`auto`**: Uses `openrouter/auto` with the Auto router plugin
2. **`intelligence`**: Routes to Claude Sonnet 4.5
3. **`premium`**: Routes to OpenAI GPT-5 Pro
4. **`speed`**: Routes to xAI Grok 4
5. **`balance`**: Routes to Google Gemini 3 Pro
6. **`cost`**: Routes to DeepSeek v3.2
7. **`random`**: Randomly selects from available providers
8. **`all`**: Consults all providers and formats multi-advisor response
9. **Direct providers**: `claude`, `openai`, `xai`, `google`, `deepseek`, `moonshot`

### Provider Set

The legacy `all` route queries six direct model IDs in parallel. The canonical `consult` route leaves provider selection to OpenRouter Auto unless the caller supplies a direct model ID.

### Security & Resilience

- **Input Validation**: Length limits and sanitization
- **Prompt Injection Detection**: Pattern matching for malicious inputs (script injection, prompt injection attempts)
- **Rate Limiting**: Configurable requests per time window with per-client tracking
- **Circuit Breaker**: OpenRouter fault isolation with bounded half-open recovery trials
- **Caching**: LRU cache with TTL to reduce API costs
- **Retry Logic**: Exponential backoff for transient failures

## Development Commands

### Building & Testing

```bash
# Build the TypeScript project
npm run build

# Run in development mode (with tsx)
npm run dev

# Start the built server
npm start

# Run all tests once
npm test -- --run

# Run tests in watch mode
npm test:watch

# Run tests with coverage
npm run test:coverage
```

### Testing Strategy

- Uses Vitest as the test runner
- Tests located in `src/__tests__/`
- Current test files:
  - `SmartAdvisorServer.test.ts`: Unit tests for core server functionality
  - `cli.test.ts`: Command parsing, output, and exit behavior
  - `commands.test.ts`: Setup, Doctor, and ask workflows
  - `contracts.test.ts`: Route and cache-key contracts
  - `integration.test.ts`: Integration tests
  - `openrouter.test.ts`: OpenRouter payload, receipt, retry, and error handling
  - `prompt.test.ts`: Prompt generation tests
  - `tui.test.tsx`: Ink interface behavior
- Mock axios for API calls in tests
- Test coverage tracked with v8 provider

### Running a Single Test

```bash
# Run specific test file
npm test SmartAdvisorServer.test.ts

# Run tests matching pattern
npm test -- -t "routing"
```

## Configuration

All configuration via environment variables (see `loadConfig()` in SmartAdvisorServer.ts):

### Required
- `OPENROUTER_API_KEY`: OpenRouter API key (REQUIRED)

### Optional (with defaults)
- `MAX_RETRIES=3`: Retry attempts for failed requests
- `REQUEST_TIMEOUT=30000`: Request timeout in milliseconds
- `CACHE_TTL=300000`: Cache time-to-live (5 minutes)
- `MAX_TOKENS=4000`: Default tokens per request
- `MAX_CACHE_SIZE=100`: Maximum cached responses
- `MAX_TASK_LENGTH=10000`: Maximum task input length
- `MAX_CONTEXT_LENGTH=20000`: Maximum context input length
- `RATE_LIMIT_REQUESTS=10`: Requests per window (`0` disables the limiter)
- `RATE_LIMIT_WINDOW=60000`: Rate limit window (1 minute)

### Circuit Breaker Configuration
- `CIRCUIT_BREAKER_FAILURE_THRESHOLD=5`: Consecutive failures before opening
- `CIRCUIT_BREAKER_RECOVERY_TIMEOUT=60000`: Recovery attempt timeout (1 minute)
- `CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS=3`: Max calls in half-open state

## Key Implementation Details

### Tool-Specific Prompts

The system uses `buildToolSpecificPrompt()` to customize prompts based on tool name:
- Each tool has a specific role defined in `TOOL_SPECIFIC_ROLES`
- Roles include: Smart Technical Advisor, Senior Code Reviewer, Coding Mentor, etc.
- All tools use the same 4-persona system: Manager → CTO/Role → QA → Engineer

### Circuit Breaker Flow

1. **CLOSED state**: Normal operation, requests flow through
2. **Failure tracking**: Consecutive failures increment counter
3. **OPEN state**: Circuit opens after threshold, requests immediately rejected
4. **Recovery attempt**: After timeout, transitions to HALF_OPEN
5. **HALF_OPEN state**: Limited test requests allowed
6. **Success**: Returns to CLOSED, resets counters
7. **Failure**: Returns to OPEN, waits for next recovery window

### Caching Strategy

- LRU (Least Recently Used) cache implementation
- Cache keys include intent, prompt version, route, Auto restrictions, token override, session, task, and context
- Tracks hits, misses, evictions, and hit rate
- Evicts least recently used when max size reached
- TTL-based expiration with automatic cleanup

### Multi-Advisor Consultation

When `model: "all"` is specified:
1. Uses `Promise.allSettled` to query all providers in parallel
2. Gracefully handles individual provider failures
3. Formats successful responses with clear sections per advisor
4. Provides synthesis and next steps guidance

## Claude Code Integration

This MCP server is designed to integrate with Claude Code. Users add configuration to `~/.claude/CLAUDE.md`:

```markdown
When a technical decision needs an independent perspective, call Smart's `consult` tool. Use `smart_doctor` for MCP server configuration and `smart_status` for route health.
```

This creates a hook where Claude Code automatically invokes the MCP server when detecting relevant keywords in user prompts or system reasoning.

## Publishing & Versioning

- Package published to npm as `mcp-smart`
- Current version: 2.0.0
- Entry point: `dist/index.js` (built from `src/index.ts`)
- Binary: `mcp-smart` command
- Prepack: Runs the tests and `npm run build`

## Project Structure

```
src/
  index.ts                 - Executable wrapper around the CLI dispatcher
  SmartAdvisorServer.ts    - Main server implementation (1600+ lines)
    - Logger class
    - CircuitBreaker class
    - SmartAdvisorServer class
  __tests__/
    SmartAdvisorServer.test.ts - Unit tests
    cli.test.ts                - CLI tests
    commands.test.ts           - Command workflow tests
    contracts.test.ts          - Route contract tests
    integration.test.ts        - Integration tests
    openrouter.test.ts         - OpenRouter client tests
    prompt.test.ts             - Prompt tests
    tui.test.tsx               - Terminal UI tests

  commands/                - CLI command workflows
  tui/                     - Ink terminal interface
  cli.ts                   - Command dispatcher
  contracts.ts             - Public route and receipt types
  openrouter.ts            - OpenRouter client
  terminal.ts              - Terminal text sanitization

dist/                      - Compiled JavaScript output
package.json               - Package configuration
tsconfig.json              - TypeScript configuration
vitest.config.ts           - Test configuration
```

## Common Development Patterns

### Adding a New Provider

1. Add model to `MODELS` constant
2. Add display name to `MODEL_NAMES`
3. Add compatibility values to `LEGACY_MODEL_ROUTES` when needed
4. Add the model to the TUI Compare list if users should select it there
5. Update tests and README.md documentation

### Adding a New Tool Alias

1. Add tool to `TOOL_SPECIFIC_ROLES` with role, focus, description
2. Add the name to the hidden alias list in `callTool()`
3. Update `resolveIntent()` if the alias maps to review or expert opinion
4. Add compatibility tests; do not add the alias to `listTools()`

### Debugging Circuit Breakers

Use public methods:
- `getCircuitBreakerMetrics()`: Get metrics for all circuit breakers
- `getHealthCheck()`: Overall system health including circuit breaker states
- `resetCircuitBreaker(provider)`: Manually reset specific provider
- `resetAllCircuitBreakers()`: Reset all circuit breakers

## Testing Considerations

- Mock axios for all API calls
- Reset environment variables in `beforeEach`/`afterEach`
- Circuit breakers maintain state between test runs - use fresh server instance per test
- Cache persists within server instance - clear or use fresh instance
- Rate limiters track by client ID - use unique IDs or fresh instance

## Important Gotchas

1. **Router model excluded from main providers**: The `router` key in `MODELS` is excluded from legacy `all`; the `smart-auto` compatibility value routes directly to GPT-5 Mini
2. **Circuit breaker state persistence**: Circuit breakers maintain state across requests within the same server instance
3. **Cache key construction**: Cache keys include the resolved route, so the same task with different routing options uses different entries
4. **OpenRouter circuit state**: Canonical and legacy `all` consultations share the live OpenRouter circuit breaker
5. **Tool name matters**: Tool name affects system prompt via `buildToolSpecificPrompt()`, even though all tools share the same input schema
