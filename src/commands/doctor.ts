import {resolveRoute} from '../contracts.js';

export type DoctorCheckStatus = 'ok' | 'missing' | 'warning' | 'failed' | 'skipped';

export interface DoctorCheck {
  status: DoctorCheckStatus;
  action?: string;
  value?: string;
}

export interface DoctorResult {
  checks: {
    node: DoctorCheck;
    terminal: DoctorCheck;
    apiKey: DoctorCheck;
    openRouter: DoctorCheck;
    defaultRoute: DoctorCheck;
  };
}

export interface DoctorOptions {
  env?: NodeJS.ProcessEnv;
  nodeVersion?: string;
  isTerminal?: boolean;
  probe?: boolean;
  probeOpenRouter?: (apiKey: string) => Promise<void>;
}

function nodeCheck(version: string): DoctorCheck {
  const major = Number(version.split('.')[0]);
  return Number.isInteger(major) && major >= 22
    ? {status: 'ok', value: version}
    : {status: 'failed', value: version, action: 'Install Node.js 22 or newer.'};
}

async function defaultProbe(apiKey: string): Promise<void> {
  const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
    headers: {Authorization: `Bearer ${apiKey}`},
  });
  if (!response.ok) throw new Error('OpenRouter access check failed.');
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorResult> {
  const env = options.env ?? process.env;
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  const route = resolveRoute({task: ''});
  const checks: DoctorResult['checks'] = {
    node: nodeCheck(options.nodeVersion ?? process.versions.node),
    terminal: options.isTerminal ?? process.stdout.isTTY
      ? {status: 'ok'}
      : {status: 'warning', action: 'Run mcp-smart from an interactive terminal for the TUI.'},
    apiKey: apiKey
      ? {status: 'ok'}
      : {status: 'missing', action: 'Set OPENROUTER_API_KEY and run doctor again.'},
    openRouter: {status: 'skipped'},
    defaultRoute: route.model === 'openrouter/auto' && route.pluginId === 'auto-router'
      ? {status: 'ok', value: route.model}
      : {status: 'failed', action: 'Restore the OpenRouter Auto default route.'},
  };

  if (!apiKey) {
    checks.openRouter = {
      status: 'skipped',
      action: 'Set OPENROUTER_API_KEY before checking OpenRouter access.',
    };
  } else if (options.probe === false) {
    checks.openRouter = {status: 'skipped', action: 'Enable the OpenRouter access check to probe connectivity.'};
  } else {
    try {
      await (options.probeOpenRouter ?? defaultProbe)(apiKey);
      checks.openRouter = {status: 'ok'};
    } catch {
      checks.openRouter = {
        status: 'failed',
        action: 'Check OPENROUTER_API_KEY and network access, then run doctor again.',
      };
    }
  }

  return {checks};
}
