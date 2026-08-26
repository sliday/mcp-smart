export type ConsultationIntent = 'advice' | 'code-review' | 'expert-opinion';
export type ConsultationPreset = 'fast' | 'balanced' | 'best' | 'custom';
export type CostTier = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ConsultInput {
  task: string;
  context?: string;
  intent?: ConsultationIntent;
  preset?: ConsultationPreset;
  model?: string;
  costTier?: CostTier;
  allowedModels?: string[];
  excludedModels?: string[];
  maxTokens?: number;
  sessionId?: string;
  fresh?: boolean;
}

export interface ConsultationReceipt {
  requestId?: string;
  requestedModel: string;
  selectedModel?: string;
  provider?: string;
  preset: ConsultationPreset;
  costTier?: CostTier;
  taskType?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  latencyMs: number;
  cacheHit: boolean;
  cacheAgeMs?: number;
  fallbackUsed?: boolean;
}

export interface ConsultationResult {
  answer: string;
  receipt: ConsultationReceipt;
}

export interface SmartErrorDetails {
  code: string;
  message: string;
  action: string;
  requestId?: string;
  retryAfterMs?: number;
}

export interface ResolvedRoute {
  model: string;
  preset: ConsultationPreset;
  costTier?: CostTier;
  pluginId?: 'auto-router';
  allowedModels?: string[];
  excludedModels?: string[];
}

const PRESET_COST_TIERS: Partial<Record<ConsultationPreset, CostTier>> = {
  fast: 'low',
  balanced: 'medium',
  best: 'max',
};

export function resolveRoute(input: ConsultInput): ResolvedRoute {
  const requestedModel = input.model ?? 'openrouter/auto';
  const model = requestedModel === 'smart-auto' ? 'openai/gpt-5-mini' : requestedModel;
  const isAuto = model === 'openrouter/auto';
  const preset = isAuto ? (input.preset ?? 'balanced') : 'custom';
  const costTier = isAuto ? (input.costTier ?? PRESET_COST_TIERS[preset]) : undefined;
  const route: ResolvedRoute = {model, preset};

  if (costTier !== undefined) route.costTier = costTier;
  if (isAuto) {
    route.pluginId = 'auto-router';
    if (input.allowedModels !== undefined) route.allowedModels = [...input.allowedModels];
    if (input.excludedModels !== undefined) route.excludedModels = [...input.excludedModels];
  }

  return route;
}

function normalizedModels(models: string[] | undefined): string[] | null {
  return models === undefined ? null : [...models].sort();
}

export function buildConsultationCacheKey(
  input: ConsultInput,
  promptVersion: string,
): string {
  const route = resolveRoute(input);
  return JSON.stringify([
    promptVersion,
    input.intent ?? 'advice',
    route.model,
    route.preset,
    route.costTier ?? null,
    normalizedModels(input.allowedModels),
    normalizedModels(input.excludedModels),
    input.maxTokens ?? null,
    input.sessionId ?? null,
    input.task,
    input.context ?? null,
  ]);
}
