import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import axios from 'axios';
import { SmartAdvisorServer } from '../SmartAdvisorServer.js';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    default: {
      post: vi.fn(),
      AxiosError: actual.AxiosError
    },
    AxiosError: actual.AxiosError
  };
});

const mockedAxios = vi.mocked(axios);

describe('Integration Tests', () => {
  let server: SmartAdvisorServer;
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeAll(() => {
    if (!process.env.OPENROUTER_API_KEY) {
      process.env.OPENROUTER_API_KEY = 'test-key-for-integration';
    }
    // Increase rate limits for testing
    process.env.RATE_LIMIT_REQUESTS = '100';
    process.env.RATE_LIMIT_WINDOW = '60000';
    // Disable caching for tests to avoid interference
    process.env.CACHE_TTL = '0';
    vi.clearAllMocks();
    server = new SmartAdvisorServer();
  });

  afterAll(() => {
    process.env.OPENROUTER_API_KEY = originalApiKey;
  });

  describe('End-to-End Tool Flow', () => {
    it('should handle complete tool workflow', async () => {
      const tools = await server.listTools();
      expect(tools.tools).toHaveLength(7);
      expect(tools.tools[0].name).toBe('smart_advisor');

      const toolSchema = tools.tools[0].inputSchema;
      expect(toolSchema.properties.model.enum).toContain('google');
      expect(toolSchema.properties.model.enum).toContain('openai');
      expect(toolSchema.properties.model.enum).toContain('deepseek');
      expect(toolSchema.properties.model.enum).toContain('random');
      expect(toolSchema.properties.model.enum).toContain('all');
      expect(toolSchema.required).toEqual(['model', 'task']);
    });

    it('should validate required parameters', async () => {
      await expect(server.callTool('smart_advisor', {
        model: 'google'
      })).rejects.toThrow();

      await expect(server.callTool('smart_advisor', {
        task: 'test task'
      })).rejects.toThrow();
    });

    it('should handle all supported models', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: 'Mock response for integration test'
            }
          }]
        }
      };
      
      const models = ['google', 'openai', 'deepseek'];
      
      for (const model of models) {
        (mockedAxios.post as any).mockResolvedValueOnce(mockResponse);
        const result = await server.callTool('smart_advisor', {
          model,
          task: 'Simple test task'
        });
        expect(result.content[0].text).toBe('Mock response for integration test');
      }
    });

    it('should handle random model selection', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: 'Random provider response'
            }
          }]
        }
      };
      
      // Test random multiple times to ensure it's working
      const results = [];
      for (let i = 0; i < 5; i++) {
        (mockedAxios.post as any).mockResolvedValueOnce(mockResponse);
        const result = await server.callTool('smart_advisor', {
          model: 'random',
          task: 'Test random provider selection'
        });
        expect(result.content[0].text).toBe('Random provider response');
        results.push(result);
      }
      
      // Verify all calls succeeded
      expect(results).toHaveLength(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      vi.clearAllMocks();
      (mockedAxios.post as any).mockRejectedValueOnce(new Error('Network timeout'));
      
      await expect(server.callTool('smart_advisor', {
        model: 'google',
        task: 'Unique-timeout-test-' + Math.random()
      })).rejects.toThrow('Failed after');
    });

    it('should preserve error context', async () => {
      try {
        await server.callTool('smart_advisor', {
          model: 'invalid-model' as any,
          task: 'test'
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Unknown routing strategy');
      }
    });
  });

  describe('Input Validation', () => {
    it('should handle edge cases in task input', async () => {
      vi.clearAllMocks();
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: 'Edge case response'
            }
          }]
        }
      };
      
      const edgeCases = [
        { task: 'edge-case-unique-1-' + Math.random(), expectError: false },
        { task: 'edge-case-unique-2-' + Math.random() + 'a'.repeat(50), expectError: false },
        { task: 'edge-case-unique-3-' + Math.random() + '-special: @#$%^&*()', expectError: false }
      ];

      for (const testCase of edgeCases) {
        (mockedAxios.post as any).mockResolvedValueOnce(mockResponse);
        const result = await server.callTool('smart_advisor', {
          model: 'google',
          task: testCase.task
        });
        expect(result.content[0].text).toBe('Edge case response');
      }
    });

    it('should handle optional context parameter', async () => {
      vi.clearAllMocks();
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: 'Context test response'
            }
          }]
        }
      };
      
      // Test just one case to avoid rate limits
      (mockedAxios.post as any).mockResolvedValueOnce(mockResponse);
      const result = await server.callTool('smart_advisor', {
        model: 'deepseek',
        task: 'Context-test-unique-task-' + Math.random(),
        context: 'Simple context'
      });
      expect(result.content[0].text).toBe('Context test response');
    });
  });
});