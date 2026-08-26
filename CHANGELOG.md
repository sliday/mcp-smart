# Changelog

## [2.0.0] - 2026-08-26

### Added

- Added an Ink terminal interface with a task editor, route and model selection, terminal-sized result paging, expandable receipts, diagnostics, and setup guidance.
- Added `ask`, `doctor`, `init`, `--help`, and `--version` commands while preserving no-argument stdio MCP startup.
- Added OpenRouter Auto routing with Fast, Balanced, Best, direct-model controls, and explicit two-to-four-model comparisons.

### Changed

- Raised the runtime requirement to Node.js 22 and moved the package to React 19 and Ink 7.
- Load command implementations only when selected, so `--help` and `--version` avoid the MCP and consultation startup cost.
- Aligned advertised MCP schemas with runtime validation for presets, custom OpenRouter model IDs, metadata, and legacy aliases.
- Added route-aware navigation hints, truthful Doctor and Setup stages, nonzero Doctor exit codes for failed required checks, and documented environment settings for limits, retries, caching, and circuit breakers.
- Return route, model, latency, token, cache, and cost metadata only when the provider supplies valid values.
- Updated the Claude intelligence route and TUI advisor list to OpenRouter's Claude Sonnet 5 model ID.

### Fixed

- Made the first Ctrl+C cancel an active request and the second exit with code 130 while restoring the terminal on both paths.
- Propagated cancellation through MCP, CLI, TUI, OpenRouter retries, and legacy `all` fan-out requests.
- Routed the six user-facing legacy advisors through circuit-breaker health accounting, honored per-request token budgets and cache isolation, excluded the routing-only model, rejected all-failed consultations, and kept failed responses out of the cache.
- Rejected OpenRouter provider errors embedded in HTTP 200 responses instead of caching partial content as a successful answer.
- Prevented stale Doctor and Setup completions from replacing the current screen, and bounded Doctor network checks.
- Kept long task previews within small terminals and removed empty answer controls from all-failed comparisons.
- Isolated cached responses by structured input and session, enforced one shared LRU capacity, bounded model filters and token overrides, rejected unknown options, and validated every optional consultation input at runtime.
- Counted full retry latency, stopped on quota and rate-limit failures, and omitted malformed provider metadata.
- Ignored stale half-open failures after a manual circuit-breaker reset.
- Deleted complete emoji and combining-character graphemes, and paged CJK and emoji output by terminal cell width.
- Removed terminal control sequences from model output, preserved the seven prior tool aliases, and blocked vulnerable production dependency versions.
- Made `npm pack` run tests, build runtime files, include the optional Claude Code command, and exclude compiled tests from the package.
