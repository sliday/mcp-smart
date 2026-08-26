import type {ConsultInput, ConsultationResult, SmartErrorDetails} from '../contracts.js';
import {OpenRouterClient} from '../openrouter.js';

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
}

export async function runAsk(task: string, options: AskOptions = {}): Promise<ConsultationResult> {
  if (task.trim().length === 0) {
    throw new CommandError({
      code: 'TASK_REQUIRED',
      message: 'A consultation task is required.',
      action: 'Provide a task and try again.',
    });
  }

  const {client: injectedClient, env, ...input} = options;
  const client = injectedClient ?? new OpenRouterClient({
    apiKey: (env ?? process.env).OPENROUTER_API_KEY,
  });
  return client.consult({...input, task});
}
