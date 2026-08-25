import axios from 'axios';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SmartAdvisorServer} from '../SmartAdvisorServer.js';

vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>();
  return {...actual, default: {post: vi.fn()}};
});

const post = vi.mocked(axios.post);
const originalEnv = {...process.env};

function providerResponse(answer = 'Answer') {
  return {data: {id: 'gen-1', model: 'model/selected', choices: [{message: {content: answer}}]}, headers: {}};
}

describe('SmartAdvisorServer canonical MCP contract', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.RATE_LIMIT_REQUESTS = '100';
    process.env.CACHE_TTL = '300000';
    process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = '5';
    post.mockReset();
  });

  afterEach(() => {
    process.env = {...originalEnv};
  });

  it('advertises exactly three canonical tools with task-only required input', async () => {
    const result = await new SmartAdvisorServer().listTools();
    expect(result.tools.map((tool: {name: string}) => tool.name)).toEqual(['consult', 'smart_doctor', 'smart_status']);
    expect(result.tools[0].inputSchema.required).toEqual(['task']);
    expect(Object.keys(result.tools[0].inputSchema.properties)).toEqual([
      'task', 'context', 'intent', 'preset', 'model', 'costTier', 'allowedModels',
      'excludedModels', 'maxTokens', 'sessionId', 'fresh',
    ]);
    expect(result.tools[0].outputSchema).toBeDefined();
  });

  it('returns readable content and typed structured content without requiring model', async () => {
    post.mockResolvedValue(providerResponse('Typed answer') as never);
    const result = await new SmartAdvisorServer().callTool('consult', {task: 'help'});
    expect(result.content).toEqual([{type: 'text', text: 'Typed answer'}]);
    expect(result.structuredContent).toMatchObject({
      answer: 'Typed answer',
      receipt: {requestedModel: 'openrouter/auto', preset: 'balanced', cacheHit: false},
    });
  });

  it('keeps all seven aliases callable and maps them to canonical intents', async () => {
    const server = new SmartAdvisorServer();
    const aliases = ['smart_advisor', 'code_review', 'get_advice', 'expert_opinion', 'smart_llm', 'ask_expert', 'review_code'];
    for (const alias of aliases) {
      post.mockResolvedValueOnce(providerResponse(alias) as never);
      await expect(server.callTool(alias, {task: alias, fresh: true})).resolves.toHaveProperty('structuredContent');
    }
    expect((server as any).resolveIntent('code_review')).toBe('code-review');
    expect((server as any).resolveIntent('review_code')).toBe('code-review');
    expect((server as any).resolveIntent('expert_opinion')).toBe('expert-opinion');
    expect((server as any).resolveIntent('ask_expert')).toBe('expert-opinion');
    expect((server as any).resolveIntent('smart_advisor')).toBe('advice');
    expect((server as any).resolveIntent('get_advice')).toBe('advice');
    expect((server as any).resolveIntent('smart_llm')).toBe('advice');
  });

  it('preserves task and context whitespace and fences', async () => {
    post.mockResolvedValue(providerResponse() as never);
    const task = '  review\n```ts\n  const x = 1;\n```  ';
    const context = '\n  context\n';
    await new SmartAdvisorServer().callTool('consult', {task, context});
    expect((post.mock.calls[0][1] as any).messages[1].content)
      .toBe(`Task: ${task}\n\nAdditional Context: ${context}`);
  });

  it('uses route-sensitive cache identity and fresh bypasses reads', async () => {
    post.mockResolvedValue(providerResponse() as never);
    const server = new SmartAdvisorServer();
    const first = await server.callTool('consult', {task: 'same'});
    const cached = await server.callTool('consult', {task: 'same'});
    await server.callTool('consult', {task: 'same', preset: 'best'});
    await server.callTool('consult', {task: 'same', fresh: true});
    expect(post).toHaveBeenCalledTimes(3);
    expect(first.structuredContent.receipt.cacheHit).toBe(false);
    expect(cached.structuredContent.receipt).toMatchObject({cacheHit: true, cacheAgeMs: expect.any(Number)});
  });

  it('exposes safe doctor and status diagnostics before consultation limits', async () => {
    process.env.RATE_LIMIT_REQUESTS = '0';
    const server = new SmartAdvisorServer();
    const doctor = await server.callTool('smart_doctor', {});
    const status = await server.callTool('smart_status', {});
    expect(doctor.structuredContent).toMatchObject({apiKeyPresent: true, nodeVersion: expect.any(String)});
    expect(JSON.stringify(doctor)).not.toContain('test-key');
    expect(status.structuredContent).toMatchObject({status: expect.any(String), circuitBreakers: expect.any(Object)});
  });

  it('returns a stable local rate-limit error', async () => {
    process.env.RATE_LIMIT_REQUESTS = '1';
    post.mockResolvedValue(providerResponse() as never);
    const server = new SmartAdvisorServer();
    await server.callTool('consult', {task: 'one'});
    await expect(server.callTool('consult', {task: 'two'})).rejects.toMatchObject({
      details: {code: 'LOCAL_RATE_LIMITED', action: expect.any(String)},
    });
  });

  it('returns a stable circuit-breaker error without another provider call', async () => {
    process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = '1';
    post.mockRejectedValue({response: {status: 503, headers: {}}});
    const server = new SmartAdvisorServer();
    await expect(server.callTool('consult', {task: 'one'})).rejects.toMatchObject({details: {code: 'NO_PROVIDER_AVAILABLE'}});
    expect(post).toHaveBeenCalledTimes(3);
    await expect(server.callTool('consult', {task: 'two'})).rejects.toMatchObject({details: {code: 'CIRCUIT_BREAKER_OPEN'}});
    expect(post).toHaveBeenCalledTimes(3);
  });
});
