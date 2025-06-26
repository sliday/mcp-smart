import { describe, it, expect } from 'vitest';

describe('Smart Advisor Prompt Structure', () => {
  const SMART_ADVISOR_PROMPT = `Split yourself to four personas:

1. Manager: The "brain" of the team. Defines clear, understandable requirements for the CTO in simple yet detailed terms. I need this persona to ensure you understand the task correctly. Manager speaks only to CTO.
2. CTO: Lead developer. Gets tasks from Manager, implementing detailed architecture. Adept at best DX methodologies: DRY, SOLID, KISS, TDD. CTO speaks to Manager, QA and Engineer. See "FULL CTO DESCRIPTION" section below.
3. QA: Gets technical description from CTO and implements unit tests covering common states, edge cases, potential bottlenecks and invalid data.
4. Engineer: Senior L6 Google developer implements code per CTO instructions and QA test files. Can consult CTO and QA to clarify ambiguous information, request test updates if interface changes needed, and must get CTO approval to deviate from provided instructions and tests.

Working flow (MUST FOLLOW):
Manager -> CTO -> QA -> Engineer -> QA -> CTO -> Manager

FULL CTO DESCRIPTION: 
~~~~~~
You are an expert coding assistant in languages like Markdown, JavaScript, HTML, CSS, Python, and Node.js. Your goal is to provide concise, clear, readable, efficient, and bug-free code solutions that follow best practices and modern standards.

When debugging, consider 5-7 possible problem sources, identify the 1-2 most likely causes, and add logs to validate your assumptions before implementing fixes.

1. Analyze the code and question:
   In <code_analysis> tags:
   - Identify the programming language used
   - Assess the difficulty level of the task (Easy, Medium, or Hard)
   - Identify key components or functions in the existing code
   - Quote relevant parts of the existing code that relate to the user's question
   - Provide a brief summary of what the existing code does
   - Break down the problem into smaller components
   - Consider potential best practices and optimizations
   - Create a Mermaid diagram to visualize the solution structure

2. Plan your approach:
   In <solution_plan> tags:
   Write detailed, numbered pseudocode outlining your solution strategy. Include comments explaining the reasoning behind each step. It's OK for this section to be quite long.

3. Confirm your understanding:
   Briefly restate the problem and your planned approach to ensure you've correctly interpreted the user's needs.

4. Implement the solution:
   Provide your code implementation, adhering to the following principles:
   - Write bug-free, secure, and efficient code
   - Prioritize readability and maintainability
   - Implement all required functionality completely
   - Avoid placeholders
   - Be concise while maintaining clarity
   - Use the latest relevant technologies and best practices

5. Verify the solution:
   Explain how your implementation meets the requirements and addresses the user's question.

6. Consider improvements:
   Briefly discuss any potential optimizations or alternative approaches, if applicable.

Please format your response as follows:

<difficulty_level>[Easy/Medium/Hard]</difficulty_level>

<code_analysis>
[Your detailed analysis, including the Mermaid diagram]
</code_analysis>

<solution_plan>
[Your detailed, numbered pseudocode with comments]
</solution_plan>

Confirmation: [Your understanding of the problem and approach]

Code:
\\\`\\\`\\\`[language]
// [Filename (if applicable)]
[Your implemented code]
\\\`\\\`\\\`

Verification: [Explanation of how the solution meets the requirements]

Potential Improvements: [Brief discussion of optimizations or alternatives] 
~~~~~~`;

  describe('Prompt Content Validation', () => {
    it('should contain all required personas', () => {
      expect(SMART_ADVISOR_PROMPT).toContain('1. Manager:');
      expect(SMART_ADVISOR_PROMPT).toContain('2. CTO:');
      expect(SMART_ADVISOR_PROMPT).toContain('3. QA:');
      expect(SMART_ADVISOR_PROMPT).toContain('4. Engineer:');
    });

    it('should define the working flow', () => {
      expect(SMART_ADVISOR_PROMPT).toContain('Working flow (MUST FOLLOW):');
      expect(SMART_ADVISOR_PROMPT).toContain('Manager -> CTO -> QA -> Engineer -> QA -> CTO -> Manager');
    });

    it('should include CTO description section', () => {
      expect(SMART_ADVISOR_PROMPT).toContain('FULL CTO DESCRIPTION:');
      expect(SMART_ADVISOR_PROMPT).toContain('~~~~~~');
    });

    it('should specify required methodologies', () => {
      expect(SMART_ADVISOR_PROMPT).toContain('DRY, SOLID, KISS, TDD');
    });

    it('should include structured response format', () => {
      expect(SMART_ADVISOR_PROMPT).toContain('<difficulty_level>');
      expect(SMART_ADVISOR_PROMPT).toContain('<code_analysis>');
      expect(SMART_ADVISOR_PROMPT).toContain('<solution_plan>');
      expect(SMART_ADVISOR_PROMPT).toContain('Confirmation:');
      expect(SMART_ADVISOR_PROMPT).toContain('Code:');
      expect(SMART_ADVISOR_PROMPT).toContain('Verification:');
      expect(SMART_ADVISOR_PROMPT).toContain('Potential Improvements:');
    });

    it('should specify programming languages', () => {
      expect(SMART_ADVISOR_PROMPT).toContain('JavaScript, HTML, CSS, Python, and Node.js');
    });

    it('should include debugging methodology', () => {
      expect(SMART_ADVISOR_PROMPT).toContain('consider 5-7 possible problem sources');
      expect(SMART_ADVISOR_PROMPT).toContain('identify the 1-2 most likely causes');
      expect(SMART_ADVISOR_PROMPT).toContain('add logs to validate your assumptions');
    });

    it('should require Mermaid diagrams', () => {
      expect(SMART_ADVISOR_PROMPT).toContain('Create a Mermaid diagram');
    });
  });

  describe('Prompt Structure', () => {
    it('should have proper section organization', () => {
      const sections = [
        'Split yourself to four personas:',
        'Working flow (MUST FOLLOW):',
        'FULL CTO DESCRIPTION:',
        '1. Analyze the code and question:',
        '2. Plan your approach:',
        '3. Confirm your understanding:',
        '4. Implement the solution:',
        '5. Verify the solution:',
        '6. Consider improvements:',
        'Please format your response as follows:'
      ];

      sections.forEach(section => {
        expect(SMART_ADVISOR_PROMPT).toContain(section);
      });
    });

    it('should not be too short or too long', () => {
      expect(SMART_ADVISOR_PROMPT.length).toBeGreaterThan(1000);
      expect(SMART_ADVISOR_PROMPT.length).toBeLessThan(10000);
    });

    it('should contain specific role definitions', () => {
      expect(SMART_ADVISOR_PROMPT).toContain('Manager speaks only to CTO');
      expect(SMART_ADVISOR_PROMPT).toContain('CTO speaks to Manager, QA and Engineer');
      expect(SMART_ADVISOR_PROMPT).toContain('Senior L6 Google developer');
    });
  });

  describe('Quality Assurance Requirements', () => {
    it('should specify testing requirements', () => {
      expect(SMART_ADVISOR_PROMPT).toContain('unit tests covering common states');
      expect(SMART_ADVISOR_PROMPT).toContain('edge cases');
      expect(SMART_ADVISOR_PROMPT).toContain('potential bottlenecks');
      expect(SMART_ADVISOR_PROMPT).toContain('invalid data');
    });

    it('should emphasize code quality principles', () => {
      expect(SMART_ADVISOR_PROMPT).toContain('bug-free, secure, and efficient code');
      expect(SMART_ADVISOR_PROMPT).toContain('readability and maintainability');
      expect(SMART_ADVISOR_PROMPT).toContain('best practices and modern standards');
    });
  });
});