import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosError } from 'axios';

enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
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
  'deepseek': 'deepseek/deepseek-chat-v3-0324',
  'google': 'google/gemini-2.5-pro',
  'openai': 'openai/o3',
  'router': 'openai/gpt-4o-mini' // For routing decisions
} as const;

const MODEL_NAMES = {
  'deepseek': 'DeepSeek AI',
  'google': 'Google Gemini',
  'openai': 'OpenAI GPT',
  'router': 'GPT-4.1-Mini Router'
} as const;

// Provider capabilities and cost tiers
const PROVIDER_SPECS = {
  'deepseek': {
    cost: 'low',           // Very cheap
    intelligence: 'high',   // Good reasoning
    context: 'medium',     // Standard context window
    speed: 'fast',         // Fast responses
    strengths: ['coding', 'logic', 'math', 'analysis']
  },
  'google': {
    cost: 'medium',        // Mid-tier pricing
    intelligence: 'high',   // Excellent reasoning
    context: 'high',       // Large context window (2M tokens)
    speed: 'medium',       // Moderate speed
    strengths: ['reasoning', 'research', 'long-context', 'multimodal']
  },
  'openai': {
    cost: 'high',          // Most expensive
    intelligence: 'highest', // Best reasoning
    context: 'medium',     // Standard context
    speed: 'slow',         // Slower but highest quality
    strengths: ['complex-reasoning', 'creativity', 'advanced-coding', 'problem-solving']
  }
} as const;

// Model routing strategies
const ROUTING_STRATEGIES = {
  'auto': 'Let GPT-4o-mini choose the best provider for this specific task',
  'intelligence': 'Prioritize the most capable model (OpenAI o3)',
  'cost': 'Prioritize the most cost-effective model (DeepSeek)',
  'balance': 'Balance cost and performance (Google Gemini)',
  'all': 'Consult all providers',
  // Original providers still work
  'deepseek': 'Force DeepSeek',
  'google': 'Force Google Gemini', 
  'openai': 'Force OpenAI o3'
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

function buildToolSpecificPrompt(toolName: string): string {
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
}

interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  hitRate: number;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

class SmartAdvisorError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'SmartAdvisorError';
  }
}

export class SmartAdvisorServer {
  private server: Server;
  private config: Config;
  private requestCache = new Map<string, { response: string; timestamp: number; accessCount: number }>();
  private cacheMetrics: CacheMetrics = { hits: 0, misses: 0, evictions: 0, totalRequests: 0, hitRate: 0 };
  private logger = new Logger('SmartAdvisorServer');
  private rateLimitTracker = new Map<string, { count: number; windowStart: number }>();
  private startTime = Date.now();

  constructor() {
    this.config = this.loadConfig();
    this.logger.info('SmartAdvisorServer initializing', { 
      maxCacheSize: this.config.maxCacheSize,
      cacheTtl: this.config.cacheTtl 
    });
    
    this.server = new Server(
      {
        name: 'smart-advisor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.logger.info('SmartAdvisorServer initialized successfully');
  }

  private loadConfig(): Config {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new SmartAdvisorError(
        'OPENROUTER_API_KEY environment variable is required',
        'MISSING_API_KEY'
      );
    }

    return {
      openrouterApiKey: apiKey,
      maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
      requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
      cacheTtl: parseInt(process.env.CACHE_TTL || '300000', 10), // 5 minutes
      maxTokens: parseInt(process.env.MAX_TOKENS || '4000', 10),
      maxCacheSize: parseInt(process.env.MAX_CACHE_SIZE || '100', 10),
      maxTaskLength: parseInt(process.env.MAX_TASK_LENGTH || '10000', 10),
      maxContextLength: parseInt(process.env.MAX_CONTEXT_LENGTH || '20000', 10),
      rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '10', 10),
      rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10), // 1 minute
    };
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

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.callTool(request.params.name, request.params.arguments);
    });
  }

  async listTools() {
    const inputSchema = {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          enum: [...Object.keys(ROUTING_STRATEGIES)],
          description: 'Routing strategy: auto (smart routing), intelligence (o3), cost (deepseek), balance (gemini), all (multi-provider), or specific provider',
        },
        task: {
          type: 'string',
          description: 'The coding task or problem you need advice on',
        },
        context: {
          type: 'string',
          description: 'Additional context about your project or requirements (optional)',
        },
      },
      required: ['model', 'task'],
    };

    return {
      tools: [
        {
          name: 'smart_advisor',
          description: 'Get coding advice from premium LLMs using the Smart Advisor prompt structure',
          inputSchema,
        },
        {
          name: 'code_review',
          description: 'Review your code and provide expert feedback from premium AI models',
          inputSchema,
        },
        {
          name: 'get_advice',
          description: 'Get coding advice and recommendations from AI experts',
          inputSchema,
        },
        {
          name: 'expert_opinion',
          description: 'Get third-party expert consultation on your coding challenges',
          inputSchema,
        },
        {
          name: 'smart_llm',
          description: 'Use advanced AI models for intelligent code analysis and suggestions',
          inputSchema,
        },
        {
          name: 'ask_expert',
          description: 'Ask coding experts for their professional opinion and guidance',
          inputSchema,
        },
        {
          name: 'review_code',
          description: 'Get comprehensive code review with detailed feedback and improvements',
          inputSchema,
        },
      ],
    };
  }

  async callTool(name: string, args: any) {
    this.logger.info('Tool call received', { tool: name, model: args?.model });
    
    // Rate limiting check
    if (!this.checkRateLimit()) {
      throw new SmartAdvisorError(
        `Rate limit exceeded. Maximum ${this.config.rateLimitRequests} requests per ${this.config.rateLimitWindow / 1000} seconds`,
        'RATE_LIMIT_EXCEEDED'
      );
    }
    
    const validTools = ['smart_advisor', 'code_review', 'get_advice', 'expert_opinion', 'smart_llm', 'ask_expert', 'review_code'];
    if (!validTools.includes(name)) {
      this.logger.error('Unknown tool requested', { tool: name });
      throw new SmartAdvisorError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
    }

    const { model, task, context = '' } = args as {
      model: string;
      task: string;
      context?: string;
    };

    // Validate and sanitize inputs
    const validation = this.validateInput(task, context);
    if (!validation.isValid) {
      this.logger.warn('Input validation failed', { error: validation.error });
      throw new SmartAdvisorError(validation.error!, 'INVALID_INPUT');
    }

    const sanitizedTask = this.sanitizeInput(task);
    const sanitizedContext = this.sanitizeInput(context);
    this.logger.debug('Input sanitized', { 
      originalTaskLength: task.length,
      sanitizedTaskLength: sanitizedTask.length,
      originalContextLength: context.length,
      sanitizedContextLength: sanitizedContext.length
    });

    // Validate routing strategy
    if (!Object.keys(ROUTING_STRATEGIES).includes(model)) {
      throw new SmartAdvisorError(`Unknown routing strategy: ${model}. Available: ${Object.keys(ROUTING_STRATEGIES).join(', ')}`, 'UNKNOWN_STRATEGY');
    }

    // Route to optimal provider
    const selectedProvider = await this.routeToOptimalProvider(sanitizedTask, sanitizedContext, model);
    
    if (selectedProvider === 'all') {
      return await this.consultAllAdvisors(sanitizedTask, sanitizedContext, name);
    }

    // Validate final provider selection (exclude 'router' from main providers)
    const mainProviders = Object.keys(MODELS).filter(k => k !== 'router') as (keyof typeof MODELS)[];
    if (!mainProviders.includes(selectedProvider as keyof typeof MODELS)) {
      throw new SmartAdvisorError(`Invalid provider selection: ${selectedProvider}`, 'INVALID_PROVIDER');
    }

    const cacheKey = `${selectedProvider}:${sanitizedTask}:${sanitizedContext}`;
    const cached = this.getCachedResponse(cacheKey);
    if (cached) {
      this.logger.info('Cache hit', { 
        strategy: model, 
        selectedProvider, 
        cacheKey: cacheKey.substring(0, 50) + '...' 
      });
      return {
        content: [
          {
            type: 'text',
            text: cached,
          },
        ],
      };
    }

    this.logger.info('Cache miss, making API call', { 
      strategy: model, 
      selectedProvider,
      reasoning: model === 'auto' ? 'AI-selected optimal provider' : 'Direct strategy selection'
    });

    try {
      const response = await this.callOpenRouterWithRetry(MODELS[selectedProvider as keyof typeof MODELS], sanitizedTask, sanitizedContext, name);
      this.setCachedResponse(cacheKey, response);
      
      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    } catch (error) {
      if (error instanceof SmartAdvisorError) {
        throw error;
      }
      throw new SmartAdvisorError(
        `OpenRouter API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'API_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async consultAllAdvisors(task: string, context: string, toolName: string = 'smart_advisor') {
    const cacheKey = `all:${task}:${context}:${toolName}`;
    const cached = this.getCachedResponse(cacheKey);
    if (cached) {
      return {
        content: [
          {
            type: 'text',
            text: cached,
          },
        ],
      };
    }

    const modelKeys = Object.keys(MODELS) as (keyof typeof MODELS)[];
    
    // Use Promise.allSettled for better error resilience
    const advisorPromises = modelKeys.map(async (modelKey) => {
      const startTime = Date.now();
      try {
        this.logger.debug('Starting advisor query', { model: modelKey, tool: toolName });
        const response = await this.callOpenRouterWithRetry(MODELS[modelKey], task, context, toolName);
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
          success: false,
          duration
        };
      }
    });

    const settledResults = await Promise.allSettled(advisorPromises);
    
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
          success: false,
          duration: 0
        };
      }
    });
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
      
      // Update access count and timestamp for LRU
      cached.accessCount++;
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
    // Implement LRU eviction if cache is full
    if (this.requestCache.size >= this.config.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    this.requestCache.set(key, {
      response,
      timestamp: Date.now(),
      accessCount: 1,
    });
  }

  private evictLeastRecentlyUsed(): void {
    let lruKey: string | null = null;
    let lruTimestamp = Date.now();
    let lruAccessCount = Infinity;

    // Find the least recently used entry
    for (const [key, entry] of this.requestCache.entries()) {
      if (entry.timestamp < lruTimestamp || 
          (entry.timestamp === lruTimestamp && entry.accessCount < lruAccessCount)) {
        lruKey = key;
        lruTimestamp = entry.timestamp;
        lruAccessCount = entry.accessCount;
      }
    }

    if (lruKey) {
      this.cacheMetrics.evictions++;
      this.logger.debug('Evicting LRU cache entry', { 
        key: lruKey.substring(0, 50) + '...',
        accessCount: lruAccessCount,
        age: Date.now() - lruTimestamp,
        totalEvictions: this.cacheMetrics.evictions
      });
      this.requestCache.delete(lruKey);
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
    if (strategy === 'intelligence') return 'openai';
    if (strategy === 'cost') return 'deepseek';
    if (strategy === 'balance') return 'google';
    if (strategy === 'all') return 'all';
    
    // Handle direct provider names
    if (strategy === 'deepseek' || strategy === 'google' || strategy === 'openai') {
      return strategy as keyof typeof MODELS;
    }

    // For 'auto' strategy, use GPT-4o-mini to make routing decision
    if (strategy === 'auto') {
      try {
        const routingPrompt = `You are a smart routing system that selects the best AI provider for a given coding task.

Available providers:
1. DeepSeek: Very cost-effective, fast, excellent for coding/logic/math/analysis
2. Google Gemini: Balanced cost/performance, excellent reasoning, large context (2M tokens), good for research/long-context
3. OpenAI o3: Most expensive but highest intelligence, best for complex reasoning/creativity/advanced coding

Task: "${task}"
Context: "${context || 'None'}"

Respond with ONLY the provider name: "deepseek", "google", or "openai"

Consider:
- Task complexity (simple coding = deepseek, complex reasoning = openai, research/long-context = google)
- Cost efficiency (prefer cheaper options when quality difference is minimal)
- Provider strengths vs task requirements`;

        const routingDecision = await this.callOpenRouter(MODELS.router, routingPrompt, '', 'auto');
        const cleanDecision = routingDecision.toLowerCase().trim();
        
        // Validate the routing decision
        if (['deepseek', 'google', 'openai'].includes(cleanDecision)) {
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
          return 'google'; // Safe fallback
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
    version: string;
  } {
    const now = Date.now();
    const cacheSize = this.requestCache.size;
    const hitRate = this.cacheMetrics.hitRate;
    
    // Determine health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    // Mark as degraded if cache hit rate is very low (might indicate issues)
    if (this.cacheMetrics.totalRequests > 10 && hitRate < 10) {
      status = 'degraded';
    }
    
    // Mark as unhealthy if cache is at maximum capacity
    if (cacheSize >= this.config.maxCacheSize) {
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
      version: '1.2.0'
    };
  }

  private async callOpenRouterWithRetry(model: string, task: string, context: string, toolName: string = 'smart_advisor'): Promise<string> {
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

**What you're seeing:** Three experienced AI advisors have independently analyzed your request. Consider their perspectives to find the most practical and efficient solution.

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