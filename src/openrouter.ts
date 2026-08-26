import axios from 'axios';
import {
  resolveRoute,
  type ConsultInput,
  type ConsultationReceipt,
  type ConsultationResult,
  type SmartErrorDetails,
} from './contracts.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterResponse {
  id?: string;
  model?: string;
  provider?: string;
  task_type?: string;
  fallback_used?: boolean;
  choices?: Array<{message?: {content?: string}}>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
}

export interface OpenRouterClientOptions {
  apiKey?: string;
  signal?: AbortSignal;
  maxTokens?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  buildSystemPrompt?: (input: ConsultInput) => string;
  delay?: (ms: number) => Promise<void>;
}

export class OpenRouterError extends Error {
  constructor(public readonly details: SmartErrorDetails) {
    super(details.message);
    this.name = 'OpenRouterError';
  }
}

function errorRecord(error: unknown): Record<string, any> {
  return typeof error === 'object' && error !== null ? error as Record<string, any> : {};
}

function responseHeader(error: unknown, name: string): unknown {
  const headers = errorRecord(errorRecord(error).response).headers;
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find(value => value.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : headers[key];
}

function retryAfterMs(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(String(value));
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, date - Date.now());
}

export function normalizeOpenRouterError(error: unknown): SmartErrorDetails {
  if (error instanceof OpenRouterError) return error.details;
  const record = errorRecord(error);
  const response = errorRecord(record.response);
  const status = typeof response.status === 'number' ? response.status : undefined;
  const requestIdValue = responseHeader(error, 'x-request-id');
  const requestId = typeof requestIdValue === 'string' ? requestIdValue : undefined;
  const retry = retryAfterMs(responseHeader(error, 'retry-after'));

  let details: SmartErrorDetails;
  if (record.code === 'ERR_CANCELED') {
    details = {code: 'REQUEST_CANCELLED', message: 'The OpenRouter request was cancelled.', action: 'Retry when ready.'};
  } else if (status === 401) {
    details = {code: 'AUTHENTICATION_FAILED', message: 'OpenRouter authentication failed.', action: 'Check OPENROUTER_API_KEY and try again.'};
  } else if (status === 402) {
    details = {code: 'INSUFFICIENT_CREDITS', message: 'OpenRouter credits are insufficient.', action: 'Add credits or choose a lower-cost route.'};
  } else if (status === 403) {
    details = {code: 'MODEL_RESTRICTED', message: 'The requested model or route is restricted.', action: 'Adjust allowed or excluded models and try again.'};
  } else if (status === 404) {
    details = {code: 'NO_ELIGIBLE_MODEL', message: 'No eligible OpenRouter model was found.', action: 'Change the model or Auto restrictions.'};
  } else if (status === 429) {
    details = {code: 'PROVIDER_RATE_LIMITED', message: 'OpenRouter rate limit exceeded.', action: 'Wait before retrying or reduce request frequency.'};
  } else if (status === 408 || record.code === 'ECONNABORTED' || record.code === 'ETIMEDOUT') {
    details = {code: 'REQUEST_TIMEOUT', message: 'The OpenRouter request timed out.', action: 'Retry the request or choose a faster preset.'};
  } else if (status === 503) {
    details = {code: 'NO_PROVIDER_AVAILABLE', message: 'No OpenRouter provider is currently available.', action: 'Retry later or choose a direct model.'};
  } else {
    details = {code: 'PROVIDER_UNAVAILABLE', message: 'The OpenRouter request failed.', action: 'Check provider availability and retry.'};
  }

  if (requestId !== undefined) details.requestId = requestId;
  if (retry !== undefined) details.retryAfterMs = retry;
  return details;
}

function isTransient(error: unknown): boolean {
  const record = errorRecord(error);
  const status = errorRecord(record.response).status;
  return status === 408 || status === 503 || record.code === 'ECONNABORTED' || record.code === 'ETIMEDOUT';
}

function optionalHeader(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as any).get === 'function') {
    const value = (headers as any).get(name);
    return typeof value === 'string' ? value : undefined;
  }
  const record = headers as Record<string, unknown>;
  const key = Object.keys(record).find(value => value.toLowerCase() === name.toLowerCase());
  const value = key === undefined ? undefined : record[key];
  return typeof value === 'string' ? value : undefined;
}

export class OpenRouterClient {
  private readonly maxAttempts: number;
  private readonly delay: (ms: number) => Promise<void>;

  constructor(private readonly options: OpenRouterClientOptions) {
    this.maxAttempts = Math.max(1, Math.min(3, options.maxAttempts ?? 3));
    this.delay = options.delay ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }

  async consult(input: ConsultInput): Promise<ConsultationResult> {
    if (!this.options.apiKey?.trim()) {
      throw new OpenRouterError({
        code: 'MISSING_API_KEY',
        message: 'OPENROUTER_API_KEY is not configured.',
        action: 'Set OPENROUTER_API_KEY and try again.',
      });
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await this.send(input);
      } catch (error) {
        lastError = error;
        if (!isTransient(error) || attempt === this.maxAttempts) break;
        await this.delay(250 * 2 ** (attempt - 1));
      }
    }
    throw new OpenRouterError(normalizeOpenRouterError(lastError));
  }

  private async send(input: ConsultInput): Promise<ConsultationResult> {
    const route = resolveRoute(input);
    const userMessage = input.context
      ? `Task: ${input.task}\n\nAdditional Context: ${input.context}`
      : `Task: ${input.task}`;
    const body: Record<string, unknown> = {
      model: route.model,
      messages: [
        {role: 'system', content: this.options.buildSystemPrompt?.(input) ?? ''},
        {role: 'user', content: userMessage},
      ],
      usage: {include: true},
      max_tokens: input.maxTokens ?? this.options.maxTokens ?? 4096,
    };

    if (route.pluginId) {
      const plugin: Record<string, unknown> = {id: route.pluginId};
      if (route.costTier !== undefined) plugin.cost_tier = route.costTier;
      if (route.allowedModels !== undefined) plugin.allowed_models = route.allowedModels;
      if (route.excludedModels !== undefined) plugin.excluded_models = route.excludedModels;
      body.plugins = [plugin];
    }
    if (input.sessionId !== undefined) body.session_id = input.sessionId;

    const startedAt = Date.now();
    const response = await axios.post<OpenRouterResponse>(OPENROUTER_URL, body, {
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
        'X-OpenRouter-Metadata': 'enabled',
      },
      timeout: this.options.timeoutMs ?? 30_000,
      signal: this.options.signal,
    });
    const data = response.data;
    const answer = data.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || answer.trim().length === 0) {
      throw new OpenRouterError({
        code: 'INVALID_PROVIDER_RESPONSE',
        message: 'OpenRouter returned an invalid response.',
        action: 'Retry the request or choose another model.',
      });
    }
    const usage = data.usage;
    const receipt: ConsultationReceipt = {
      requestedModel: route.model,
      preset: route.preset,
      latencyMs: Date.now() - startedAt,
      cacheHit: false,
    };
    const requestId = optionalHeader(response.headers, 'x-request-id') ?? data.id;
    if (requestId !== undefined) receipt.requestId = requestId;
    if (data.model !== undefined) receipt.selectedModel = data.model;
    if (data.provider !== undefined) receipt.provider = data.provider;
    if (route.costTier !== undefined) receipt.costTier = route.costTier;
    if (data.task_type !== undefined) receipt.taskType = data.task_type;
    if (usage?.prompt_tokens !== undefined) receipt.promptTokens = usage.prompt_tokens;
    if (usage?.completion_tokens !== undefined) receipt.completionTokens = usage.completion_tokens;
    if (usage?.total_tokens !== undefined) receipt.totalTokens = usage.total_tokens;
    if (usage?.cost !== undefined) receipt.costUsd = usage.cost;
    if (data.fallback_used !== undefined) receipt.fallbackUsed = data.fallback_used;

    return {answer, receipt};
  }
}
