---
description: "Comprehensive task analysis using four specialist sub-agents"
allowed-tools: ["mcp__Smart__smart_advisor", "mcp__Smart__expert_opinion", "mcp__Smart__smart_llm", "mcp__Smart__code_review"]
---

# Smart Task Analysis

## Task Description
$ARGUMENTS

## Context
- Task description: $ARGUMENTS
- Relevant code or files will be referenced ad-hoc using @ file syntax.

## Your Role

You are the Coordinator Agent orchestrating four specialist sub-agents:
1. **Architect Agent** – designs high-level approach using mcp__Smart__smart_advisor
2. **Research Agent** – gathers external knowledge and precedent using mcp__Smart__expert_opinion  
3. **Coder Agent** – writes or edits code using mcp__Smart__smart_llm
4. **Tester Agent** – proposes tests and validation strategy using mcp__Smart__code_review

## Process

1. Think step-by-step, laying out assumptions and unknowns.
2. For each sub-agent, clearly delegate its task using appropriate MCP commands, capture its output, and summarise insights.
3. Perform a "smart reflection" phase where you combine all insights to form a cohesive solution.
4. If gaps remain, iterate (spawn sub-agents again) until confident.

## Output Format

1. **Reasoning Transcript** (optional but encouraged) – show major decision points.
2. **Final Answer** – actionable steps, code edits or commands presented in Markdown.
3. **Next Actions** – bullet list of follow-up items for the team (if any).

---

## Available MCP Smart Commands

### Core Advisory Commands

#### `mcp__Smart__smart_advisor`
**Primary technical guidance with 4-persona approach**
- **Model options**: auto, intelligence, premium, cost, balance, speed, random, all
- **Use case**: Comprehensive technical problems requiring multi-perspective analysis
- **Prompt structure**: Manager → CTO → QA → Engineer workflow

#### `mcp__Smart__expert_opinion` 
**Third-party expert consultation**
- **Model options**: auto, intelligence, premium, cost, balance, speed, random, all
- **Use case**: Industry-specific knowledge and best practices
- **Focus**: External perspective and precedent research

#### `mcp__Smart__get_advice`
**General coding mentorship**
- **Model options**: auto, intelligence, premium, cost, balance, speed, random, all
- **Use case**: Learning-oriented questions and guidance
- **Focus**: Educational approach with explanations

### Code Quality Commands

#### `mcp__Smart__code_review`
**Comprehensive code analysis**
- **Model options**: auto, intelligence, premium, cost, balance, speed, random, all
- **Use case**: Detailed code quality assessment
- **Focus**: Security, performance, maintainability, best practices

#### `mcp__Smart__review_code`
**Detailed code feedback**
- **Model options**: auto, intelligence, premium, cost, balance, speed, random, all
- **Use case**: In-depth code examination with improvement suggestions
- **Focus**: Code quality and optimization

#### `mcp__Smart__smart_llm`
**AI-powered code analysis**
- **Model options**: auto, intelligence, premium, cost, balance, speed, random, all
- **Use case**: Intelligent code suggestions and pattern recognition
- **Focus**: Advanced AI insights for complex coding challenges

#### `mcp__Smart__ask_expert`
**Professional consultation**
- **Model options**: auto, intelligence, premium, cost, balance, speed, random, all
- **Use case**: Professional-level technical guidance
- **Focus**: Industry expertise and professional practices

---

## Model Routing Strategies

### Intelligence Levels
- **intelligence**: Claude Sonnet 4 (ultimate reasoning)
- **premium**: OpenAI o3 (high-end reasoning)
- **auto**: GPT-4o-mini intelligently selects the best provider

### Performance Optimized
- **speed**: xAI Grok (fast responses) 
- **balance**: Google Gemini Flash (cost/performance balance)
- **cost**: DeepSeek (budget-friendly)

### Special Options
- **random**: Randomly select from available providers
- **all**: Multi-provider consultation (all providers)

---

## Command Parameters

All commands accept these parameters:

```json
{
  "model": "auto|intelligence|premium|cost|balance|speed|random|all|deepseek|google|openai|xai|claude",
  "task": "The coding task or problem description",
  "context": "Additional project context (optional)"
}
```

## Usage Examples

### Smart Task Example
```
/smart Implement a distributed caching system with Redis

Context: Node.js microservices architecture, need horizontal scaling
```

### Individual Command Examples
```
mcp__Smart__smart_advisor:
- model: "intelligence" 
- task: "Design microservices communication patterns"
- context: "E-commerce platform with 10M+ users"

mcp__Smart__code_review:
- model: "premium"
- task: "Review authentication middleware implementation"
- context: "Security-critical banking application"
```

## Integration with Claude Code

Add to your `~/.claude/CLAUDE.md`:

```markdown
When facing uncertainty and needing advice, you have exclusive access to Smart advisor. Use these MCP commands:
- smart_advisor (comprehensive technical guidance)
- code_review (detailed code analysis) 
- expert_opinion (industry expertise)
- smart_llm (AI-powered insights)
- get_advice (mentorship approach)
- ask_expert (professional consultation)
- review_code (quality assessment)
```