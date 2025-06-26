# 🎯 MCP Smart Advisor

A powerful MCP (Model Context Protocol) server that provides intelligent AI routing and multi-advisor consultations through OpenRouter API. Get expert coding advice from 5 premium AI models with smart routing, advanced caching, rate limiting, and security features.

## ✨ Features

- **🧠 Smart Routing System** - Intelligent provider selection based on task requirements
- **🤖 5 Premium AI Providers** - Claude Sonnet 4, OpenAI o3, xAI Grok, Google Gemini Flash, DeepSeek
- **⚡ Intelligent Caching** - LRU cache with configurable TTL to reduce API costs
- **🛡️ Security First** - Input validation, prompt injection detection, and rate limiting
- **📊 Comprehensive Logging** - Structured logging with cache metrics and health monitoring
- **⚙️ Fully Configurable** - Environment variables for all settings
- **🔄 Retry Logic** - Exponential backoff with Promise.allSettled for resilient API calls

## 🚀 Quick Start

### Install via npx
```bash
npx mcp-smart@1.4.0
```

### Install globally
```bash
npm install -g mcp-smart@1.4.0
```

### Run directly
```bash
mcp-smart
```

## 🔧 Configuration

Set your OpenRouter API key and configure the server:

```bash
export OPENROUTER_API_KEY="your-api-key-here"
export MAX_RETRIES=3
export REQUEST_TIMEOUT=30000
export CACHE_TTL=300000
export MAX_TOKENS=4000
export MAX_CACHE_SIZE=100
export RATE_LIMIT_REQUESTS=10
export RATE_LIMIT_WINDOW=60000
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | **Required** | Your OpenRouter API key |
| `MAX_RETRIES` | `3` | Maximum retry attempts for failed requests |
| `REQUEST_TIMEOUT` | `30000` | Request timeout in milliseconds |
| `CACHE_TTL` | `300000` | Cache time-to-live in milliseconds (5 min) |
| `MAX_TOKENS` | `4000` | Maximum tokens per API request |
| `MAX_CACHE_SIZE` | `100` | Maximum number of cached responses |
| `MAX_TASK_LENGTH` | `10000` | Maximum task input length |
| `MAX_CONTEXT_LENGTH` | `20000` | Maximum context input length |
| `RATE_LIMIT_REQUESTS` | `10` | Requests per rate limit window |
| `RATE_LIMIT_WINDOW` | `60000` | Rate limit window in milliseconds (1 min) |

## 🎯 Usage with Claude Code

Add to your `claude-code-config.json`:

```json
{
  "mcpServers": {
    "smart-advisor": {
      "command": "npx",
      "args": ["mcp-smart@1.4.0"],
      "env": {
        "OPENROUTER_API_KEY": "your-openrouter-api-key-here"
      }
    }
  }
}
```

## 🤖 AI Providers & Intelligence Ranking

### Provider Capabilities (Ranked by Intelligence)

| Provider | Intelligence | Cost | Speed | Context | Strengths |
|----------|-------------|------|-------|---------|-----------|
| **Claude Sonnet 4** | 🔥 Ultimate | High | Medium | Very High | Supreme reasoning, ethical coding, comprehensive solutions |
| **OpenAI o3** | 🏆 Highest | Very High | Slow | Medium | Complex reasoning, creativity, advanced coding |
| **xAI Grok** | ⭐ Very High | Medium | Fast | High | Real-time data, creative thinking, fast responses |
| **Google Gemini Flash** | ⭐ Very High | Low | Fast | Highest (2M) | Multimodal, research, long-context, speed |
| **DeepSeek** | ✅ High | Low | Fast | Medium | Cost-effective, coding/logic/math, analysis |

## 🎛️ Smart Routing Strategies

### Routing Options

| Strategy | Provider | Use Case | Description |
|----------|----------|----------|-------------|
| **`auto`** ⚡ | GPT-4o-mini decides | Default smart routing | Intelligent provider selection based on task |
| **`intelligence`** 🔥 | Claude Sonnet 4 | Ultimate reasoning | Most capable model for complex problems |
| **`premium`** 🏆 | OpenAI o3 | Premium alternative | High-end reasoning and creativity |
| **`speed`** 🚀 | xAI Grok | Fast responses | Quick turnaround with real-time data |
| **`balance`** ⚖️ | Google Gemini Flash | Cost/performance | Optimal balance of speed, cost, and capability |
| **`cost`** 💰 | DeepSeek | Budget-friendly | Maximum cost efficiency |
| **`all`** 🌟 | All providers | Comprehensive | Multi-provider consultation |

### Direct Provider Access
- **`claude`** - Force Claude Sonnet 4
- **`openai`** - Force OpenAI o3  
- **`xai`** - Force xAI Grok
- **`google`** - Force Google Gemini Flash
- **`deepseek`** - Force DeepSeek

## 💡 Example Usage

### Smart Auto-Routing (Recommended)
```typescript
// Let GPT-4o-mini choose the best provider
await smart_advisor({
  model: "auto",
  task: "Optimize this React component for performance",
  context: "Component renders 10,000+ items with complex state"
});
```

### Strategy-Based Routing
```typescript
// Maximum intelligence for complex problems
await smart_advisor({
  model: "intelligence", // Routes to Claude Sonnet 4
  task: "Design a fault-tolerant distributed system architecture",
  context: "Microservices with 99.99% uptime requirement"
});

// Speed-optimized responses
await smart_advisor({
  model: "speed", // Routes to xAI Grok
  task: "Quick debugging help for this JavaScript error",
  context: "TypeError in production, need fast solution"
});

// Cost-effective solutions
await smart_advisor({
  model: "cost", // Routes to DeepSeek
  task: "Write a simple sorting algorithm",
  context: "Basic coding task for learning"
});
```

### Multi-Advisor Consultation
```typescript
// Get perspectives from all providers
await smart_advisor({
  model: "all",
  task: "Review this security-critical authentication system",
  context: "OAuth2 implementation handling sensitive user data"
});
```

### Direct Provider Access
```typescript
// Use specific provider directly
await smart_advisor({
  model: "claude",
  task: "Ethical considerations for AI system design",
  context: "Building recommendation engine for social media"
});
```

## 🏗️ Architecture

The server implements a structured 4-persona prompt system:

1. **Manager** - Defines clear requirements and ensures understanding
2. **Smart Technical Advisor** - Creates detailed technical architecture with deep insights
3. **QA** - Implements comprehensive tests covering edge cases and bottlenecks
4. **Engineer** - Provides production-ready, secure, and efficient code

### Smart Routing Flow

```
User Request → GPT-4o-mini Analysis → Provider Selection → Response
                     ↓
           [Task Complexity Assessment]
                     ↓
    [Cost/Performance/Speed Requirements]
                     ↓
           [Optimal Provider Routing]
```

## 🛡️ Security Features

- **Prompt Injection Detection** - Advanced pattern recognition for malicious inputs
- **Script Injection Prevention** - Blocks XSS and code injection attempts
- **Input Validation** - Length limits and comprehensive sanitization
- **Rate Limiting** - Configurable request limits per time window
- **Security Logging** - Detailed audit trail for security events

## 📈 Performance & Monitoring

### Caching System
- **LRU Caching** - Intelligent cache eviction based on usage patterns
- **Cache Metrics** - Real-time hit/miss ratios and performance tracking
- **TTL Management** - Configurable cache expiration

### Resilience Features  
- **Promise.allSettled** - Graceful handling of provider failures
- **Fallback Strategy** - Automatic fallback to Google Gemini Flash
- **Exponential Backoff** - Smart retry logic for transient failures
- **Health Monitoring** - Comprehensive system health checks

### Monitoring Dashboard
```typescript
// Access real-time metrics
const health = server.getHealthCheck();
const cacheMetrics = server.getCacheMetrics();
```

## 🔍 Advanced Features

### Health Monitoring
- System uptime tracking
- Cache performance metrics  
- Rate limit monitoring
- Provider failure tracking
- Version information

### Cache Management
- Hit/miss ratio tracking
- Eviction monitoring
- Size management
- Performance optimization

### Security Monitoring
- Injection attempt detection
- Rate limit violations
- Input validation failures
- Security event logging

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/sliday/mcp-smart.git
cd mcp-smart

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests (44/45 passing)
npm test

# Run tests with coverage
npm run test:coverage
```

## 🧪 Testing

The project maintains high test coverage with 44/45 tests passing:

- Unit tests for all providers and routing strategies
- Integration tests for end-to-end workflows
- Security tests for injection detection
- Performance tests for caching and rate limiting
- Error handling and fallback testing

## 📊 Version History

### v1.4.0 (Latest)
- ✨ Added Claude Sonnet 4 (ultimate intelligence)
- ✨ Added xAI Grok-3-beta (speed optimization)
- ✨ Updated Google to Gemini Flash (cost-effective)
- ✨ Enhanced smart routing with 7 strategies
- ✨ Improved intelligence hierarchy and provider rankings
- 🔧 Enhanced auto-routing decision logic
- 📈 44/45 test coverage

### v1.3.0
- ✨ Smart routing system with auto-selection
- 🔧 Cost/performance-aware provider selection
- 📈 Comprehensive test coverage

### v1.2.0
- 🛡️ Enhanced security with prompt injection detection
- ⚡ Improved caching with metrics tracking
- 🔄 Promise.allSettled for better error handling

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## 🐛 Issues

Report bugs and request features at [GitHub Issues](https://github.com/sliday/mcp-smart/issues).

## 🌟 Support

If you find this project helpful, please give it a star on GitHub!

---

**Built with ❤️ for the MCP ecosystem**  
**Powered by Claude Sonnet 4, OpenAI o3, xAI Grok, Google Gemini Flash, and DeepSeek**