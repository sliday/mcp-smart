# MCP Smart

MCP Smart connects MCP clients and terminal workflows to OpenRouter. It defaults to OpenRouter Auto, returns routing and cost receipts, and keeps legacy MCP tool names callable.

## Quick start

You need Node.js 22 or newer and an [OpenRouter API key](https://openrouter.ai/settings/keys).

```zsh
npm install -g mcp-smart
export OPENROUTER_API_KEY="<your-openrouter-api-key>"
mcp-smart doctor
mcp-smart ask "Review this API design for failure modes"
mcp-smart tui
```

`mcp-smart doctor` checks Node.js, terminal support, key presence, OpenRouter authentication, and the local OpenRouter Auto configuration. It exits with a nonzero status when a required check fails or the key is missing. MCP Smart reads the key from `OPENROUTER_API_KEY`; it does not save the key.

Run `mcp-smart init` for copyable setup guidance. Add `--json` to `init`, `doctor`, or `ask` when a script needs structured output.

## Terminal interface

Run `mcp-smart tui` to open the Ink interface in the terminal alternate screen. The interface includes:

- Consult, for one routed answer
- Compare, for two to four selected advisor perspectives with partial results when a request fails
- Doctor, for environment and OpenRouter checks
- Setup, for key and MCP client instructions
- Last Receipt, for the latest route, model, latency, token, and cost data

The layout uses a navigation rail at 80 columns or wider and a compact header in narrow terminals. It preserves multiline input, indentation, and fenced code.

Choose Custom to enter a direct OpenRouter model ID. MCP Smart keeps one session ID for the TUI conversation so repeated Auto requests retain route affinity.

Compare starts with two direct advisors selected. Move through the visible model checklist with the arrow keys, press `Space` to select two to four models, and press `a` to show or hide full answers after the comparison finishes.

| Key | Action |
| --- | --- |
| `Tab`, `Shift+Tab` | Move focus |
| Arrow keys | Move through navigation, presets, or Compare advisors |
| `Space` | Select or clear the focused Compare advisor |
| `a` | Show or hide full Compare answers |
| `Enter` | Confirm or submit |
| `Shift+Enter` | Insert a newline in the editor |
| `Esc` | Return to navigation |
| `Ctrl+C` | Cancel an active request; press again to exit |
| `?` | Show the key reference |
| `q` | Exit from navigation |

## CLI commands

| Command | Result |
| --- | --- |
| `mcp-smart` | Start the stdio MCP server |
| `mcp-smart tui` | Open the terminal interface |
| `mcp-smart init` | Print environment and MCP client setup |
| `mcp-smart doctor` | Check local and OpenRouter configuration |
| `mcp-smart ask [task]` | Run one consultation and print its receipt |
| `mcp-smart --help` | Print command help without requiring a key |
| `mcp-smart --version` | Print the package version |

Pass a multiline task as one shell argument. Zsh ANSI-C quoting keeps line breaks and indentation:

```zsh
mcp-smart ask $'Review this function:\n```ts\n  const value = 1;\n```'
```

CLI failures include a stable code, message, and action. Set `DEBUG=1` to add a stack trace and request diagnostics. MCP Smart redacts prompts, context, authorization headers, and keys from logs.

## MCP client setup

Set `OPENROUTER_API_KEY` in the environment that launches your MCP client, then add this server entry:

```json
{
  "mcpServers": {
    "smart": {
      "command": "mcp-smart",
      "args": []
    }
  }
}
```

Clients that do not inherit your shell environment should use their secret or environment configuration for `OPENROUTER_API_KEY`.

MCP Smart advertises three tools:

| Tool | Purpose |
| --- | --- |
| `consult` | Run advice, code review, or an expert opinion |
| `smart_doctor` | Report Node.js, API-key presence, and local token and timeout defaults |
| `smart_status` | Inspect cache, rate limits, and circuit breakers |

Only `task` is required for `consult`:

```json
{
  "task": "Review this authentication flow",
  "context": "Node.js API using signed cookies",
  "intent": "code-review",
  "preset": "balanced",
  "fresh": true
}
```

The full input supports:

| Field | Values |
| --- | --- |
| `task` | Required string |
| `context` | Optional supporting text |
| `intent` | `advice`, `code-review`, `expert-opinion` |
| `preset` | `fast`, `balanced`, `best`, `custom` |
| `model` | `openrouter/auto`, `smart-auto`, or a direct OpenRouter model ID, up to 256 characters; required for `custom` |
| `costTier` | `low`, `medium`, `high`, `xhigh`, `max` |
| `allowedModels` | Auto router allowlist, up to 100 IDs of 256 characters each |
| `excludedModels` | Auto router blocklist, up to 100 IDs of 256 characters each |
| `maxTokens` | Integer from 1 through 200000 |
| `sessionId` | Route-affinity session identifier, up to 256 characters |
| `fresh` | Skip cache reads when `true` |

Existing clients may keep calling `smart_advisor`, `code_review`, `get_advice`, `expert_opinion`, `smart_llm`, `ask_expert`, and `review_code`. MCP Smart accepts those aliases but omits them from tool discovery.

### Optional Claude Code command

The npm package includes `smart.md`, an optional `/smart` command that uses the three canonical tools. After a global install, copy it into Claude Code's user command directory:

```zsh
mkdir -p ~/.claude/commands
cp "$(npm root -g)/mcp-smart/smart.md" ~/.claude/commands/smart.md
```

## OpenRouter routing

MCP Smart uses `openrouter/auto` with the `auto-router` plugin when callers omit `model`. Presets set OpenRouter's cost tier:

| Preset | Model | Cost tier |
| --- | --- | --- |
| Fast | `openrouter/auto` | `low` |
| Balanced | `openrouter/auto` | `medium` |
| Best | `openrouter/auto` | `max` |
| Custom | Caller selection | Caller selection |

Balanced serves as the default. A direct OpenRouter model ID bypasses the Auto plugin. The `smart-auto` compatibility value routes to `openai/gpt-5-mini` for controlled comparisons with the prior router.

The OpenRouter client stops after three attempts. It stops at the first rate-limit, quota, authentication, credit, or model-restriction response.

## Receipts

Each successful canonical `consult` call returns readable content and typed receipt data:

```json
{
  "answer": "Add an idempotency key to the write path.",
  "receipt": {
    "requestId": "req-123",
    "requestedModel": "openrouter/auto",
    "selectedModel": "anthropic/claude-sonnet-4.5",
    "provider": "Anthropic",
    "preset": "balanced",
    "costTier": "medium",
    "promptTokens": 420,
    "completionTokens": 180,
    "totalTokens": 600,
    "costUsd": 0.0042,
    "latencyMs": 1340,
    "cacheHit": false
  }
}
```

The hidden legacy `model: "all"` compatibility route keeps its text-only multi-advisor response.

OpenRouter may omit model, provider, token, task classification, or cost metadata. MCP Smart leaves absent values out of the receipt.

Cache identity includes intent, prompt version, route, preset, Auto restrictions, token limit, session ID, task, and context. A cache hit reports its age when available.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Required | OpenRouter authentication |
| `MAX_RETRIES` | `3` | Maximum retry attempts |
| `REQUEST_TIMEOUT` | `30000` | Request timeout in milliseconds |
| `CACHE_TTL` | `300000` | Cache lifetime in milliseconds |
| `MAX_TOKENS` | `4000` | Default response token limit |
| `MAX_CACHE_SIZE` | `100` | Maximum cached responses |
| `MAX_TASK_LENGTH` | `10000` | Maximum task length |
| `MAX_CONTEXT_LENGTH` | `20000` | Maximum context length |
| `RATE_LIMIT_REQUESTS` | `10` | Local requests per window; `0` disables the limiter |
| `RATE_LIMIT_WINDOW` | `60000` | Local rate-limit window in milliseconds |
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | `5` | Failures before opening a circuit |
| `CIRCUIT_BREAKER_RECOVERY_TIMEOUT` | `60000` | Open-circuit recovery delay in milliseconds |
| `CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS` | `3` | Trial calls in half-open state |

## Development

```zsh
git clone https://github.com/sliday/mcp-smart.git
cd mcp-smart
npm install
npm run build
npm test -- --run
```

Run the stdio server from source with `npm run dev`. Run the built CLI with `node dist/index.js --help`.

See the [project wiki](wiki/_index.md), [architecture index](wiki/architecture/_index.md), and [runtime dispatch notes](wiki/architecture/runtime_dispatch.md) for the CLI-to-MCP boundary.

## License and support

MCP Smart uses the MIT license. Report bugs and request features through [GitHub Issues](https://github.com/sliday/mcp-smart/issues).
