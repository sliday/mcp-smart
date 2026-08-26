---
description: "Analyze a task through focused architecture, implementation, and verification consultations"
allowed-tools: ["mcp__Smart__consult", "mcp__Smart__smart_doctor", "mcp__Smart__smart_status"]
---

# Smart Task Analysis

## Task Description
$ARGUMENTS

## Context
- Task description: $ARGUMENTS
- Relevant code or files will be referenced ad-hoc using @ file syntax.

## Process

1. Check `smart_status` when route health or cache state could change the recommendation.
2. Use `consult` for the smallest set of independent perspectives the task needs.
3. Set `intent` to `code-review` for code assessment or `expert-opinion` for a specialist perspective. Use `advice` for architecture and implementation guidance.
4. Combine agreements, disagreements, and trade-offs into one recommendation.
5. End with concrete implementation and verification steps.

## Output Format

1. Decision and rationale
2. Implementation steps or code changes
3. Verification evidence and remaining risks

---

## Canonical MCP Commands

### `mcp__Smart__consult`

Runs one OpenRouter consultation. It returns readable text plus a typed receipt when OpenRouter supplies route, model, latency, token, cache, or cost metadata.

Required parameter:

- `task`: Non-empty task text.

Optional parameters:

- `context`: Project context preserved as supplied.
- `intent`: `advice`, `code-review`, or `expert-opinion`.
- `preset`: `fast`, `balanced`, `best`, or `custom`.
- `model`: A direct OpenRouter model ID up to 256 characters. `preset: "custom"` requires it.
- `costTier`: `low`, `medium`, `high`, `xhigh`, or `max` for OpenRouter Auto.
- `allowedModels` and `excludedModels`: OpenRouter model ID lists with up to 100 entries of 256 characters each.
- `maxTokens`: Integer response limit from 1 through 200000.
- `sessionId`: Cache isolation key up to 256 characters.
- `fresh`: Bypass a cached response when `true`.

### `mcp__Smart__smart_doctor`

Reports the Node.js version, whether an API key exists, and the configured token and request-timeout defaults without exposing the key. Run `mcp-smart doctor` for terminal, OpenRouter authentication, and default-route checks.

### `mcp__Smart__smart_status`

Reports service health, circuit breakers, cache metrics, rate-limit state, and the package version.

## Routing

- `fast`: OpenRouter Auto with a low cost tier.
- `balanced`: OpenRouter Auto with a medium cost tier.
- `best`: OpenRouter Auto with the max cost tier.
- `custom`: A direct OpenRouter model ID supplied in `model`.

OpenRouter chooses the provider for Auto routes. A receipt may name the selected provider and model when OpenRouter returns that metadata.

## Usage Examples

```yaml
mcp__Smart__consult:
  task: "Review the authentication middleware for failure modes"
  context: "Node.js MCP server; preserve public error codes"
  intent: "code-review"
  preset: "balanced"
  sessionId: "auth-review"
```

For a direct model:

```yaml
mcp__Smart__consult:
  task: "Compare two cache invalidation strategies"
  intent: "expert-opinion"
  preset: "custom"
  model: "openai/gpt-5"
  fresh: true
```

## Compatibility

Version 2 advertises `consult`, `smart_doctor`, and `smart_status`. The seven version 1 consultation names remain callable as hidden aliases for existing clients.

## Integration with Claude Code

Add to your `~/.claude/CLAUDE.md`:

```markdown
When a technical decision needs an independent perspective, call Smart's `consult` tool. Use `smart_doctor` for setup problems and `smart_status` for route health.
```
