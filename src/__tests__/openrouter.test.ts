import axios from 'axios';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {OpenRouterClient, normalizeOpenRouterError} from '../openrouter.js';

vi.mock('axios');

const post = vi.mocked(axios.post);

function response(data: Record<string, unknown>, headers: Record<string, string> = {}) {
  return {data, headers};
}

describe('OpenRouterClient', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('rejects a missing key without sending a request', async () => {
    const client = new OpenRouterClient({apiKey: '   '});
    await expect(client.consult({task: 'x'})).rejects.toMatchObject({
      details: {code: 'MISSING_API_KEY'},
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('sends the exact Auto shape, session metadata, and preserved input', async () => {
    post.mockResolvedValue(response({
      id: 'gen-1',
      model: 'anthropic/claude-sonnet-4.5',
      choices: [{message: {content: 'Answer'}}],
      usage: {prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.01},
    }, {'x-request-id': 'req-1'}) as never);
    const task = '  review\n```ts\n  const x = 1;\n```  ';
    const context = '\n  preserve me\n';
    const client = new OpenRouterClient({
      apiKey: 'test-key',
      maxTokens: 777,
      buildSystemPrompt: () => 'EXISTING PROMPT',
    });

    const result = await client.consult({
      task,
      context,
      sessionId: 'session-1',
      allowedModels: ['model/a'],
      excludedModels: ['model/b'],
    });

    const [, body, config] = post.mock.calls[0];
    expect(body).toEqual({
      model: 'openrouter/auto',
      messages: [
        {role: 'system', content: 'EXISTING PROMPT'},
        {role: 'user', content: `Task: ${task}\n\nAdditional Context: ${context}`},
      ],
      plugins: [{
        id: 'auto-router',
        cost_tier: 'medium',
        allowed_models: ['model/a'],
        excluded_models: ['model/b'],
      }],
      session_id: 'session-1',
      usage: {include: true},
      max_tokens: 777,
    });
    expect(config).toEqual(expect.objectContaining({
      headers: expect.objectContaining({'X-OpenRouter-Metadata': 'enabled'}),
    }));
    expect(result).toEqual({
      answer: 'Answer',
      receipt: expect.objectContaining({
        requestId: 'req-1',
        requestedModel: 'openrouter/auto',
        selectedModel: 'anthropic/claude-sonnet-4.5',
        preset: 'balanced',
        costTier: 'medium',
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        costUsd: 0.01,
        cacheHit: false,
      }),
    });
  });

  it('omits the plugin for direct models', async () => {
    post.mockResolvedValue(response({choices: [{message: {content: 'ok'}}]}) as never);
    const client = new OpenRouterClient({apiKey: 'key'});
    await client.consult({task: 'x', model: 'openai/gpt-5'});
    expect(post.mock.calls[0][1]).not.toHaveProperty('plugins');
  });

  it('sends smart-auto through the direct GPT-5 Mini compatibility route', async () => {
    post.mockResolvedValue(response({choices: [{message: {content: 'ok'}}]}) as never);
    const result = await new OpenRouterClient({apiKey: 'key'}).consult({
      task: 'x',
      model: 'smart-auto',
      costTier: 'max',
    });

    expect(post.mock.calls[0][1]).toEqual(expect.objectContaining({
      model: 'openai/gpt-5-mini',
    }));
    expect(post.mock.calls[0][1]).not.toHaveProperty('plugins');
    expect(result.receipt).toMatchObject({
      requestedModel: 'openai/gpt-5-mini',
      preset: 'custom',
    });
    expect(result.receipt).not.toHaveProperty('costTier');
  });

  it('forwards an optional cancellation signal to Axios', async () => {
    post.mockResolvedValue(response({choices: [{message: {content: 'ok'}}]}) as never);
    const controller = new AbortController();
    const client = new OpenRouterClient({apiKey: 'key', signal: controller.signal});

    await client.consult({task: 'x'});

    expect(post.mock.calls[0][2]).toEqual(expect.objectContaining({
      signal: controller.signal,
    }));
  });

  it('does not invent absent response metadata', async () => {
    post.mockResolvedValue(response({choices: [{message: {content: 'ok'}}]}) as never);
    const result = await new OpenRouterClient({apiKey: 'key'}).consult({task: 'x'});
    for (const key of ['requestId', 'selectedModel', 'provider', 'taskType', 'promptTokens',
      'completionTokens', 'totalTokens', 'costUsd', 'fallbackUsed']) {
      expect(result.receipt).not.toHaveProperty(key);
    }
  });

  it('normalizes only observed nested OpenRouter provider and task metadata', async () => {
    post.mockResolvedValue(response({
      provider: 'obsolete-top-level-provider',
      task_type: 'obsolete-top-level-task',
      fallback_used: true,
      choices: [{message: {content: 'ok'}}],
      openrouter_metadata: {
        endpoints: {
          available: [
            {provider: 'Provider A', selected: false},
            {provider: 'Provider B', selected: true},
            {provider: 'Provider C', selected: false},
          ],
        },
        pipeline: [
          {type: 'unrelated', data: {value: 'ignored'}},
          {type: 'classification', data: {task_type: 'coding'}},
        ],
      },
    }) as never);

    const result = await new OpenRouterClient({apiKey: 'key'}).consult({task: 'x'});

    expect(result.receipt).toMatchObject({
      provider: 'Provider B',
      taskType: 'coding',
    });
    expect(result.receipt).not.toHaveProperty('fallbackUsed');
  });

  it('rejects a malformed successful response without retrying', async () => {
    post.mockResolvedValue(response({choices: [{message: {}}]}) as never);
    const client = new OpenRouterClient({
      apiKey: 'key',
      maxAttempts: 3,
      delay: async () => undefined,
    });

    await expect(client.consult({task: 'x'})).rejects.toMatchObject({
      details: {
        code: 'INVALID_PROVIDER_RESPONSE',
        message: 'OpenRouter returned an invalid response.',
        action: 'Retry the request or choose another model.',
      },
    });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, 'AUTHENTICATION_FAILED'],
    [402, 'INSUFFICIENT_CREDITS'],
    [403, 'MODEL_RESTRICTED'],
    [404, 'NO_ELIGIBLE_MODEL'],
    [429, 'PROVIDER_RATE_LIMITED'],
  ] as const)('stops after one non-transient %s response', async (status, code) => {
    post.mockRejectedValue({response: {status, headers: {'retry-after': '2'}}});
    const client = new OpenRouterClient({apiKey: 'key', delay: async () => undefined});
    await expect(client.consult({task: 'x'})).rejects.toMatchObject({details: {code}});
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{code: 'ECONNABORTED'}, 'REQUEST_TIMEOUT'],
    [{response: {status: 408, headers: {}}}, 'REQUEST_TIMEOUT'],
    [{response: {status: 503, headers: {}}}, 'NO_PROVIDER_AVAILABLE'],
  ])('makes at most three total attempts for a transient failure', async (error, code) => {
    post.mockRejectedValue(error);
    const client = new OpenRouterClient({apiKey: 'key', delay: async () => undefined});
    await expect(client.consult({task: 'x'})).rejects.toMatchObject({details: {code}});
    expect(post).toHaveBeenCalledTimes(3);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'uses a bounded default attempt count for non-finite maxAttempts %s',
    async maxAttempts => {
      post.mockRejectedValue({response: {status: 503, headers: {}}});
      const client = new OpenRouterClient({
        apiKey: 'key',
        maxAttempts,
        delay: async () => undefined,
      });

      await expect(client.consult({task: 'x'})).rejects.toMatchObject({
        details: {code: 'NO_PROVIDER_AVAILABLE'},
      });
      expect(post).toHaveBeenCalledTimes(3);
    },
  );
});

describe('normalizeOpenRouterError', () => {
  it('copies Retry-After seconds without exposing request data', () => {
    expect(normalizeOpenRouterError({
      response: {status: 429, headers: {'retry-after': '2'}},
      config: {headers: {Authorization: 'Bearer secret'}, data: 'private prompt'},
    })).toEqual({
      code: 'PROVIDER_RATE_LIMITED',
      message: 'OpenRouter rate limit exceeded.',
      action: 'Wait before retrying or reduce request frequency.',
      retryAfterMs: 2000,
    });
  });
});
