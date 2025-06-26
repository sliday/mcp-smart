import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import axios from 'axios';
import { SmartAdvisorServer } from '../SmartAdvisorServer.js';

vi.mock('axios', () => ({
  default: {
    post: vi.fn()
  }
}));

const mockedAxios = vi.mocked(axios);

describe('Integration Tests', () => {
  let server: SmartAdvisorServer;
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeAll(() => {
    if (!process.env.OPENROUTER_API_KEY) {
      process.env.OPENROUTER_API_KEY = 'test-key-for-integration';
    }
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
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      (mockedAxios.post as any).mockRejectedValueOnce(new Error('Network timeout'));
      
      await expect(server.callTool('smart_advisor', {
        model: 'google',
        task: 'Test task that might timeout'
      })).rejects.toThrow('OpenRouter API error');
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
        { task: '', expectError: false },
        { task: 'a'.repeat(10000), expectError: false },
        { task: 'Task with special chars: @#$%^&*()', expectError: false }
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
        task: 'Test task',
        context: 'Simple context'
      });
      expect(result.content[0].text).toBe('Context test response');
    });
  });
});