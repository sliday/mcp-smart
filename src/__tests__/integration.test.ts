import axios from 'axios';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
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

  it('returns stable domain errors across the actual MCP transport', async () => {
    post.mockRejectedValueOnce({
      response: {
        status: 401,
        headers: {'x-request-id': 'safe-request-id'},
      },
      config: {
        headers: {Authorization: 'Bearer must-not-leak'},
        data: 'private prompt',
      },
    });
    const transportServer = new SmartAdvisorServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({name: 'integration-test', version: '1.0.0'});
    await (transportServer as any).server.connect(serverTransport);
    await client.connect(clientTransport);
    await client.listTools();

    try {
      const result = await client.callTool({
        name: 'consult',
        arguments: {task: 'transport failure'},
      });
      expect(result).toMatchObject({
        isError: true,
        structuredContent: {
          error: {
            code: 'AUTHENTICATION_FAILED',
            message: 'OpenRouter authentication failed.',
            action: 'Check OPENROUTER_API_KEY and try again.',
            requestId: 'safe-request-id',
          },
        },
      });
      expect(result.content).toEqual([{
        type: 'text',
        text: 'OpenRouter authentication failed. Action: Check OPENROUTER_API_KEY and try again. (AUTHENTICATION_FAILED)',
      }]);
      expect(JSON.stringify(result)).not.toContain('must-not-leak');
      expect(JSON.stringify(result)).not.toContain('private prompt');
    } finally {
      await client.close();
    }
  });
});
