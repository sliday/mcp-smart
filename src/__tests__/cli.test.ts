import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCommand, runCli } from '../cli.js';
import { CommandError } from '../commands/ask.js';

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

    expect(write).toHaveBeenCalledWith('2.0.0\n');
  });

  it('prints init as machine-readable JSON', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const result = {
      environment: {
        variable: 'OPENROUTER_API_KEY' as const,
        exportCommand: 'export OPENROUTER_API_KEY="<your-openrouter-api-key>"',
      },
      client: {command: 'mcp-smart' as const, args: [] as []},
      nextCommand: 'mcp-smart doctor',
    };

    await expect(runCli(['init', '--json'], {}, {
      runInit: vi.fn().mockResolvedValue(result),
    })).resolves.toBe(0);

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual(result);
  });

  it('prints missing-key doctor JSON without a stack', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const result = {
      checks: {
        node: {status: 'ok' as const, value: '22.1.0'},
        terminal: {status: 'warning' as const, action: 'Use an interactive terminal.'},
        apiKey: {status: 'missing' as const, action: 'Set OPENROUTER_API_KEY.'},
        openRouter: {status: 'skipped' as const, action: 'Set OPENROUTER_API_KEY.'},
        defaultRoute: {status: 'ok' as const, value: 'openrouter/auto'},
      },
    };

    await expect(runCli(['doctor', '--json'], {}, {
      runDoctor: vi.fn().mockResolvedValue(result),
    })).resolves.toBe(1);

    const output = String(write.mock.calls[0]?.[0]);
    expect(JSON.parse(output)).toEqual(result);
    expect(output).not.toContain('stack');
  });

  it('returns zero when Doctor has warnings but all required checks pass', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const result = {
      checks: {
        node: {status: 'ok' as const, value: '22.1.0'},
        terminal: {status: 'warning' as const, action: 'Use an interactive terminal.'},
        apiKey: {status: 'ok' as const},
        openRouter: {status: 'ok' as const},
        defaultRoute: {status: 'ok' as const, value: 'openrouter/auto'},
      },
    };

    await expect(runCli(['doctor'], {}, {
      runDoctor: vi.fn().mockResolvedValue(result),
    })).resolves.toBe(0);
  });

  it('prints the answer before a compact receipt and preserves the task', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const runAsk = vi.fn().mockResolvedValue({
      answer: 'Keep the fence.',
      receipt: {
        requestedModel: 'openrouter/auto',
        preset: 'balanced',
        latencyMs: 12,
        cacheHit: false,
      },
    });
    const task = 'Review:\n```ts\n  const value = 1;\n```';

    await expect(runCli(['ask', task], {}, {runAsk})).resolves.toBe(0);

    expect(runAsk).toHaveBeenCalledWith(task, {env: {}});
    const output = String(write.mock.calls[0]?.[0]);
    expect(output.indexOf('Keep the fence.')).toBeLessThan(output.indexOf('Receipt:'));
    expect(output).toContain('openrouter/auto');
  });

  it('strips CSI and OSC sequences from text output while preserving readable layout', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const runAsk = vi.fn().mockResolvedValue({
      answer: 'Heading\n\t\u001b[31mWarning\u001b[0m\n\u001b]0;Owned title\u0007\u001b]8;;https://evil.invalid\u001b\\Read this\u001b]8;;\u001b\\',
      receipt: {
        requestedModel: 'openrouter/auto',
        preset: 'balanced',
        latencyMs: 12,
        cacheHit: false,
      },
    });

    await expect(runCli(['ask', 'Review this'], {}, {runAsk})).resolves.toBe(0);

    expect(String(write.mock.calls[0]?.[0])).toBe(
      'Heading\n\tWarning\nRead this\n\nReceipt: requestedModel=openrouter/auto · preset=balanced · latencyMs=12 · cacheHit=false\n'
    );
  });

  it('prints ask as JSON when requested', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const result = {
      answer: '\u001b[31mUse tests.\u001b[0m\u001b]0;Owned title\u0007',
      receipt: {
        requestedModel: 'openrouter/auto',
        preset: 'balanced' as const,
        latencyMs: 3,
        cacheHit: false,
      },
    };

    await expect(runCli(['ask', 'Review this', '--json'], {}, {
      runAsk: vi.fn().mockResolvedValue(result),
    })).resolves.toBe(0);

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual(result);
  });

  it('prints a stable error and action without a stack', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const error = new CommandError({
      code: 'TASK_REQUIRED',
      message: 'A consultation task is required.',
      action: 'Provide a task and try again.',
    });

    await expect(runCli(['ask', ''], {}, {
      runAsk: vi.fn().mockRejectedValue(error),
    })).resolves.toBe(1);

    const output = String(write.mock.calls[0]?.[0]);
    expect(output).toBe('A consultation task is required.\nAction: Provide a task and try again.\n');
    expect(output).not.toContain('CommandError');
  });

  it('strips terminal controls from human-readable errors', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const error = new CommandError({
      code: 'PROVIDER_UNAVAILABLE',
      message: '\u001b]0;Owned title\u0007Provider \u001b[8mhidden\u001b[0m failed.',
      action: '\u001b[31mRetry safely.\u001b[0m',
    });

    await expect(runCli(['ask', 'Review'], {}, {
      runAsk: vi.fn().mockRejectedValue(error),
    })).resolves.toBe(1);

    expect(String(write.mock.calls[0]?.[0])).toBe('Provider hidden failed.\nAction: Retry safely.\n');
  });

  it('prints stable errors as one JSON document', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const error = new CommandError({
      code: 'TASK_REQUIRED',
      message: 'A consultation task is required.',
      action: 'Provide a task and try again.',
    });

    await expect(runCli(['ask', '', '--json'], {}, {
      runAsk: vi.fn().mockRejectedValue(error),
    })).resolves.toBe(1);

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      error: error.details,
    });
  });

  it('prints the stack when DEBUG is enabled', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const error = new CommandError({
      code: 'TASK_REQUIRED',
      message: 'A consultation task is required.',
      action: 'Provide a task and try again.',
    });

    await expect(runCli(['ask', ''], {DEBUG: '1'}, {
      runAsk: vi.fn().mockRejectedValue(error),
    })).resolves.toBe(1);

    expect(write.mock.calls.map(call => String(call[0])).join('')).toContain(error.stack);
  });
});
