import { readFileSync } from 'node:fs';
import { SmartAdvisorServer } from './SmartAdvisorServer.js';

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

export async function runCli(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const command = parseCommand(argv);

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

  void env;
  throw new Error(`${command.name} is not available in this build`);
}
