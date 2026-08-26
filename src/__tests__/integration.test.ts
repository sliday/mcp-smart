import axios from 'axios';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {SmartAdvisorServer} from '../SmartAdvisorServer.js';

vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>();
  return {...actual, default: {post: vi.fn()}};
});

const post = vi.mocked(axios.post);
const originalEnv = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  RATE_LIMIT_REQUESTS: process.env.RATE_LIMIT_REQUESTS,
};

function restoreEnv(name: keyof typeof originalEnv) {
  const value = originalEnv[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('canonical MCP integration', () => {
  let server: SmartAdvisorServer;

  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = 'integration-key';
    process.env.RATE_LIMIT_REQUESTS = '100';
    server = new SmartAdvisorServer();
  });

  afterAll(() => {
    restoreEnv('OPENROUTER_API_KEY');
    restoreEnv('RATE_LIMIT_REQUESTS');
  });

  it('lists only the canonical tool surface', async () => {
    const tools = await server.listTools();
    expect(tools.tools.map((tool: {name: string}) => tool.name)).toEqual(['consult', 'smart_doctor', 'smart_status']);
  });

  it('validates task but defaults routing when model is absent', async () => {
    await expect(server.callTool('consult', {})).rejects.toMatchObject({details: {code: 'INVALID_INPUT'}});
    post.mockResolvedValue({data: {choices: [{message: {content: 'ok'}}]}, headers: {}} as never);
    await expect(server.callTool('consult', {task: 'works without model'})).resolves.toMatchObject({
      content: [{type: 'text', text: 'ok'}],
      structuredContent: {answer: 'ok'},
    });
  });

  it('keeps aliases hidden but callable', async () => {
    post.mockResolvedValue({data: {choices: [{message: {content: 'legacy ok'}}]}, headers: {}} as never);
    const result = await server.callTool('code_review', {task: 'review'});
    expect(result.structuredContent.answer).toBe('legacy ok');
  });
});
