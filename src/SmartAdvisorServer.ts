import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosError } from 'axios';
import {
  buildConsultationCacheKey,
  type ConsultInput,
  type ConsultationIntent,
  type ConsultationResult,
  type SmartErrorDetails,
} from './contracts.js';
import { OpenRouterClient, OpenRouterError } from './openrouter.js';

enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

class Logger {
  constructor(private context: string) {}

  private log(level: LogLevel, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    console.error(`[${timestamp}] [${levelName}] [${this.context}] ${message}`, ...args);
  }

  error(message: string, ...args: any[]) {
    this.log(LogLevel.ERROR, message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.log(LogLevel.WARN, message, ...args);
  }

  info(message: string, ...args: any[]) {
    this.log(LogLevel.INFO, message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this.log(LogLevel.DEBUG, message, ...args);
  }
}

const MODELS = {
  'deepseek': 'deepseek/deepseek-v3.2-exp',
  'google': 'google/gemini-3.1-pro-preview',
  'openai': 'openai/gpt-5-pro',
  'xai': 'x-ai/grok-4.6',
  'claude': 'anthropic/claude-sonnet-4.5',
  'moonshot': 'moonshotai/kimi-k2-thinking',
  'router': 'openai/gpt-5-mini' // For routing decisions
} as const;

const MAX_MODEL_ID_LENGTH = 256;
const MAX_MODEL_FILTERS = 100;
const MAX_REQUEST_TOKENS = 200_000;
const MAX_SESSION_ID_LENGTH = 256;
const CONSULTATION_INPUT_KEYS = new Set([
  'task', 'context', 'intent', 'preset', 'model', 'costTier', 'allowedModels',
  'excludedModels', 'maxTokens', 'sessionId', 'fresh',
]);

const LEGACY_MODEL_ROUTES: Record<string, string> = {
  auto: 'openrouter/auto',
  intelligence: MODELS.claude,
  premium: MODELS.openai,
  cost: MODELS.deepseek,
  balance: MODELS.google,
  speed: MODELS.xai,
  deepseek: MODELS.deepseek,
  google: MODELS.google,
  openai: MODELS.openai,
  xai: MODELS.xai,
  claude: MODELS.claude,
  moonshot: MODELS.moonshot,
};

const MODEL_NAMES = {
  'deepseek': 'DeepSeek v3.2',
  'google': 'Google Gemini 3 Pro',
  'openai': 'OpenAI GPT-5 Pro',
  'xai': 'xAI Grok 4',
  'claude': 'Anthropic Claude Sonnet 4.5',
  'moonshot': 'Moonshot Kimi-K2 Thinking',
  'router': 'GPT-5 Mini Router'
} as const;

// Provider capabilities and cost tiers (ranked by intelligence: Claude > OpenAI > XAI/Google > DeepSeek)
const PROVIDER_SPECS = {
  'deepseek': {
    cost: 'low',           // Very cheap
    intelligence: 'high',   // Good reasoning
    context: 'medium',     // Standard context window
    speed: 'fast',         // Fast responses
    strengths: ['coding', 'logic', 'math', 'analysis', 'cost-efficiency']
  },
  'google': {
    cost: 'low',           // Low pricing with Flash
    intelligence: 'very-high', // Excellent reasoning
    context: 'highest',    // Largest context window (2M tokens)
    speed: 'fast',         // Fast responses with Flash
    strengths: ['reasoning', 'research', 'long-context', 'multimodal', 'speed']
  },
  'openai': {
    cost: 'very-high',     // Very expensive
    intelligence: 'highest', // Top-tier reasoning
    context: 'medium',     // Standard context
    speed: 'slow',         // Slower but very high quality
    strengths: ['complex-reasoning', 'creativity', 'advanced-coding', 'problem-solving']
  },
  'xai': {
    cost: 'medium',        // Mid-tier pricing
    intelligence: 'very-high', // Strong reasoning
    context: 'high',       // Large context window
    speed: 'fast',         // Fast responses
    strengths: ['reasoning', 'real-time-data', 'social-context', 'creative-thinking']
  },
  'claude': {
    cost: 'high',          // Premium pricing
    intelligence: 'ultimate', // Supreme reasoning capability
    context: 'very-high',  // Very large context window (200k tokens)
    speed: 'medium',       // Balanced speed
    strengths: ['ultimate-reasoning', 'deep-analysis', 'ethical-coding', 'comprehensive-solutions', 'nuanced-understanding']
  },
  'moonshot': {
    cost: 'medium',        // Mid-tier pricing
    intelligence: 'very-high', // Strong reasoning capability
    context: 'highest',    // Very large context window (2M tokens)
    speed: 'fast',         // Fast responses
    strengths: ['chinese-language', 'reasoning', 'coding', 'long-context', 'multimodal']
  }
} as const;

// Model routing strategies
const ROUTING_STRATEGIES = {
  'auto': 'Let GPT-4o-mini choose the best provider for this specific task',
  'intelligence': 'Prioritize the most capable model (Claude Sonnet 4)',
  'cost': 'Prioritize the most cost-effective model (DeepSeek)',
  'balance': 'Balance cost and performance (Google Gemini Flash)',
  'speed': 'Prioritize fastest responses (xAI Grok)',
  'premium': 'Use premium intelligence (OpenAI o3)',
  'random': 'Randomly select from available providers',
  'all': 'Consult all providers',
  // Original providers still work
  'deepseek': 'Force DeepSeek',
  'google': 'Force Google Gemini Flash', 
  'openai': 'Force OpenAI o3',
  'xai': 'Force xAI Grok',
  'claude': 'Force Claude Sonnet 4',
  'moonshot': 'Force Moonshot Kimi-K2'
} as const;

const TOOL_SPECIFIC_ROLES = {
  smart_advisor: {
    role: "Smart Technical Advisor",
    focus: "providing comprehensive technical guidance",
    description: "You are a senior technical advisor who provides strategic coding guidance with deep architectural insights."
  },
  code_review: {
    role: "Senior Code Reviewer",
    focus: "conducting thorough code reviews",
    description: "You are a meticulous senior developer specializing in code quality, security, performance, and best practices."
  },
  get_advice: {
    role: "Coding Mentor",
    focus: "providing practical coding advice",
    description: "You are an experienced coding mentor who helps developers solve problems with clear, actionable advice."
  },
  expert_opinion: {
    role: "Technical Expert",
    focus: "providing expert technical opinions",
    description: "You are a distinguished technical expert who provides authoritative opinions on complex technical matters."
  },
  smart_llm: {
    role: "AI Code Analyst",
    focus: "intelligent code analysis and optimization",
    description: "You are an advanced AI system specialized in deep code analysis, pattern recognition, and intelligent suggestions."
  },
  ask_expert: {
    role: "Industry Expert",
    focus: "sharing professional expertise",
    description: "You are a seasoned industry professional with years of experience solving real-world coding challenges."
  },
  review_code: {
    role: "Code Quality Specialist",
    focus: "comprehensive code evaluation",
    description: "You are a code quality specialist who performs detailed code evaluations focusing on maintainability, scalability, and robustness."
  }
};

const SMART_ADVISOR_PROMPT = `Split yourself to four personas:

1. Manager: The "brain" of the team. Defines clear, understandable requirements for the CTO in simple yet detailed terms. I need this persona to ensure you understand the task correctly. Manager speaks only to CTO.
2. CTO: Lead developer. Gets tasks from Manager, implementing detailed architecture. Adept at best DX methodologies: DRY, SOLID, KISS, TDD. CTO speaks to Manager, QA and Engineer. See "FULL CTO DESCRIPTION" section below.
3. QA: Gets technical description from CTO and implements unit tests covering common states, edge cases, potential bottlenecks and invalid data.
4. Engineer: Senior L6 Google developer implements code per CTO instructions and QA test files. Can consult CTO and QA to clarify ambiguous information, request test updates if interface changes needed, and must get CTO approval to deviate from provided instructions and tests.

Working flow (MUST FOLLOW):
Manager -> CTO -> QA -> Engineer -> QA -> CTO -> Manager

FULL CTO DESCRIPTION: 
~~~~~~
You are an expert coding assistant in languages like Markdown, JavaScript, HTML, CSS, Python, and Node.js. Your goal is to provide concise, clear, readable, efficient, and bug-free code solutions that follow best practices and modern standards.

When debugging, consider 5-7 possible problem sources, identify the 1-2 most likely causes, and add logs to validate your assumptions before implementing fixes.

1. Analyze the code and question:
   In <code_analysis> tags:
   - Identify the programming language used
   - Assess the difficulty level of the task (Easy, Medium, or Hard)
   - Identify key components or functions in the existing code
   - Quote relevant parts of the existing code that relate to the user's question
   - Provide a brief summary of what the existing code does
   - Break down the problem into smaller components
   - Consider potential best practices and optimizations
   - Create a Mermaid diagram to visualize the solution structure

2. Plan your approach:
   In <solution_plan> tags:
   Write detailed, numbered pseudocode outlining your solution strategy. Include comments explaining the reasoning behind each step. It's OK for this section to be quite long.

3. Confirm your understanding:
   Briefly restate the problem and your planned approach to ensure you've correctly interpreted the user's needs.

4. Implement the solution:
   Provide your code implementation, adhering to the following principles:
   - Write bug-free, secure, and efficient code
   - Prioritize readability and maintainability
   - Implement all required functionality completely
   - Avoid placeholders
   - Be concise while maintaining clarity
   - Use the latest relevant technologies and best practices

5. Verify the solution:
   Explain how your implementation meets the requirements and addresses the user's question.

6. Consider improvements:
   Briefly discuss any potential optimizations or alternative approaches, if applicable.

Please format your response as follows:

<difficulty_level>[Easy/Medium/Hard]</difficulty_level>

<code_analysis>
[Your detailed analysis, including the Mermaid diagram]
</code_analysis>

<solution_plan>
[Your detailed, numbered pseudocode with comments]
</solution_plan>

Confirmation: [Your understanding of the problem and approach]

Code:
\`\`\`[language]
// [Filename (if applicable)]
[Your implemented code]
\`\`\`

Verification: [Explanation of how the solution meets the requirements]

Potential Improvements: [Brief discussion of optimizations or alternatives] 
~~~~~~`;

export function buildToolSpecificPrompt(toolName: string): string {
  const toolRole = TOOL_SPECIFIC_ROLES[toolName as keyof typeof TOOL_SPECIFIC_ROLES];
  
  if (!toolRole) {
    return SMART_ADVISOR_PROMPT;
  }

  return `You are acting as a ${toolRole.role}, ${toolRole.focus}.

${toolRole.description}

Split yourself to four personas:

1. Manager: The "brain" of the team. Defines clear, understandable requirements for the ${toolRole.role} in simple yet detailed terms. I need this persona to ensure you understand the task correctly. Manager speaks only to ${toolRole.role}.
2. ${toolRole.role}: Lead developer with specialized expertise in ${toolRole.focus}. Gets tasks from Manager, implementing detailed architecture. Adept at best DX methodologies: DRY, SOLID, KISS, TDD. ${toolRole.role} speaks to Manager, QA and Engineer. See "FULL ${toolRole.role.toUpperCase()} DESCRIPTION" section below.
3. QA: Gets technical description from ${toolRole.role} and implements unit tests covering common states, edge cases, potential bottlenecks and invalid data.
4. Engineer: Senior L6 Google developer implements code per ${toolRole.role} instructions and QA test files. Can consult ${toolRole.role} and QA to clarify ambiguous information, request test updates if interface changes needed, and must get ${toolRole.role} approval to deviate from provided instructions and tests.

Working flow (MUST FOLLOW):
Manager -> ${toolRole.role} -> QA -> Engineer -> QA -> ${toolRole.role} -> Manager

FULL ${toolRole.role.toUpperCase()} DESCRIPTION: 
~~~~~~
You are an expert coding assistant in languages like Markdown, JavaScript, HTML, CSS, Python, and Node.js. Your goal is to provide concise, clear, readable, efficient, and bug-free code solutions that follow best practices and modern standards.

As a ${toolRole.role}, you specialize in ${toolRole.focus} and bring that expertise to every solution.

When debugging, consider 5-7 possible problem sources, identify the 1-2 most likely causes, and add logs to validate your assumptions before implementing fixes.

1. Analyze the code and question:
   In <code_analysis> tags:
   - Identify the programming language used
   - Assess the difficulty level of the task (Easy, Medium, or Hard)
   - Identify key components or functions in the existing code
   - Quote relevant parts of the existing code that relate to the user's question
   - Provide a brief summary of what the existing code does
   - Break down the problem into smaller components
   - Consider potential best practices and optimizations
   - Create a Mermaid diagram to visualize the solution structure

2. Plan your approach:
   In <solution_plan> tags:
   Write detailed, numbered pseudocode outlining your solution strategy. Include comments explaining the reasoning behind each step. It's OK for this section to be quite long.

3. Confirm your understanding:
   Briefly restate the problem and your planned approach to ensure you've correctly interpreted the user's needs.

4. Implement the solution:
   Provide your code implementation, adhering to the following principles:
   - Write bug-free, secure, and efficient code
   - Prioritize readability and maintainability
   - Implement all required functionality completely
   - Avoid placeholders
   - Be concise while maintaining clarity
   - Use the latest relevant technologies and best practices

5. Verify the solution:
   Explain how your implementation meets the requirements and addresses the user's question.

6. Consider improvements:
   Briefly discuss any potential optimizations or alternative approaches, if applicable.

Please format your response as follows:

<difficulty_level>[Easy/Medium/Hard]</difficulty_level>

<code_analysis>
[Your detailed analysis, including the Mermaid diagram]
</code_analysis>

<solution_plan>
[Your detailed, numbered pseudocode with comments]
</solution_plan>

Confirmation: [Your understanding of the problem and approach]

Code:
\`\`\`[language]
// [Filename (if applicable)]
[Your implemented code]
\`\`\`

Verification: [Explanation of how the solution meets the requirements]

Potential Improvements: [Brief discussion of optimizations or alternatives] 
~~~~~~`;
}

interface Config {
  openrouterApiKey: string;
  maxRetries: number;
  requestTimeout: number;
  cacheTtl: number;
  maxTokens: number;
  maxCacheSize: number;
  maxTaskLength: number;
  maxContextLength: number;
  rateLimitRequests: number;
  rateLimitWindow: number;
  circuitBreaker: CircuitBreakerConfig;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  hitRate: number;
}

interface CircuitBreakerMetrics {
  failures: number;
  successes: number;
  state: CircuitBreakerState;
  lastFailureTime: number;
  consecutiveFailures: number;
  totalRequests: number;
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenMaxCalls: number;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

class SmartAdvisorError extends Error {
  public readonly details: SmartErrorDetails;

  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'SmartAdvisorError';
    this.details = {
      code,
      message,
      action: code.startsWith('CIRCUIT_BREAKER')
        ? 'Wait for provider recovery or choose another route.'
        : 'Review the request and try again.',
    };
  }
}

function stableErrorDetails(error: unknown): SmartErrorDetails | undefined {
  if (typeof error !== 'object' || error === null || !('details' in error)) return undefined;
  const details = (error as {details?: unknown}).details;
  if (typeof details !== 'object' || details === null) return undefined;
  const record = details as Record<string, unknown>;
  if (typeof record.code !== 'string' || typeof record.message !== 'string' ||
      typeof record.action !== 'string') return undefined;
  const safe: SmartErrorDetails = {
    code: record.code,
    message: record.message,
    action: record.action,
  };
  if (typeof record.requestId === 'string') safe.requestId = record.requestId;
  if (typeof record.retryAfterMs === 'number' && Number.isFinite(record.retryAfterMs)) {
    safe.retryAfterMs = record.retryAfterMs;
  }
  return safe;
}

class CircuitBreaker {
  private metrics: CircuitBreakerMetrics;
  private config: CircuitBreakerConfig;
  private logger: Logger;
  private halfOpenCalls: number = 0;

  constructor(config: CircuitBreakerConfig, logger: Logger, providerName: string) {
    this.config = config;
    this.logger = new Logger(`CircuitBreaker-${providerName}`);
    this.metrics = {
      failures: 0,
      successes: 0,
      state: CircuitBreakerState.CLOSED,
      lastFailureTime: 0,
      consecutiveFailures: 0,
      totalRequests: 0
    };
  }

  public async execute<T>(
    operation: () => Promise<T>,
    shouldCountFailure: (error: unknown) => boolean = () => true,
  ): Promise<T> {
    this.metrics.totalRequests++;
    let halfOpenTrial = false;

    if (this.metrics.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.metrics.state = CircuitBreakerState.HALF_OPEN;
        this.halfOpenCalls = 0;
        this.logger.info('Circuit breaker transitioning to HALF_OPEN state');
      } else {
        throw new SmartAdvisorError(
          'Circuit breaker is OPEN - provider temporarily unavailable',
          'CIRCUIT_BREAKER_OPEN'
        );
      }
    }

    if (this.metrics.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        throw new SmartAdvisorError(
          'Circuit breaker HALF_OPEN call limit exceeded',
          'CIRCUIT_BREAKER_HALF_OPEN_LIMIT'
        );
      }
      this.halfOpenCalls++;
      halfOpenTrial = true;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      if (shouldCountFailure(error)) {
        this.onFailure();
      } else if (halfOpenTrial && this.metrics.state === CircuitBreakerState.HALF_OPEN) {
        this.halfOpenCalls = Math.max(0, this.halfOpenCalls - 1);
      }
      throw error;
    }
  }

  private onSuccess(): void {
    this.metrics.successes++;
    this.metrics.consecutiveFailures = 0;
    
    if (this.metrics.state === CircuitBreakerState.HALF_OPEN) {
      this.metrics.state = CircuitBreakerState.CLOSED;
      this.halfOpenCalls = 0;
      this.logger.info('Circuit breaker reset to CLOSED state after successful recovery');
    }
  }

  private onFailure(): void {
    this.metrics.failures++;
    this.metrics.consecutiveFailures++;
    this.metrics.lastFailureTime = Date.now();

    if (this.metrics.state === CircuitBreakerState.HALF_OPEN) {
      this.metrics.state = CircuitBreakerState.OPEN;
      this.halfOpenCalls = 0;
      this.logger.warn('Circuit breaker opened due to failure in HALF_OPEN state');
    } else if (this.metrics.consecutiveFailures >= this.config.failureThreshold) {
      this.metrics.state = CircuitBreakerState.OPEN;
      this.logger.warn(`Circuit breaker opened after ${this.metrics.consecutiveFailures} consecutive failures`);
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.metrics.lastFailureTime >= this.config.recoveryTimeout;
  }

  public getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  public getState(): CircuitBreakerState {
    return this.metrics.state;
  }

  public reset(): void {
    this.metrics.state = CircuitBreakerState.CLOSED;
    this.metrics.consecutiveFailures = 0;
    this.metrics.failures = 0;
    this.metrics.successes = 0;
    this.halfOpenCalls = 0;
    this.logger.info('Circuit breaker manually reset');
  }
}

function isTransientProviderFailure(error: unknown): boolean {
  if (!(error instanceof OpenRouterError)) return false;
  return ['REQUEST_TIMEOUT', 'NO_PROVIDER_AVAILABLE'].includes(error.details.code);
}

function matchesConsultationSchema(raw: Record<string, unknown>): boolean {
  const presets = new Set(['fast', 'balanced', 'best', 'custom']);
  const costTiers = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
  const intents = new Set(['advice', 'code-review', 'expert-opinion']);
  const boundedString = (value: unknown, maxLength: number) =>
    typeof value === 'string' && value.length >= 1 && value.length <= maxLength;
  const stringArray = (value: unknown) => Array.isArray(value)
    && value.length <= MAX_MODEL_FILTERS
    && value.every(item => boundedString(item, MAX_MODEL_ID_LENGTH));
  if (Object.keys(raw).some(key => !CONSULTATION_INPUT_KEYS.has(key))) return false;
  if (raw.preset === 'custom' && !boundedString(raw.model, MAX_MODEL_ID_LENGTH)) return false;
  return (raw.intent === undefined || typeof raw.intent === 'string' && intents.has(raw.intent))
    && (raw.preset === undefined || typeof raw.preset === 'string' && presets.has(raw.preset))
    && (raw.model === undefined || boundedString(raw.model, MAX_MODEL_ID_LENGTH))
    && (raw.costTier === undefined || typeof raw.costTier === 'string' && costTiers.has(raw.costTier))
    && (raw.allowedModels === undefined || stringArray(raw.allowedModels))
    && (raw.excludedModels === undefined || stringArray(raw.excludedModels))
    && (raw.maxTokens === undefined || typeof raw.maxTokens === 'number' && Number.isInteger(raw.maxTokens) && raw.maxTokens >= 1 && raw.maxTokens <= MAX_REQUEST_TOKENS)
    && (raw.sessionId === undefined || boundedString(raw.sessionId, MAX_SESSION_ID_LENGTH))
    && (raw.fresh === undefined || typeof raw.fresh === 'boolean');
}

export class SmartAdvisorServer {
  private server: Server;
  private config: Config;
  private requestCache = new Map<string, { response: string; timestamp: number; lastAccessedAt: number; accessCount: number }>();
  private cacheMetrics: CacheMetrics = { hits: 0, misses: 0, evictions: 0, totalRequests: 0, hitRate: 0 };
  private cacheAccessSequence = 0;
  private logger = new Logger('SmartAdvisorServer');
  private rateLimitTracker = new Map<string, { count: number; windowStart: number }>();
  private startTime = Date.now();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private consultationCache = new Map<string, { result: ConsultationResult; timestamp: number; lastAccessedAt: number }>();

  constructor() {
    this.config = this.loadConfig();
    this.logger.info('SmartAdvisorServer initializing', { 
      maxCacheSize: this.config.maxCacheSize,
      cacheTtl: this.config.cacheTtl,
      circuitBreakerConfig: this.config.circuitBreaker
    });
    
    this.server = new Server(
      {
        name: 'smart-advisor',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.initializeCircuitBreakers();
    this.setupToolHandlers();
    this.logger.info('SmartAdvisorServer initialized successfully');
  }

  private initializeCircuitBreakers(): void {
    // Initialize circuit breakers for each AI provider
    const providers = [...Object.keys(MODELS).filter(k => k !== 'router'), 'openrouter'];
    
    providers.forEach(provider => {
      const circuitBreaker = new CircuitBreaker(
        this.config.circuitBreaker,
        this.logger,
        provider
      );
      this.circuitBreakers.set(provider, circuitBreaker);
    });
    
    this.logger.info('Circuit breakers initialized', { 
      providers: providers,
      config: this.config.circuitBreaker 
    });
  }

  private loadConfig(): Config {
    const apiKey = process.env.OPENROUTER_API_KEY ?? '';

    return {
      openrouterApiKey: apiKey,
      maxRetries: this.environmentInteger('MAX_RETRIES', 3, 1, 3),
      requestTimeout: this.environmentInteger('REQUEST_TIMEOUT', 30000, 1),
      cacheTtl: this.environmentInteger('CACHE_TTL', 300000, 0),
      maxTokens: this.environmentInteger('MAX_TOKENS', 4000, 1, MAX_REQUEST_TOKENS),
      maxCacheSize: this.environmentInteger('MAX_CACHE_SIZE', 100, 1),
      maxTaskLength: this.environmentInteger('MAX_TASK_LENGTH', 10000, 1),
      maxContextLength: this.environmentInteger('MAX_CONTEXT_LENGTH', 20000, 1),
      rateLimitRequests: this.environmentInteger('RATE_LIMIT_REQUESTS', 10, 0),
      rateLimitWindow: this.environmentInteger('RATE_LIMIT_WINDOW', 60000, 1),
      circuitBreaker: {
        failureThreshold: this.environmentInteger('CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5, 1),
        recoveryTimeout: this.environmentInteger('CIRCUIT_BREAKER_RECOVERY_TIMEOUT', 60000, 0),
        halfOpenMaxCalls: this.environmentInteger('CIRCUIT_BREAKER_HALF_OPEN_MAX_CALLS', 3, 1)
      }
    };
  }

  private environmentInteger(name: string, fallback: number, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      this.logger.warn('Invalid numeric environment value; using default', {name, fallback});
      return fallback;
    }
    return value;
  }

  private validateInput(task: string, context: string): ValidationResult {
    // Input length validation
    if (task.length > this.config.maxTaskLength) {
      return {
        isValid: false,
        error: `Task exceeds maximum length of ${this.config.maxTaskLength} characters`
      };
    }

    if (context.length > this.config.maxContextLength) {
      return {
        isValid: false,
        error: `Context exceeds maximum length of ${this.config.maxContextLength} characters`
      };
    }

    // Enhanced security validation - check for injection patterns
    const scriptInjectionPatterns = [
      /<script[^>]*>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:text\/html/i,
      /vbscript:/i
    ];

    // Prompt injection patterns
    const promptInjectionPatterns = [
      /ignore\s+(previous|above|all|the)\s+(instructions?|prompts?|rules?)/i,
      /forget\s+(everything|all|previous)/i,
      /system\s*[:]\s*you\s+are\s+now/i,
      /act\s+as\s+if\s+you\s+are/i,
      /pretend\s+(you\s+are|to\s+be)/i,
      /roleplay\s+as/i,
      /new\s+(instructions?|rules?|system\s+prompt)/i,
      /disregard\s+(previous|all|above)/i,
      /override\s+(instructions?|system|previous)/i,
      /simulate\s+(being|you\s+are)/i,
      /\[SYSTEM\]/i,
      /\<\|system\|\>/i,
      /```\s*system/i
    ];

    const combinedInput = task + ' ' + context;
    
    // Check for script injection
    for (const pattern of scriptInjectionPatterns) {
      if (pattern.test(combinedInput)) {
        this.logger.warn('Script injection attempt detected', { 
          pattern: pattern.source,
          inputLength: combinedInput.length 
        });
        return {
          isValid: false,
          error: 'Input contains potentially malicious script content'
        };
      }
    }

    // Check for prompt injection
    for (const pattern of promptInjectionPatterns) {
      if (pattern.test(combinedInput)) {
        this.logger.warn('Prompt injection attempt detected', { 
          pattern: pattern.source,
          inputLength: combinedInput.length 
        });
        return {
          isValid: false,
          error: 'Input contains potential prompt injection patterns'
        };
      }
    }

    return { isValid: true };
  }

  private sanitizeInput(input: string): string {
    return input
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private checkRateLimit(clientId: string = 'default'): boolean {
    const now = Date.now();
    const clientData = this.rateLimitTracker.get(clientId);

    if (!clientData) {
      this.rateLimitTracker.set(clientId, { count: 1, windowStart: now });
      return true;
    }

    // Reset window if expired
    if (now - clientData.windowStart > this.config.rateLimitWindow) {
      this.rateLimitTracker.set(clientId, { count: 1, windowStart: now });
      return true;
    }

    // Check if limit exceeded
    if (clientData.count >= this.config.rateLimitRequests) {
      this.logger.warn('Rate limit exceeded', { 
        clientId, 
        count: clientData.count, 
        limit: this.config.rateLimitRequests 
      });
      return false;
    }

    // Increment counter
    clientData.count++;
    this.rateLimitTracker.set(clientId, clientData);
    return true;
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return this.listTools();
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      try {
        return await this.callTool(request.params.name, request.params.arguments, extra.signal);
      } catch (error) {
        const details = stableErrorDetails(error);
        if (details === undefined) throw error;
        return this.errorResult(details);
      }
    });
  }

  async listTools(): Promise<any> {
    const inputSchema = {
      type: 'object',
      properties: {
        task: {type: 'string', minLength: 1, maxLength: this.config.maxTaskLength, description: 'The task or problem to consult on'},
        context: {type: 'string', maxLength: this.config.maxContextLength, description: 'Optional supporting context'},
        intent: {type: 'string', enum: ['advice', 'code-review', 'expert-opinion']},
        preset: {type: 'string', enum: ['fast', 'balanced', 'best', 'custom']},
        model: {type: 'string', minLength: 1, maxLength: MAX_MODEL_ID_LENGTH},
        costTier: {type: 'string', enum: ['low', 'medium', 'high', 'xhigh', 'max']},
        allowedModels: {type: 'array', maxItems: MAX_MODEL_FILTERS, items: {type: 'string', minLength: 1, maxLength: MAX_MODEL_ID_LENGTH}},
        excludedModels: {type: 'array', maxItems: MAX_MODEL_FILTERS, items: {type: 'string', minLength: 1, maxLength: MAX_MODEL_ID_LENGTH}},
        maxTokens: {type: 'integer', minimum: 1, maximum: MAX_REQUEST_TOKENS},
        sessionId: {type: 'string', minLength: 1, maxLength: MAX_SESSION_ID_LENGTH},
        fresh: {type: 'boolean'},
      },
      required: ['task'],
      additionalProperties: false,
      allOf: [{
        if: {properties: {preset: {const: 'custom'}}, required: ['preset']},
        then: {required: ['task', 'model']},
      }],
    };
    const outputSchema = {
      type: 'object',
      properties: {
        answer: {type: 'string'},
        receipt: {
          type: 'object',
          properties: {
            requestId: {type: 'string'},
            requestedModel: {type: 'string'},
            selectedModel: {type: 'string'},
            provider: {type: 'string'},
            preset: {type: 'string', enum: ['fast', 'balanced', 'best', 'custom']},
            costTier: {type: 'string', enum: ['low', 'medium', 'high', 'xhigh', 'max']},
            taskType: {type: 'string'},
            promptTokens: {type: 'integer', minimum: 0},
            completionTokens: {type: 'integer', minimum: 0},
            totalTokens: {type: 'integer', minimum: 0},
            costUsd: {type: 'number', minimum: 0},
            latencyMs: {type: 'number', minimum: 0},
            cacheHit: {type: 'boolean'},
            cacheAgeMs: {type: 'number', minimum: 0},
            fallbackUsed: {type: 'boolean'},
          },
          required: ['requestedModel', 'preset', 'latencyMs', 'cacheHit'],
          additionalProperties: false,
        },
        error: {
          type: 'object',
          properties: {
            code: {type: 'string'},
            message: {type: 'string'},
            action: {type: 'string'},
            requestId: {type: 'string'},
            retryAfterMs: {type: 'number'},
          },
          required: ['code', 'message', 'action'],
          additionalProperties: false,
        },
      },
      oneOf: [
        {required: ['answer', 'receipt']},
        {required: ['error']},
      ],
    };
    const diagnosticSchema = {type: 'object', properties: {}, additionalProperties: true};

    return {tools: [
      {name: 'consult', description: 'Get routed technical advice with a typed receipt', inputSchema, outputSchema},
      {name: 'smart_doctor', description: 'Check local runtime and OpenRouter configuration', inputSchema: {type: 'object', properties: {}}, outputSchema: diagnosticSchema},
      {name: 'smart_status', description: 'Show cache, rate-limit, and circuit-breaker status', inputSchema: {type: 'object', properties: {}}, outputSchema: diagnosticSchema},
    ]};
  }

  async callTool(name: string, args: any, signal?: AbortSignal): Promise<any> {
    this.logger.info('Tool call received', {tool: name});
    if (name === 'smart_doctor') return this.diagnosticResult({
      nodeVersion: process.version,
      apiKeyPresent: Boolean(this.config.openrouterApiKey.trim()),
      maxTokens: this.config.maxTokens,
      requestTimeoutMs: this.config.requestTimeout,
    });
    if (name === 'smart_status') return this.diagnosticResult(this.getHealthCheck());

    const aliases = ['smart_advisor', 'code_review', 'get_advice', 'expert_opinion', 'smart_llm', 'ask_expert', 'review_code'];
    if (name !== 'consult' && !aliases.includes(name)) {
      throw new SmartAdvisorError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
    }
    if (!this.checkRateLimit()) {
      const error = new SmartAdvisorError('Local consultation rate limit exceeded.', 'LOCAL_RATE_LIMITED');
      error.details.action = `Wait ${this.config.rateLimitWindow}ms before retrying.`;
      throw error;
    }

    const raw = args ?? {};
    const task = raw.task;
    const context = raw.context === undefined ? '' : raw.context;
    if (typeof task !== 'string' || task.trim().length === 0 || typeof context !== 'string') {
      throw new SmartAdvisorError('A non-empty task and string context are required.', 'INVALID_INPUT');
    }
    if (!matchesConsultationSchema(raw)) {
      throw new SmartAdvisorError('Consultation options must match the advertised tool schema.', 'INVALID_INPUT');
    }
    const validation = this.validateInput(task, context);
    if (!validation.isValid) throw new SmartAdvisorError(validation.error!, 'INVALID_INPUT');

    const intent = name === 'consult' ? (raw.intent ?? 'advice') : this.resolveIntent(name);
    if (!['advice', 'code-review', 'expert-opinion'].includes(intent)) {
      throw new SmartAdvisorError('Unknown consultation intent.', 'INVALID_INPUT');
    }
    let model = raw.model;
    if (name !== 'consult' && typeof model === 'string') {
      if (model === 'all') {
        return this.consultAllAdvisors(task, context, name, {
          sessionId: raw.sessionId,
          fresh: raw.fresh,
        }, signal);
      }
      if (model === 'random') {
        const routes = Object.values(LEGACY_MODEL_ROUTES).filter((value, index, values) => value !== 'openrouter/auto' && values.indexOf(value) === index);
        model = routes[Math.floor(Math.random() * routes.length)];
      } else {
        model = LEGACY_MODEL_ROUTES[model] ?? model;
      }
    }
    const input: ConsultInput = {
      task,
      context: raw.context,
      intent,
      preset: raw.preset,
      model,
      costTier: raw.costTier,
      allowedModels: raw.allowedModels,
      excludedModels: raw.excludedModels,
      maxTokens: raw.maxTokens,
      sessionId: raw.sessionId,
      fresh: raw.fresh,
    };
    const promptName = name === 'consult' ? this.promptNameForIntent(intent) : name;
    const cacheKey = buildConsultationCacheKey(input, `v2:${promptName}`);
    const now = Date.now();
    const cached = this.consultationCache.get(cacheKey);
    if (!input.fresh && cached && now - cached.timestamp < this.config.cacheTtl) {
      cached.lastAccessedAt = ++this.cacheAccessSequence;
      const result: ConsultationResult = {
        answer: cached.result.answer,
        receipt: {...cached.result.receipt, cacheHit: true, cacheAgeMs: now - cached.timestamp},
      };
      this.cacheMetrics.hits++;
      this.cacheMetrics.totalRequests++;
      this.cacheMetrics.hitRate = (this.cacheMetrics.hits / this.cacheMetrics.totalRequests) * 100;
      return this.consultationResult(result);
    }

    this.cacheMetrics.misses++;
    this.cacheMetrics.totalRequests++;
    this.cacheMetrics.hitRate = (this.cacheMetrics.hits / this.cacheMetrics.totalRequests) * 100;
    const client = new OpenRouterClient({
      apiKey: this.config.openrouterApiKey,
      maxTokens: this.config.maxTokens,
      timeoutMs: this.config.requestTimeout,
      maxAttempts: this.config.maxRetries,
      buildSystemPrompt: () => buildToolSpecificPrompt(promptName),
      ...(signal ? {signal} : {}),
    });
    const breaker = this.circuitBreakers.get('openrouter');
    const result = breaker
      ? await breaker.execute(() => client.consult(input), isTransientProviderFailure)
      : await client.consult(input);
    const cachedAt = Date.now();
    this.consultationCache.set(cacheKey, {result, timestamp: cachedAt, lastAccessedAt: ++this.cacheAccessSequence});
    this.enforceCacheCapacity();
    return this.consultationResult(result);
  }

  private resolveIntent(name: string): ConsultationIntent {
    if (name === 'code_review' || name === 'review_code') return 'code-review';
    if (name === 'expert_opinion' || name === 'ask_expert') return 'expert-opinion';
    return 'advice';
  }

  private promptNameForIntent(intent: ConsultationIntent): string {
    if (intent === 'code-review') return 'code_review';
    if (intent === 'expert-opinion') return 'expert_opinion';
    return 'smart_advisor';
  }

  private consultationResult(result: ConsultationResult): any {
    return {content: [{type: 'text', text: result.answer}], structuredContent: result};
  }

  private diagnosticResult(data: Record<string, unknown>): any {
    return {content: [{type: 'text', text: JSON.stringify(data, null, 2)}], structuredContent: data};
  }

  private errorResult(details: SmartErrorDetails): any {
    return {
      content: [{
        type: 'text',
        text: `${details.message} Action: ${details.action} (${details.code})`,
      }],
      structuredContent: {error: details},
      isError: true,
    };
  }

  private async consultAllAdvisors(
    task: string,
    context: string,
    toolName: string = 'smart_advisor',
    requestOptions: Pick<ConsultInput, 'sessionId' | 'fresh'> = {},
    signal?: AbortSignal,
  ) {
    const cacheKey = JSON.stringify(['legacy-all-v2', toolName, requestOptions.sessionId ?? null, task, context]);
    const cached = requestOptions.fresh ? null : this.getCachedResponse(cacheKey);
    if (requestOptions.fresh) {
      this.cacheMetrics.totalRequests++;
      this.cacheMetrics.misses++;
      this.updateCacheHitRate();
    }
    if (cached !== null) {
      return {
        content: [
          {
            type: 'text',
            text: cached,
          },
        ],
      };
    }

    const modelKeys = Object.keys(MODELS).filter(model => model !== 'router') as (keyof typeof MODELS)[];
    const client = new OpenRouterClient({
      apiKey: this.config.openrouterApiKey,
      maxTokens: this.config.maxTokens,
      timeoutMs: this.config.requestTimeout,
      maxAttempts: this.config.maxRetries,
      buildSystemPrompt: () => buildToolSpecificPrompt(toolName),
      ...(signal ? {signal} : {}),
    });
    const circuitBreaker = this.circuitBreakers.get('openrouter');
    
    // Use Promise.allSettled for better error resilience
    const advisorPromises = modelKeys.map(async (modelKey) => {
      const startTime = Date.now();
      try {
        this.logger.debug('Starting advisor query', { model: modelKey, tool: toolName });
        const consult = () => client.consult({task, context, model: MODELS[modelKey], preset: 'custom'});
        const response = (await (circuitBreaker
          ? circuitBreaker.execute(consult, isTransientProviderFailure)
          : consult())).answer;
        const duration = Date.now() - startTime;
        
        this.logger.debug('Advisor query completed', { 
          model: modelKey, 
          duration: `${duration}ms`,
          responseLength: response.length 
        });
        
        return {
          model: modelKey,
          response,
          success: true,
          duration
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        this.logger.warn('Advisor query failed', { 
          model: modelKey, 
          error: errorMessage,
          duration: `${duration}ms`
        });
        
        return {
          model: modelKey,
          error: errorMessage,
          details: error instanceof OpenRouterError ? error.details : undefined,
          success: false,
          duration
        };
      }
    });

    const settledResults = await Promise.allSettled(advisorPromises);
    if (signal?.aborted) {
      throw new SmartAdvisorError('The OpenRouter request was cancelled.', 'REQUEST_CANCELLED');
    }
    
    // Extract results from Promise.allSettled
    const results = settledResults.map((settledResult, index) => {
      if (settledResult.status === 'fulfilled') {
        return settledResult.value;
      } else {
        // This should rarely happen since we catch errors in the map function
        const modelKey = modelKeys[index];
        this.logger.error('Unexpected promise rejection', { 
          model: modelKey, 
          error: settledResult.reason 
        });
        return {
          model: modelKey,
          error: 'Promise rejected unexpectedly',
          details: undefined,
          success: false,
          duration: 0
        };
      }
    });
    if (results.every(result => !result.success)) {
      const details = results.find(result => !result.success && result.details !== undefined)?.details;
      if (details !== undefined) throw new OpenRouterError(details);
      throw new SmartAdvisorError('Every legacy advisor request failed.', 'NO_PROVIDER_AVAILABLE');
    }
    const formattedResponse = this.formatMultiAdvisorResponse(results);
    
    this.setCachedResponse(cacheKey, formattedResponse);
    
    return {
      content: [
        {
          type: 'text',
          text: formattedResponse,
        },
      ],
    };
  }

  private getCachedResponse(key: string): string | null {
    this.cacheMetrics.totalRequests++;
    
    const cached = this.requestCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtl) {
      // Cache hit
      this.cacheMetrics.hits++;
      this.updateCacheHitRate();
      
      // Update access count and recency for LRU
      cached.accessCount++;
      cached.lastAccessedAt = ++this.cacheAccessSequence;
      this.requestCache.set(key, cached);
      
      this.logger.debug('Cache hit', { 
        key: key.substring(0, 50) + '...', 
        hitRate: this.cacheMetrics.hitRate.toFixed(2) + '%'
      });
      
      return cached.response;
    }
    
    // Cache miss or expired
    this.cacheMetrics.misses++;
    this.updateCacheHitRate();
    
    if (cached) {
      // Remove expired entry
      this.requestCache.delete(key);
      this.logger.debug('Cache entry expired and removed', { key: key.substring(0, 50) + '...' });
    }
    
    return null;
  }

  private setCachedResponse(key: string, response: string): void {
    const cachedAt = Date.now();
    this.requestCache.set(key, {
      response,
      timestamp: cachedAt,
      lastAccessedAt: ++this.cacheAccessSequence,
      accessCount: 1,
    });
    this.enforceCacheCapacity();
  }

  private enforceCacheCapacity(): void {
    while (this.requestCache.size + this.consultationCache.size > this.config.maxCacheSize) {
      let lruKey: string | undefined;
      let lruCache: 'request' | 'consultation' | undefined;
      let lruTimestamp = Infinity;
      for (const [key, entry] of this.requestCache.entries()) {
        if (entry.lastAccessedAt < lruTimestamp) {
          lruKey = key;
          lruCache = 'request';
          lruTimestamp = entry.lastAccessedAt;
        }
      }
      for (const [key, entry] of this.consultationCache.entries()) {
        if (entry.lastAccessedAt < lruTimestamp) {
          lruKey = key;
          lruCache = 'consultation';
          lruTimestamp = entry.lastAccessedAt;
        }
      }
      if (lruKey === undefined || lruCache === undefined) return;
      if (lruCache === 'request') this.requestCache.delete(lruKey);
      else this.consultationCache.delete(lruKey);
      this.cacheMetrics.evictions++;
    }
  }

  private updateCacheHitRate(): void {
    if (this.cacheMetrics.totalRequests > 0) {
      this.cacheMetrics.hitRate = (this.cacheMetrics.hits / this.cacheMetrics.totalRequests) * 100;
    }
  }

  public getCacheMetrics(): CacheMetrics {
    return { ...this.cacheMetrics };
  }

  private async routeToOptimalProvider(task: string, context: string, strategy: string): Promise<keyof typeof MODELS | 'all'> {
    // Handle non-auto strategies
    if (strategy === 'intelligence') return 'claude';  // Ultimate intelligence
    if (strategy === 'premium') return 'openai';       // Premium alternative
    if (strategy === 'cost') return 'deepseek';        // Most cost-effective
    if (strategy === 'balance') return 'google';       // Balanced cost/performance
    if (strategy === 'speed') return 'xai';            // Fastest responses
    if (strategy === 'all') return 'all';
    
    // Handle random strategy
    if (strategy === 'random') {
      const availableProviders = ['claude', 'openai', 'xai', 'google', 'deepseek', 'moonshot'];
      const randomIndex = Math.floor(Math.random() * availableProviders.length);
      const selectedProvider = availableProviders[randomIndex];
      this.logger.debug('Random provider selection', { 
        selectedProvider,
        availableProviders: availableProviders.length,
        strategy: 'random'
      });
      return selectedProvider as keyof typeof MODELS;
    }
    
    // Handle direct provider names
    if (strategy === 'deepseek' || strategy === 'google' || strategy === 'openai' || strategy === 'xai' || strategy === 'claude' || strategy === 'moonshot') {
      return strategy as keyof typeof MODELS;
    }

    // For 'auto' strategy, use GPT-4o-mini to make routing decision
    if (strategy === 'auto') {
      try {
        const routingPrompt = `You are a smart routing system that selects the best AI provider for a given coding task.

Available providers (ranked by intelligence):
1. Claude Sonnet 4.5: Ultimate intelligence, supreme reasoning, ethical coding, comprehensive solutions
2. OpenAI GPT-5 Pro: Very high intelligence, complex reasoning, creativity, advanced coding
3. xAI Grok 4: Very high intelligence, fast responses, real-time data, creative thinking
4. Google Gemini 3 Pro: Very high intelligence, fast, large context (2M tokens), multimodal
5. DeepSeek v3.2: High intelligence, very cost-effective, fast, excellent for coding/logic/math

Task: "${task}"
Context: "${context || 'None'}"

Respond with ONLY the provider name: "claude", "openai", "xai", "google", or "deepseek"

Consider:
- Task complexity (simple = deepseek, moderate = google/xai, complex = openai, ultimate = claude)
- Cost efficiency (prefer cheaper options when quality difference is minimal)
- Provider strengths vs task requirements
- Context length needs (long context = google)`;

        const routingDecision = await this.callOpenRouter(MODELS.router, routingPrompt, '', 'auto');
        const cleanDecision = routingDecision.toLowerCase().trim();
        
        // Validate the routing decision
        if (['claude', 'openai', 'xai', 'google', 'deepseek'].includes(cleanDecision)) {
          this.logger.debug('Auto-routing decision', { 
            task: task.substring(0, 50) + '...', 
            selectedProvider: cleanDecision,
            strategy: 'auto'
          });
          return cleanDecision as keyof typeof MODELS;
        } else {
          this.logger.warn('Invalid routing decision, falling back to balance', { 
            decision: routingDecision,
            fallback: 'google'
          });
          return 'google'; // Safe fallback to Gemini Flash
        }
      } catch (error) {
        this.logger.error('Routing decision failed, falling back to balance', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          fallback: 'google'
        });
        return 'google'; // Safe fallback
      }
    }

    // Default fallback
    return 'google';
  }

  public getHealthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    cache: {
      size: number;
      hitRate: number;
      evictions: number;
    };
    rateLimit: {
      activeWindows: number;
    };
    circuitBreakers: Record<string, {
      state: CircuitBreakerState;
      failures: number;
      successRate: number;
    }>;
    version: string;
  } {
    const now = Date.now();
    const cacheSize = this.requestCache.size + this.consultationCache.size;
    const hitRate = this.cacheMetrics.hitRate;
    
    // Collect circuit breaker status
    const circuitBreakerStatus: Record<string, { state: CircuitBreakerState; failures: number; successRate: number }> = {};
    for (const [provider, cb] of this.circuitBreakers.entries()) {
      const metrics = cb.getMetrics();
      const completedRequests = metrics.successes + metrics.failures;
      const successRate = completedRequests > 0
        ? (metrics.successes / completedRequests) * 100
        : 100;
      
      circuitBreakerStatus[provider] = {
        state: metrics.state,
        failures: metrics.failures,
        successRate: Number(successRate.toFixed(2))
      };
      
    }
    
    // Determine health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    const openRouterState = this.circuitBreakers.get('openrouter')?.getState();
    if (openRouterState === CircuitBreakerState.OPEN) {
      status = 'unhealthy';
    } else if (openRouterState === CircuitBreakerState.HALF_OPEN) {
      status = 'degraded';
    }
    
    // Mark as degraded if cache hit rate is very low (might indicate issues)
    if (status === 'healthy' && this.cacheMetrics.totalRequests > 10 && hitRate < 10) {
      status = 'degraded';
    }
    
    // Mark as degraded if cache is at maximum capacity
    if (status === 'healthy' && cacheSize >= this.config.maxCacheSize) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: now - this.startTime,
      cache: {
        size: cacheSize,
        hitRate: Number(hitRate.toFixed(2)),
        evictions: this.cacheMetrics.evictions
      },
      rateLimit: {
        activeWindows: this.rateLimitTracker.size
      },
      circuitBreakers: circuitBreakerStatus,
      version: '2.0.0'
    };
  }

  public getCircuitBreakerMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const [provider, cb] of this.circuitBreakers.entries()) {
      metrics[provider] = cb.getMetrics();
    }
    return metrics;
  }

  public resetCircuitBreaker(provider: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(provider);
    if (circuitBreaker) {
      circuitBreaker.reset();
      this.logger.info('Circuit breaker manually reset', { provider });
      return true;
    }
    return false;
  }

  public resetAllCircuitBreakers(): void {
    for (const [provider, cb] of this.circuitBreakers.entries()) {
      cb.reset();
    }
    this.logger.info('All circuit breakers manually reset');
  }

  private async callOpenRouterWithRetry(model: string, task: string, context: string, toolName: string = 'smart_advisor'): Promise<string> {
    // Extract provider name from model string
    const provider = this.getProviderFromModel(model);
    const circuitBreaker = this.circuitBreakers.get(provider);
    
    if (!circuitBreaker) {
      this.logger.warn('No circuit breaker found for provider, proceeding without circuit breaker', { provider, model });
      return this.callOpenRouterWithRetryFallback(model, task, context, toolName);
    }

    try {
      return await circuitBreaker.execute(() => 
        this.callOpenRouterWithRetryFallback(model, task, context, toolName)
      );
    } catch (error) {
      if (error instanceof SmartAdvisorError && error.code.startsWith('CIRCUIT_BREAKER')) {
        this.logger.warn('Circuit breaker rejected request', { 
          provider, 
          model, 
          state: circuitBreaker.getState(),
          error: error.message 
        });
        // Attempt fallback to alternative provider if available
        return this.attemptFallbackProvider(task, context, toolName, provider);
      }
      throw error;
    }
  }

  private getProviderFromModel(model: string): string {
    // Map model strings to provider keys
    for (const [provider, modelString] of Object.entries(MODELS)) {
      if (modelString === model) {
        return provider;
      }
    }
    // Fallback: try to extract provider from model string
    if (model.includes('claude')) return 'claude';
    if (model.includes('openai') || model.includes('gpt') || model.includes('o3')) return 'openai';
    if (model.includes('google') || model.includes('gemini')) return 'google';
    if (model.includes('x-ai') || model.includes('grok')) return 'xai';
    if (model.includes('deepseek')) return 'deepseek';
    
    return 'unknown';
  }

  private async attemptFallbackProvider(task: string, context: string, toolName: string, failedProvider: string): Promise<string> {
    // Define fallback hierarchy based on provider capabilities
    const fallbackOrder = ['google', 'claude', 'xai', 'moonshot', 'deepseek', 'openai'];
    const availableProviders = fallbackOrder.filter(p => {
      const cb = this.circuitBreakers.get(p);
      return p !== failedProvider && cb && cb.getState() !== CircuitBreakerState.OPEN;
    });

    if (availableProviders.length === 0) {
      throw new SmartAdvisorError(
        `All providers unavailable. Primary provider '${failedProvider}' circuit breaker is open and no fallback providers available.`,
        'ALL_PROVIDERS_UNAVAILABLE'
      );
    }

    const fallbackProvider = availableProviders[0];
    this.logger.info('Attempting fallback provider', { 
      failedProvider, 
      fallbackProvider,
      availableProviders 
    });

    const fallbackModel = MODELS[fallbackProvider as keyof typeof MODELS];
    return this.callOpenRouterWithRetryFallback(fallbackModel, task, context, toolName);
  }

  private async callOpenRouterWithRetryFallback(model: string, task: string, context: string, toolName: string = 'smart_advisor'): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await this.callOpenRouter(model, task, context, toolName);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (error instanceof AxiosError) {
          // Don't retry on client errors (4xx)
          if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
            throw new SmartAdvisorError(
              `OpenRouter client error: ${error.response.status} ${error.response.statusText}`,
              'CLIENT_ERROR',
              error
            );
          }
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }
    
    throw new SmartAdvisorError(
      `Failed after ${this.config.maxRetries} attempts: ${lastError?.message}`,
      'MAX_RETRIES_EXCEEDED',
      lastError || undefined
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async callOpenRouter(model: string, task: string, context: string, toolName: string = 'smart_advisor'): Promise<string> {
    const userMessage = context 
      ? `Task: ${task}\n\nAdditional Context: ${context}`
      : `Task: ${task}`;

    const systemPrompt = buildToolSpecificPrompt(toolName);

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: this.config.maxTokens,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/user/mcp-smart-advisor',
          'X-Title': 'MCP Smart Advisor',
        },
        timeout: this.config.requestTimeout,
      }
    );

    return response.data.choices[0]?.message?.content || 'No response received';
  }

  private formatMultiAdvisorResponse(results: Array<{
    model: keyof typeof MODELS;
    response?: string;
    error?: string;
    success: boolean;
  }>): string {
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);

    let formatted = `# 🎯 Multi-Advisor Consultation Results

**What you're seeing:** ${successfulResults.length} AI advisor${successfulResults.length === 1 ? ' has' : 's have'} independently analyzed your request. Consider their perspectives to find the most practical and efficient solution.

`;

    if (failedResults.length > 0) {
      formatted += `⚠️  **Note:** ${failedResults.length} advisor(s) encountered errors: ${failedResults.map(r => MODEL_NAMES[r.model]).join(', ')}\n\n`;
    }

    successfulResults.forEach((result, index) => {
      const advisorName = MODEL_NAMES[result.model];
      const divider = '═'.repeat(80);
      
      formatted += `${divider}
## 🤖 **${advisorName} Advisor** (${result.model})
${divider}

${result.response}

`;
    });

    if (successfulResults.length > 1) {
      formatted += `${('═'.repeat(80))}
## 🎯 **Synthesis & Next Steps**
${('═'.repeat(80))}

**You now have ${successfulResults.length} expert perspectives.** Here's how to proceed:

1. **Compare Approaches:** Look for common themes and fundamental differences between the advisors
2. **Identify Best Practices:** Note which advisor provides the most actionable, maintainable solution
3. **Consider Trade-offs:** Each advisor may emphasize different aspects (performance, simplicity, scalability)
4. **Choose Your Path:** Select the approach that best fits your project's constraints and goals
5. **Implement Iteratively:** Start with the core solution and incorporate refinements from other advisors

**Remember:** The best solution often combines insights from multiple perspectives. Consider what each advisor got right and adapt accordingly.
`;
    }

    return formatted;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('Smart Advisor MCP server running on stdio');
  }
}
