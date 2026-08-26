# MCP Smart Usability and TUI Design

Date: 2026-08-26
Status: Draft for written review

## Objective

Make MCP Smart useful within three minutes of installation. A user should be able to diagnose setup, submit a consultation without choosing a model, inspect routing and cost, and repeat the workflow from a keyboard-driven terminal interface.

## Product Contract

MCP Smart will support two entry paths:

1. MCP clients use the stdio server and one advertised `consult` tool.
2. People use CLI commands or the Ink terminal interface.

The package will keep stdio as the default process behavior. Existing MCP client configurations that run `mcp-smart` without arguments will continue to work.

## Runtime Requirements

- Node.js 22 or newer
- ESM and TypeScript
- Ink 7 and React 19 for the terminal interface
- OpenRouter for model access
- `OPENROUTER_API_KEY` supplied through the process environment

The package will never store an OpenRouter key. Setup screens and generated examples will reference the environment variable.

## CLI Contract

| Command | Behavior |
| --- | --- |
| `mcp-smart` | Start the MCP stdio server. |
| `mcp-smart tui` | Open the interactive terminal interface. |
| `mcp-smart init` | Print client configuration and environment setup instructions. |
| `mcp-smart doctor` | Check Node, terminal, API key presence, OpenRouter access, and the local default-route configuration. |
| `mcp-smart ask [task]` | Run one consultation and print the answer followed by a compact receipt. |
| `mcp-smart --help` | Print command help without constructing the server or requiring an API key. |
| `mcp-smart --version` | Print the package version without constructing the server. |

`init`, `doctor`, and `ask` will support plain text and `--json`. Plain text targets people. JSON targets scripts and automated checks.

## TUI Interaction

### Layout

The TUI will use Ink's alternate screen and a three-part layout:

- A left navigation rail lists Consult, Compare, Doctor, Setup, and Last Receipt.
- A main panel shows the active form, progress, answer, or diagnostics.
- A footer shows the available keys and current route policy.

The interface will adapt to narrow terminals. Widths below 80 columns will replace the navigation rail with a compact header.

### Keyboard Map

| Key | Action |
| --- | --- |
| `Tab` and `Shift+Tab` | Move focus. |
| Arrow keys | Change a menu or preset. |
| `Enter` | Submit or confirm the focused action. |
| `Esc` | Return to the previous screen or cancel an idle form. |
| `Ctrl+C` | Cancel an active request, then exit on a second press. |
| `?` | Show the key reference. |
| `q` | Exit from navigation screens. |

### Consult Flow

1. Enter a task.
2. Add optional context.
3. Choose Fast, Balanced, Best, or Custom.
4. Submit.
5. See routing, request, and response progress.
6. Read the answer and receipt.

The form will preserve line breaks, indentation, and code fences. It will never rewrite task text before submission.

### Compare Flow

Compare will request two to four advisors. The first release will default to two. It will exclude the routing model from the advisor set, preserve partial successes, show each model's cost, and label failed responses.

## Routing Contract

`openrouter/auto` will become the default route. The current GPT-5 Mini router will remain available as `smart-auto` for compatibility and controlled evaluation.

Presets will map to these OpenRouter settings:

| Preset | Model | Cost tier |
| --- | --- | --- |
| Fast | `openrouter/auto` | `low` |
| Balanced | `openrouter/auto` | `medium` |
| Best | `openrouter/auto` | `max` |
| Custom | User-supplied model or Auto settings | User-supplied |

Auto requests will use the `auto-router` plugin ID. The request builder will reject an incompatible plugin ID before sending the request. A direct OpenRouter model ID will bypass the Auto plugin.

Each TUI conversation will receive a session ID. Auto requests will reuse it so OpenRouter can keep a conversation on a stable model and provider when the task remains similar.

## MCP Tool Contract

The server will advertise:

- `consult`, for advice, review, and expert opinion
- `smart_doctor`, for local configuration and provider diagnostics
- `smart_status`, for cache, limits, and circuit breaker state

`consult` will accept:

```ts
interface ConsultInput {
  task: string;
  context?: string;
  intent?: 'advice' | 'code-review' | 'expert-opinion';
  preset?: 'fast' | 'balanced' | 'best' | 'custom';
  model?: string;
  costTier?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  allowedModels?: string[];
  excludedModels?: string[];
  maxTokens?: number;
  sessionId?: string;
  fresh?: boolean;
}
```

Only `task` will be required. The server will accept the seven current tool names as compatibility aliases but omit them from `tools/list`.

## Response Contract

Every successful consultation will return human-readable `content` and typed `structuredContent`:

```ts
interface ConsultationResult {
  answer: string;
  receipt: {
    requestId: string;
    requestedModel: string;
    selectedModel: string;
    provider?: string;
    preset: string;
    costTier?: string;
    taskType?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    latencyMs: number;
    cacheHit: boolean;
    cacheAgeMs?: number;
    fallbackUsed: boolean;
  };
}
```

Fields that OpenRouter omits will remain absent. The server will not invent provider, cost, classification, or fallback values.

## Cache Contract

The cache key will include:

- Tool intent
- Prompt version
- Selected route and preset
- Auto restrictions
- Maximum tokens
- Session ID
- Task and context

`fresh: true` will bypass cache reads. A cached response will carry its age in the receipt.

## Error Contract

CLI, TUI, and MCP paths will share stable errors:

```ts
interface SmartErrorDetails {
  code: string;
  message: string;
  action: string;
  requestId?: string;
  retryAfterMs?: number;
}
```

The first release will distinguish missing key, authentication, insufficient credits, model restrictions, unavailable providers, timeout, local rate limit, provider rate limit, and circuit breaker failures.

CLI and TUI commands will show the action without a stack trace. `DEBUG=1` will add stack traces and request diagnostics. Logs will redact prompts, context, authorization headers, and API keys.

Retries will stop after three attempts. The client will not retry authentication, credit, model restriction, or other non-transient failures.

## Code Structure

The implementation will add these boundaries:

- `src/cli.ts` parses commands and selects a runtime.
- `src/commands/` contains `init`, `doctor`, and `ask` behavior.
- `src/tui/` contains Ink components and terminal state.
- `src/contracts.ts` defines consultation, receipt, and error types.
- `src/openrouter.ts` builds requests and normalizes OpenRouter responses.
- `src/SmartAdvisorServer.ts` remains the MCP adapter and compatibility layer.

The CLI will import TUI modules only for `mcp-smart tui`. MCP startup will not load React or Ink.

## Testing Strategy

Implementation will follow test-driven development. Each test will fail for the expected missing behavior before production code changes.

1. CLI tests cover help, version, default stdio dispatch, missing keys, and JSON output.
2. Contract tests cover default input values, preset mapping, receipts, cache identity, and stable errors.
3. MCP tests cover the advertised tools, legacy aliases, optional model selection, and `structuredContent`.
4. OpenRouter tests cover Auto request shape, direct models, usage, metadata, and error normalization.
5. Ink tests cover navigation, form editing, submission, cancellation, narrow terminals, and receipt rendering.
6. Integration tests cover doctor and one mocked consultation from CLI and TUI entry points.

The final gate will run focused tests, the full Vitest suite, TypeScript compilation, and non-interactive CLI smoke tests.

## Compatibility

- Existing `mcp-smart` stdio configurations will keep working.
- Existing environment variables will keep their meaning.
- Existing tool calls will keep working through hidden aliases.
- Node 16, 18, and 20 support will end when this release adopts Ink 7.
- The repository will document the Node 22 requirement in `package.json` and the README.

## Excluded from This Release

- Streamable HTTP transport
- A direct AI SDK language-model provider
- Persistent conversation history
- Account-level routing policy changes
- API key storage
- Package publication or deployment

These changes can follow after the local CLI and MCP contracts prove stable.

## Acceptance Criteria

- `mcp-smart --help` exits successfully without `OPENROUTER_API_KEY`.
- `mcp-smart doctor` identifies a missing key without printing a stack trace.
- `mcp-smart tui` opens a keyboard-driven interface in an interactive terminal.
- `tools/list` advertises one consultation tool and two diagnostic tools.
- A consultation succeeds when the caller omits `model`.
- The default OpenRouter request uses `openrouter/auto` and `auto-router`.
- Each successful response includes typed receipt data.
- Legacy tool names remain callable.
- Code indentation and fences survive input handling.
- The cache separates intents, prompt versions, route settings, and token limits.
- The package builds and all tests pass on Node 22.
