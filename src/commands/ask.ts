import type {ConsultInput, ConsultationResult, SmartErrorDetails} from '../contracts.js';
import {OpenRouterClient} from '../openrouter.js';
import {buildToolSpecificPrompt} from '../SmartAdvisorServer.js';

export class CommandError extends Error {
  constructor(public readonly details: SmartErrorDetails) {
    super(details.message);
    this.name = 'CommandError';
  }
}

export interface ConsultationClient {
  consult(input: ConsultInput): Promise<ConsultationResult>;
}

export interface AskOptions extends Omit<ConsultInput, 'task'> {
  env?: NodeJS.ProcessEnv;
  client?: ConsultationClient;
  signal?: AbortSignal;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function runAsk(task: string, options: AskOptions = {}): Promise<ConsultationResult> {
  if (task.trim().length === 0) {
    throw new CommandError({
      code: 'TASK_REQUIRED',
      message: 'A consultation task is required.',
      action: 'Provide a task and try again.',
    });
  }

  const environment = options.env ?? process.env;
  const maxTaskLength = positiveInteger(environment.MAX_TASK_LENGTH, 10_000);
  const maxContextLength = positiveInteger(environment.MAX_CONTEXT_LENGTH, 20_000);
  if (task.length > maxTaskLength || (options.context?.length ?? 0) > maxContextLength) {
    throw new CommandError({
      code: 'INVALID_INPUT',
      message: task.length > maxTaskLength
        ? `Task exceeds maximum length of ${maxTaskLength} characters.`
        : `Context exceeds maximum length of ${maxContextLength} characters.`,
      action: 'Shorten the consultation input and try again.',
    });
  }

  const {client: injectedClient, env, signal, ...input} = options;
  const promptName = input.intent === 'code-review'
    ? 'code_review'
    : input.intent === 'expert-opinion' ? 'expert_opinion' : 'smart_advisor';
  const client = injectedClient ?? new OpenRouterClient({
    apiKey: environment.OPENROUTER_API_KEY,
    maxTokens: positiveInteger(environment.MAX_TOKENS, 4000),
    timeoutMs: positiveInteger(environment.REQUEST_TIMEOUT, 30_000),
    maxAttempts: positiveInteger(environment.MAX_RETRIES, 3),
    buildSystemPrompt: () => buildToolSpecificPrompt(promptName),
    signal,
  });
  return client.consult({...input, task});
}
