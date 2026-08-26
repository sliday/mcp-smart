export interface CommandResult {
  environment: {
    variable: 'OPENROUTER_API_KEY';
    exportCommand: string;
  };
  client: {
    command: 'mcp-smart';
    args: [];
  };
  nextCommand: string;
}

export interface InitOptions {}

export async function runInit(_options: InitOptions = {}): Promise<CommandResult> {
  return {
    environment: {
      variable: 'OPENROUTER_API_KEY',
      exportCommand: 'export OPENROUTER_API_KEY="<your-openrouter-api-key>"',
    },
    client: {command: 'mcp-smart', args: []},
    nextCommand: 'mcp-smart doctor',
  };
}
