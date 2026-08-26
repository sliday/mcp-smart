import {describe, expect, it} from 'vitest';
import {buildConsultationCacheKey, resolveRoute} from '../contracts.js';
import type {ConsultInput} from '../contracts.js';

describe('consultation contracts', () => {
  it('defaults to balanced OpenRouter Auto', () => {
    expect(resolveRoute({task: 'Review this'})).toEqual({
      model: 'openrouter/auto',
      preset: 'balanced',
      costTier: 'medium',
      pluginId: 'auto-router',
    });
  });

  it.each([
    ['fast', 'low'],
    ['balanced', 'medium'],
    ['best', 'max'],
  ] as const)('maps %s to the matching Auto cost tier', (preset, costTier) => {
    expect(resolveRoute({task: 'x', preset})).toMatchObject({
      model: 'openrouter/auto',
      preset,
      costTier,
      pluginId: 'auto-router',
    });
  });

  it('omits the Auto plugin for a direct model', () => {
    expect(resolveRoute({task: 'x', model: 'anthropic/claude-sonnet-4.5'})).toEqual({
      model: 'anthropic/claude-sonnet-4.5',
      preset: 'custom',
    });
  });

  it('resolves smart-auto to the direct GPT-5 Mini compatibility route', () => {
    expect(resolveRoute({task: 'x', model: 'smart-auto'})).toEqual({
      model: 'openai/gpt-5-mini',
      preset: 'custom',
    });
  });

  it('does not expose an unapplied Auto cost tier for direct models', () => {
    expect(resolveRoute({
      task: 'x',
      model: 'openai/gpt-5',
      preset: 'best',
      costTier: 'max',
    })).toEqual({
      model: 'openai/gpt-5',
      preset: 'custom',
    });
  });

  it('preserves Auto restrictions without sharing mutable arrays', () => {
    const allowedModels = ['openai/gpt-5', 'anthropic/claude-sonnet-4.5'];
    const excludedModels = ['google/gemini-flash'];
    const route = resolveRoute({task: 'x', allowedModels, excludedModels, maxTokens: 900});

    expect(route.allowedModels).toEqual(allowedModels);
    expect(route.excludedModels).toEqual(excludedModels);
    expect(route.allowedModels).not.toBe(allowedModels);
    expect(route.excludedModels).not.toBe(excludedModels);
  });

  it('separates every cache identity field', () => {
    const base = {
      task: '  task\n',
      context: '```ts\n  code\n```',
      intent: 'advice' as const,
      preset: 'custom' as const,
      model: 'openrouter/auto',
      costTier: 'high' as const,
      allowedModels: ['model/a'],
      excludedModels: ['model/b'],
      maxTokens: 321,
      sessionId: 'session-1',
    };
    const key = buildConsultationCacheKey(base, 'v2');
    const variants: Array<[ConsultInput, string]> = [
      [{...base, intent: 'code-review' as const}, 'v2'],
      [base, 'v3'],
      [{...base, model: 'model/direct'}, 'v2'],
      [{...base, preset: 'best' as const}, 'v2'],
      [{...base, costTier: 'max' as const}, 'v2'],
      [{...base, allowedModels: ['model/c']}, 'v2'],
      [{...base, excludedModels: ['model/c']}, 'v2'],
      [{...base, maxTokens: 322}, 'v2'],
      [{...base, sessionId: 'session-2'}, 'v2'],
      [{...base, task: 'task'}, 'v2'],
      [{...base, context: 'context'}, 'v2'],
    ];

    for (const [input, promptVersion] of variants) {
      expect(buildConsultationCacheKey(input, promptVersion)).not.toBe(key);
    }
  });

  it('normalizes restriction order without mutating caller arrays', () => {
    const allowedModels = ['model/b', 'model/a'];
    const excludedModels = ['model/d', 'model/c'];
    const first = buildConsultationCacheKey(
      {task: 'x', allowedModels, excludedModels},
      'v2',
    );
    const second = buildConsultationCacheKey(
      {task: 'x', allowedModels: [...allowedModels].reverse(), excludedModels: [...excludedModels].reverse()},
      'v2',
    );

    expect(first).toBe(second);
    expect(allowedModels).toEqual(['model/b', 'model/a']);
    expect(excludedModels).toEqual(['model/d', 'model/c']);
  });
});
