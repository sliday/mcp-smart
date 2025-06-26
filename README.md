# 🎯 MCP Smart Advisor

A powerful MCP (Model Context Protocol) server that provides multi-advisor AI consultations through OpenRouter API. Get expert coding advice from multiple premium AI models simultaneously with advanced caching, rate limiting, and security features.

## ✨ Features

- **🤖 Multi-Advisor Consultations** - Query DeepSeek, Google Gemini, and OpenAI simultaneously
- **⚡ Intelligent Caching** - LRU cache with configurable TTL to reduce API costs
- **🛡️ Security First** - Input validation, sanitization, and rate limiting
- **📊 Comprehensive Logging** - Structured logging for monitoring and debugging
- **⚙️ Fully Configurable** - Environment variables for all settings
- **🔄 Retry Logic** - Exponential backoff for resilient API calls

## 🚀 Quick Start

### Install via npx
```bash
npx mcp-smart
```

### Install globally
```bash
npm install -g mcp-smart
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
      "args": ["mcp-smart"],
      "env": {
        "OPENROUTER_API_KEY": "your-openrouter-api-key-here"
      }
    }
  }
}
```

## 🤖 Available Models

- **DeepSeek** (`deepseek`) - DeepSeek Chat v3
- **Google Gemini** (`google`) - Gemini 2.5 Pro  
- **OpenAI** (`openai`) - GPT-4
- **All Advisors** (`all`) - Query all models simultaneously

## 💡 Example Usage

### Single Advisor
```typescript
// Query a specific model
await smart_advisor({
  model: "google",
  task: "Optimize this React component for performance",
  context: "This component renders a large list of items"
});
```

### Multi-Advisor Consultation
```typescript
// Get advice from all three advisors
await smart_advisor({
  model: "all", 
  task: "Design a scalable microservices architecture",
  context: "E-commerce platform with 1M+ users"
});
```

## 🏗️ Architecture

The server implements a structured 4-persona prompt system:

1. **Manager** - Defines clear requirements
2. **CTO** - Creates detailed technical architecture  
3. **QA** - Implements comprehensive tests
4. **Engineer** - Provides production-ready code

## 🛡️ Security Features

- **Input Validation** - Length limits and injection pattern detection
- **Rate Limiting** - Configurable request limits per time window
- **Input Sanitization** - Removes control characters and normalizes input
- **Error Handling** - Custom error types with security-conscious messaging

## 📈 Performance

- **LRU Caching** - Intelligent cache eviction based on usage patterns
- **Parallel Execution** - Multi-advisor queries run concurrently
- **Connection Pooling** - Efficient HTTP connection management
- **Exponential Backoff** - Smart retry logic for transient failures

## 🔍 Monitoring

Comprehensive logging includes:
- Request/response metrics
- Cache hit/miss ratios
- Rate limit violations
- Security events
- Performance timings

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

# Run tests
npm test
```

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