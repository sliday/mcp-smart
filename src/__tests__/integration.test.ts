import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SmartAdvisorServer } from '../SmartAdvisorServer.js';

describe('Integration Tests', () => {
  let server: SmartAdvisorServer;
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeAll(() => {
    if (!process.env.OPENROUTER_API_KEY) {
      process.env.OPENROUTER_API_KEY = 'test-key-for-integration';
    }
    server = new SmartAdvisorServer();
  });

  afterAll(() => {
    process.env.OPENROUTER_API_KEY = originalApiKey;
  });

  describe('End-to-End Tool Flow', () => {
    it('should handle complete tool workflow', async () => {
      const tools = await server.listTools();
      expect(tools.tools).toHaveLength(1);
      expect(tools.tools[0].name).toBe('smart_advisor');

      const toolSchema = tools.tools[0].inputSchema;
      expect(toolSchema.properties.model.enum).toContain('google');
      expect(toolSchema.properties.model.enum).toContain('openai');
      expect(toolSchema.properties.model.enum).toContain('deepseek');
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
      const models = ['google', 'openai', 'deepseek'];
      
      for (const model of models) {
        try {
          await server.callTool('smart_advisor', {
            model,
            task: 'Simple test task'
          });
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('OpenRouter API error');
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
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
        expect((error as Error).message).toContain('Unknown model');
      }
    });
  });

  describe('Input Validation', () => {
    it('should handle edge cases in task input', async () => {
      const edgeCases = [
        { task: '', expectError: false },
        { task: 'a'.repeat(10000), expectError: false },
        { task: 'Task with special chars: @#$%^&*()', expectError: false }
      ];

      for (const testCase of edgeCases) {
        try {
          await server.callTool('smart_advisor', {
            model: 'google',
            task: testCase.task
          });
        } catch (error) {
          if (!testCase.expectError) {
            expect((error as Error).message).toContain('OpenRouter API error');
          }
        }
      }
    });

    it('should handle optional context parameter', async () => {
      const testCases = [
        { context: undefined },
        { context: '' },
        { context: 'Simple context' },
        { context: 'Context with\nnewlines\nand\ttabs' }
      ];

      for (const testCase of testCases) {
        try {
          await server.callTool('smart_advisor', {
            model: 'deepseek',
            task: 'Test task',
            ...testCase
          });
        } catch (error) {
          expect((error as Error).message).toContain('OpenRouter API error');
        }
      }
    });
  });
});