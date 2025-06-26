import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { SmartAdvisorServer } from '../SmartAdvisorServer.js';

vi.mock('axios', () => ({
  default: {
    post: vi.fn()
  }
}));

const mockedAxios = vi.mocked(axios);

describe('SmartAdvisorServer', () => {
  let server: SmartAdvisorServer;
  const originalEnv = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize successfully with API key', () => {
      expect(() => {
        server = new SmartAdvisorServer();
      }).not.toThrow();
    });

    it('should throw error when API key is missing', () => {
      delete process.env.OPENROUTER_API_KEY;
      expect(() => {
        new SmartAdvisorServer();
      }).toThrow('OPENROUTER_API_KEY environment variable is required');
    });
  });

  describe('tool handlers', () => {
    beforeEach(() => {
      server = new SmartAdvisorServer();
    });

    it('should list available tools', async () => {
      const result = await server.listTools();
      
      expect(result.tools).toHaveLength(7);
      
      const toolNames = result.tools.map(tool => tool.name);
      expect(toolNames).toEqual([
        'smart_advisor',
        'code_review', 
        'get_advice',
        'expert_opinion',
        'smart_llm',
        'ask_expert',
        'review_code'
      ]);
      
      // Check first tool structure
      expect(result.tools[0]).toMatchObject({
        name: 'smart_advisor',
        description: 'Get coding advice from premium LLMs using the Smart Advisor prompt structure',
        inputSchema: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              enum: ['deepseek', 'google', 'openai', 'all'],
              description: 'The provider to use for advice (deepseek, google, openai, all)',
            },
            task: {
              type: 'string',
              description: 'The coding task or problem you need advice on',
            },
            context: {
              type: 'string',
              description: 'Additional context about your project or requirements (optional)',
            },
          },
          required: ['model', 'task'],
        },
      });
      
      // Check code_review tool has different description
      expect(result.tools[1]).toMatchObject({
        name: 'code_review',
        description: 'Review your code and provide expert feedback from premium AI models'
      });
    });

    it('should handle smart_advisor tool call successfully', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: 'Mock AI response with structured advice'
            }
          }]
        }
      };
      (mockedAxios.post as any).mockResolvedValueOnce(mockResponse);

      const result = await server.callTool('smart_advisor', {
        model: 'google',
        task: 'Implement a REST API',
        context: 'Using Node.js and Express'
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Mock AI response with structured advice'
      });
    });

    it('should throw error for unknown tool', async () => {
      await expect(server.callTool('unknown_tool', {}))
        .rejects.toThrow('Unknown tool: unknown_tool');
    });

    it('should throw error for unknown model', async () => {
      await expect(server.callTool('smart_advisor', {
        model: 'unknown-model',
        task: 'test task'
      })).rejects.toThrow('Unknown model: unknown-model');
    });

    it('should handle all new tool names', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: 'Tool-specific response'
            }
          }]
        }
      };
      (mockedAxios.post as any).mockResolvedValue(mockResponse);

      const newTools = ['code_review', 'get_advice', 'expert_opinion', 'smart_llm', 'ask_expert', 'review_code'];
      
      for (const toolName of newTools) {
        const result = await server.callTool(toolName, {
          model: 'deepseek',
          task: 'test task'
        });
        
        expect(result.content[0].text).toBe('Tool-specific response');
      }
    });
  });

  describe('OpenRouter API integration', () => {
    beforeEach(() => {
      server = new SmartAdvisorServer();
    });

    it('should call OpenRouter API with correct parameters', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: 'AI response'
            }
          }]
        }
      };
      (mockedAxios.post as any).mockResolvedValueOnce(mockResponse);

      await server.callTool('smart_advisor', {
        model: 'openai',
        task: 'Debug memory leak',
        context: 'React application'
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'openai/o3',
          messages: [
            {
              role: 'system',
              content: expect.stringContaining('Split yourself to four personas')
            },
            {
              role: 'user',
              content: 'Task: Debug memory leak\n\nAdditional Context: React application'
            }
          ],
          temperature: 0.7,
          max_tokens: 4000
        },
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/user/mcp-smart-advisor',
            'X-Title': 'MCP Smart Advisor'
          }
        }
      );
    });

    it('should handle task without context', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: 'AI response without context'
            }
          }]
        }
      };
      (mockedAxios.post as any).mockResolvedValueOnce(mockResponse);

      await server.callTool('smart_advisor', {
        model: 'deepseek',
        task: 'Optimize database queries'
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: 'Task: Optimize database queries'
            })
          ])
        }),
        expect.any(Object)
      );
    });

    it('should handle API errors', async () => {
      (mockedAxios.post as any).mockRejectedValueOnce(new Error('API Error'));

      await expect(server.callTool('smart_advisor', {
        model: 'google',
        task: 'test task'
      })).rejects.toThrow('OpenRouter API error: API Error');
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        data: {
          choices: []
        }
      };
      (mockedAxios.post as any).mockResolvedValueOnce(mockResponse);

      const result = await server.callTool('smart_advisor', {
        model: 'google',
        task: 'test task'
      });

      expect(result.content[0].text).toBe('No response received');
    });
  });

  describe('model mapping', () => {
    beforeEach(() => {
      server = new SmartAdvisorServer();
    });

    it('should map models correctly', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: 'response'
            }
          }]
        }
      };

      const testCases = [
        { input: 'google', expected: 'google/gemini-2.5-pro' },
        { input: 'openai', expected: 'openai/o3' },
        { input: 'deepseek', expected: 'deepseek/deepseek-chat-v3-0324' }
      ];

      for (const testCase of testCases) {
        (mockedAxios.post as any).mockResolvedValueOnce(mockResponse);
        
        await server.callTool('smart_advisor', {
          model: testCase.input as any,
          task: 'test'
        });

        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            model: testCase.expected
          }),
          expect.any(Object)
        );
      }
    });
  });
});