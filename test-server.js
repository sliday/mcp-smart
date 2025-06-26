#!/usr/bin/env node

// Simple test script to verify the MCP server works
import { SmartAdvisorServer } from './dist/SmartAdvisorServer.js';

async function testServer() {
  console.log('Testing MCP Smart Advisor Server...');
  
  // Set test API key
  process.env.OPENROUTER_API_KEY = 'test-key';
  
  try {
    const server = new SmartAdvisorServer();
    console.log('✓ Server created successfully');
    
    // Test listing tools
    const tools = await server.listTools();
    console.log('✓ Tools listed:', tools.tools.length);
    console.log('  - Tool name:', tools.tools[0].name);
    console.log('  - Supported models:', tools.tools[0].inputSchema.properties.model.enum);
    
    console.log('\n✓ MCP server is working correctly!');
    console.log('\nTo use with real API:');
    console.log('1. Set OPENROUTER_API_KEY environment variable');
    console.log('2. Run: npm start');
    console.log('3. Add to Claude Code MCP configuration');
    
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

testServer();