import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCommand, runCli } from '../cli.js';

describe('CLI dispatch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects MCP when no command is supplied', () => {
    expect(parseCommand([])).toEqual({ name: 'mcp' });
  });

  it('prints help without an API key or server construction', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(runCli(['--help'], {})).resolves.toBe(0);

    expect(write).toHaveBeenCalledWith(expect.stringContaining('mcp-smart tui'));
  });

  it('prints the package version without an API key or server construction', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(runCli(['--version'], {})).resolves.toBe(0);

    expect(write).toHaveBeenCalledWith('1.5.7\n');
  });
});
