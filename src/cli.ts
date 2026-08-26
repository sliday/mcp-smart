import { readFileSync } from 'node:fs';
import { SmartAdvisorServer } from './SmartAdvisorServer.js';
import { runAsk } from './commands/ask.js';
import { runDoctor } from './commands/doctor.js';
import { runInit } from './commands/init.js';
import type { SmartErrorDetails } from './contracts.js';

export type CliCommand =
  | { name: 'mcp' }
  | { name: 'help' }
  | { name: 'version' }
  | { name: 'tui' }
  | { name: 'init'; json: boolean }
  | { name: 'doctor'; json: boolean }
  | { name: 'ask'; task: string; json: boolean };

const HELP = `Usage: mcp-smart [command]

Commands:
  mcp-smart              Start the stdio MCP server
  mcp-smart tui          Open the interactive terminal interface
  mcp-smart init         Print setup and MCP client configuration
  mcp-smart doctor       Check the local environment and OpenRouter access
  mcp-smart ask [task]   Run one consultation
  mcp-smart --help       Show this help
  mcp-smart --version    Show the package version

Options:
  --json                 Emit JSON for init, doctor, or ask
`;

export function parseCommand(argv: string[]): CliCommand {
  if (argv.length === 0) return { name: 'mcp' };
  if (argv.includes('--help') || argv[0] === 'help') return { name: 'help' };
  if (argv.includes('--version')) return { name: 'version' };

  const json = argv.includes('--json');
  if (argv[0] === 'tui') return { name: 'tui' };
  if (argv[0] === 'init') return { name: 'init', json };
  if (argv[0] === 'doctor') return { name: 'doctor', json };
  if (argv[0] === 'ask') {
    const task = argv.filter(value => value !== '--json').slice(1).join(' ');
    return { name: 'ask', task, json };
  }

  throw new Error(`Unknown command: ${argv[0]}`);
}

function packageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ) as { version: string };
  return packageJson.version;
}

export interface CliDependencies {
  runInit: typeof runInit;
  runDoctor: typeof runDoctor;
  runAsk: typeof runAsk;
}

const defaultDependencies: CliDependencies = { runInit, runDoctor, runAsk };

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function errorDetails(error: unknown): SmartErrorDetails {
  if (typeof error === 'object' && error !== null && 'details' in error) {
    const details = error.details;
    if (
      typeof details === 'object' && details !== null &&
      'code' in details && typeof details.code === 'string' &&
      'message' in details && typeof details.message === 'string' &&
      'action' in details && typeof details.action === 'string'
    ) {
      return details as SmartErrorDetails;
    }
  }

  return {
    code: 'COMMAND_FAILED',
    message: error instanceof Error ? error.message : String(error),
    action: 'Run with DEBUG=1 for diagnostics.',
  };
}

function writeError(error: unknown, json: boolean, debug: boolean): void {
  const details = errorDetails(error);
  if (json) {
    const output: {error: SmartErrorDetails; debug?: {stack: string}} = {error: details};
    if (debug && error instanceof Error && error.stack) output.debug = {stack: error.stack};
    process.stderr.write(`${JSON.stringify(output)}\n`);
    return;
  }

  process.stderr.write(`${details.message}\nAction: ${details.action}\n`);
  if (debug && error instanceof Error && error.stack) process.stderr.write(`${error.stack}\n`);
}

function formatReceipt(receipt: object): string {
  return Object.entries(receipt)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' · ');
}

async function runCliCommand(
  argv: string[],
  env: NodeJS.ProcessEnv,
  injectedDependencies: Partial<CliDependencies> = {}
): Promise<number> {
  const command = parseCommand(argv);
  const dependencies = { ...defaultDependencies, ...injectedDependencies };

  if (command.name === 'help') {
    process.stdout.write(HELP);
    return 0;
  }

  if (command.name === 'version') {
    process.stdout.write(`${packageVersion()}\n`);
    return 0;
  }

  if (command.name === 'mcp') {
    const server = new SmartAdvisorServer();
    await server.run();
    return 0;
  }

  if (command.name === 'tui') {
    const tuiModulePath = './tui/index.js';
    const { runTui } = await import(tuiModulePath) as { runTui: () => Promise<void> };
    await runTui();
    return 0;
  }

  if (command.name === 'init') {
    const result = await dependencies.runInit({});
    if (command.json) {
      writeJson(result);
    } else {
      process.stdout.write(
        `Environment:\n  ${result.environment.exportCommand}\n\n` +
        `MCP client:\n  ${JSON.stringify(result.client)}\n\n` +
        `Next: ${result.nextCommand}\n`
      );
    }
    return 0;
  }

  if (command.name === 'doctor') {
    const result = await dependencies.runDoctor({ env });
    if (command.json) {
      writeJson(result);
    } else {
      const checks = Object.entries(result.checks).map(([name, check]) => {
        const detail = check.value ?? check.action;
        return `${name}: ${check.status}${detail ? ` - ${detail}` : ''}`;
      });
      process.stdout.write(`${checks.join('\n')}\n`);
    }
    return 0;
  }

  const result = await dependencies.runAsk(command.task, { env });
  if (command.json) {
    writeJson(result);
  } else {
    process.stdout.write(`${result.answer}\n\nReceipt: ${formatReceipt(result.receipt)}\n`);
  }
  return 0;
}

export async function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv,
  injectedDependencies: Partial<CliDependencies> = {}
): Promise<number> {
  try {
    return await runCliCommand(argv, env, injectedDependencies);
  } catch (error) {
    writeError(error, argv.includes('--json'), env.DEBUG === '1');
    return 1;
  }
}
