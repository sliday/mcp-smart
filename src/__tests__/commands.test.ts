import axios from 'axios';
import {describe, expect, it, vi} from 'vitest';
import {runAsk} from '../commands/ask.js';
import {runDoctor} from '../commands/doctor.js';
import {runInit} from '../commands/init.js';

vi.mock('axios');

const post = vi.mocked(axios.post);

describe('command workflows', () => {
  it('returns copyable setup guidance without accepting a key', async () => {
    const result = await runInit({});

    expect(result).toMatchObject({
      environment: {
        variable: 'OPENROUTER_API_KEY',
        exportCommand: 'export OPENROUTER_API_KEY="<your-openrouter-api-key>"',
      },
      client: {command: 'mcp-smart', args: []},
    });
    expect(result).not.toHaveProperty('apiKey');
  });

  it('reports a missing key without probing or exposing a stack', async () => {
    const probe = vi.fn();
    const result = await runDoctor({env: {}, probeOpenRouter: probe});

    expect(result.checks.apiKey).toEqual({
      status: 'missing',
      action: 'Set OPENROUTER_API_KEY and run doctor again.',
    });
    expect(result.checks.openRouter).toEqual({
      status: 'skipped',
      action: 'Set OPENROUTER_API_KEY before checking OpenRouter access.',
    });
    expect(probe).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('stack');
  });

  it('checks the remaining doctor dependencies without exposing its API key', async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    const result = await runDoctor({
      env: {OPENROUTER_API_KEY: 'not-for-output'},
      nodeVersion: '22.1.0',
      isTerminal: true,
      probeOpenRouter: probe,
    });

    expect(result.checks).toMatchObject({
      node: {status: 'ok', value: '22.1.0'},
      terminal: {status: 'ok'},
      apiKey: {status: 'ok'},
      openRouter: {status: 'ok'},
      defaultRoute: {status: 'ok', value: 'openrouter/auto'},
    });
    expect(probe).toHaveBeenCalledWith('not-for-output');
    expect(JSON.stringify(result)).not.toContain('not-for-output');
  });

  it('uses the authenticated OpenRouter key endpoint for the default probe', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ok: true} as Response);

    const result = await runDoctor({
      env: {OPENROUTER_API_KEY: 'not-for-output'},
      nodeVersion: '22.1.0',
      isTerminal: true,
    });

    expect(result.checks.openRouter).toEqual({status: 'ok'});
    expect(fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/key', {
      headers: {Authorization: 'Bearer not-for-output'},
      signal: expect.any(AbortSignal),
    });
    expect(JSON.stringify(result)).not.toContain('not-for-output');
  });

  it('validates the current key endpoint and reports an unauthorized key safely', async () => {
    const sentinelKey = 'sentinel-openrouter-key';
    const mockedFetch = vi.fn().mockResolvedValue({ok: false, status: 401});
    vi.stubGlobal('fetch', mockedFetch);

    try {
      const result = await runDoctor({env: {OPENROUTER_API_KEY: sentinelKey}});

      expect(mockedFetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/key', {
        headers: {Authorization: `Bearer ${sentinelKey}`},
        signal: expect.any(AbortSignal),
      });
      expect(result.checks.openRouter).toEqual({
        status: 'failed',
        action: 'Check OPENROUTER_API_KEY and network access, then run doctor again.',
      });
      expect(JSON.stringify(result)).not.toContain(sentinelKey);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects an empty task with an actionable stable error', async () => {
    await expect(runAsk(' \n\t ', {env: {}})).rejects.toMatchObject({
      details: {
        code: 'TASK_REQUIRED',
        action: 'Provide a task and try again.',
      },
    });
  });

  it('delegates the exact multiline task to an injected OpenRouter client', async () => {
    const result = {
      answer: 'Use the safer approach.',
      receipt: {requestedModel: 'openrouter/auto', preset: 'balanced' as const, latencyMs: 1, cacheHit: false},
    };
    const consult = vi.fn().mockResolvedValue(result);
    const task = '  review this\n```ts\n  const value = 1;\n```\n';

    await expect(runAsk(task, {
      client: {consult},
      context: 'Keep the code fence.',
      model: 'openrouter/auto',
    })).resolves.toEqual(result);

    expect(consult).toHaveBeenCalledWith({
      task,
      context: 'Keep the code fence.',
      model: 'openrouter/auto',
    });
  });

  it('applies documented OpenRouter settings and a non-empty system prompt', async () => {
    post.mockResolvedValueOnce({
      data: {choices: [{message: {content: 'Configured answer'}}]},
      headers: {},
    } as never);

    await expect(runAsk('Review this', {
      intent: 'code-review',
      env: {
        OPENROUTER_API_KEY: 'test-key',
        MAX_TOKENS: '123',
        REQUEST_TIMEOUT: '456',
      },
    })).resolves.toMatchObject({answer: 'Configured answer'});

    const [, body, config] = post.mock.calls[0];
    expect(body).toMatchObject({
      max_tokens: 123,
      messages: [
        {role: 'system', content: expect.stringMatching(/Code Reviewer/)},
        {role: 'user', content: 'Task: Review this'},
      ],
    });
    expect(config).toMatchObject({timeout: 456});
  });

  it('honors MAX_RETRIES as the total OpenRouter attempt limit', async () => {
    post.mockReset();
    post.mockRejectedValue({response: {status: 503, headers: {}}});

    await expect(runAsk('Review this', {
      env: {OPENROUTER_API_KEY: 'test-key', MAX_RETRIES: '1'},
    })).rejects.toMatchObject({details: {code: 'NO_PROVIDER_AVAILABLE'}});

    expect(post).toHaveBeenCalledOnce();
  });

  it('rejects tasks and context beyond the documented environment limits', async () => {
    const consult = vi.fn();

    await expect(runAsk('four', {
      client: {consult},
      env: {MAX_TASK_LENGTH: '3'},
    })).rejects.toMatchObject({details: {code: 'INVALID_INPUT'}});
    await expect(runAsk('ok', {
      client: {consult},
      context: 'four',
      env: {MAX_CONTEXT_LENGTH: '3'},
    })).rejects.toMatchObject({details: {code: 'INVALID_INPUT'}});
    expect(consult).not.toHaveBeenCalled();
  });
});
