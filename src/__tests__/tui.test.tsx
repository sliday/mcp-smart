import React from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from 'ink-testing-library';
import {App, type TuiDependencies} from '../tui/App.js';
import {TextArea} from '../tui/TextArea.js';
import {runTui} from '../tui/index.js';

const receipt = {
  requestedModel: 'openrouter/auto',
  preset: 'balanced' as const,
  latencyMs: 12,
  cacheHit: false,
};

afterEach(cleanup);

function frame(view: ReturnType<typeof render>): string {
  return view.lastFrame() ?? '';
}

async function press(view: ReturnType<typeof render>, data: string): Promise<void> {
  view.stdin.write(data);
  await new Promise(resolve => setTimeout(resolve, 0));
}

function dependencies(overrides: Partial<TuiDependencies> = {}): TuiDependencies {
  return {
    consult: vi.fn().mockResolvedValue({answer: 'Keep the code fence.', receipt}),
    doctor: vi.fn().mockResolvedValue({checks: {
      node: {status: 'ok'}, terminal: {status: 'ok'}, apiKey: {status: 'ok'},
      openRouter: {status: 'ok'}, defaultRoute: {status: 'ok'},
    }}),
    setup: vi.fn().mockResolvedValue({
      environment: {variable: 'OPENROUTER_API_KEY', exportCommand: 'export OPENROUTER_API_KEY="key"'},
      client: {command: 'mcp-smart', args: []}, nextCommand: 'mcp-smart doctor',
    }),
    ...overrides,
  };
}

describe('Ink terminal interface', () => {
  it('shows the selected route, current focus, default policy, navigation, and footer', () => {
    const view = render(<App terminalWidth={100} dependencies={dependencies()}/>);

    expect(frame(view)).toContain('Consult');
    expect(frame(view)).toContain('Compare');
    expect(frame(view)).toContain('Doctor');
    expect(frame(view)).toContain('Setup');
    expect(frame(view)).toContain('Last Receipt');
    expect(frame(view)).toContain('Selected route: Consult');
    expect(frame(view)).toContain('Focus: Navigation');
    expect(frame(view)).toContain('Balanced');
    expect(frame(view)).toContain('OpenRouter Auto');
    expect(frame(view)).toContain('Tab focus');
  });

  it('uses arrows and Enter to open every destination and ? to show keyboard help', async () => {
    const deps = dependencies();
    const view = render(<App terminalWidth={100} dependencies={deps}/>);

    await press(view, '\u001b[B');
    await press(view, '\r');
    expect(frame(view)).toContain('Compare two advisors');
    await press(view, '\u001b');
    await press(view, '\u001b[B');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('Environment checks'));
    await press(view, '\u001b');
    await press(view, '\u001b[B');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('OPENROUTER_API_KEY'));
    await press(view, '\u001b');
    await press(view, '\u001b[B');
    await press(view, '\r');
    expect(frame(view)).toContain('No receipt yet');
    await press(view, '?');
    expect(frame(view)).toContain('Keyboard help');
    expect(deps.doctor).toHaveBeenCalledOnce();
    expect(deps.setup).toHaveBeenCalledOnce();
  });

  it('uses a compact header below 80 columns and cycles focus with Tab and Shift+Tab', async () => {
    const view = render(<App terminalWidth={60} dependencies={dependencies()}/>);

    expect(frame(view)).toContain('Route: Consult');
    expect(frame(view)).not.toContain('Navigation rail');
    await press(view, '\t');
    expect(frame(view)).toContain('Focus: Task');
    await press(view, '\u001b[Z');
    expect(frame(view)).toContain('Focus: Navigation');
  });

  it('preserves pasted indentation and fenced code exactly while ignoring terminal controls', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const task = '  review this\n```ts\n  const value = 1;\n```\n';
    const view = render(<TextArea label="Task" value="" active onChange={onChange} onSubmit={onSubmit}/>);

    view.stdin.write(task);
    view.stdin.write('\u0003');

    expect(onChange).toHaveBeenLastCalledWith(task);
    expect(onChange).not.toHaveBeenLastCalledWith(expect.stringContaining('\u0003'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('inserts a newline for Shift+Enter while preserving an indented fenced task exactly', async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const Harness = (): React.JSX.Element => {
      const [value, setValue] = React.useState('');
      const change = (next: string) => {
        onChange(next);
        setValue(next);
      };
      return <TextArea label="Task" value={value} active onChange={change} onSubmit={onSubmit}/>;
    };
    const view = render(<Harness/>);

    await press(view, '  review this');
    await press(view, '\u001b[13;2u');
    await press(view, '```ts');
    await press(view, '\u001b[13;2u');
    await press(view, '  const value = 1;');
    await press(view, '\u001b[13;2u');
    await press(view, '```');

    expect(onChange).toHaveBeenLastCalledWith('  review this\n```ts\n  const value = 1;\n```');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('exits through Ink when q is pressed without an injected exit callback', async () => {
    const view = render(<App terminalWidth={100} dependencies={dependencies()}/>);
    const initialFrames = view.frames.length;

    await press(view, 'q');

    expect(view.frames.length).toBeGreaterThan(initialFrames);
  });

  it('submits an exact multiline task and shows its answer plus typed receipt', async () => {
    const consult = vi.fn().mockResolvedValue({answer: 'Use the safer approach.', receipt});
    const task = '  review this\n```ts\n  const value = 1;\n```\n';
    const view = render(<App terminalWidth={100} initialTask={task} dependencies={dependencies({consult})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');

    await vi.waitFor(() => expect(frame(view)).toContain('Use the safer approach.'));
    expect(consult).toHaveBeenCalledWith(expect.objectContaining({
      task,
      preset: 'balanced',
      sessionId: expect.any(String),
    }), expect.any(AbortSignal));
    expect(frame(view)).toContain('Receipt');
    expect(frame(view)).toContain('requestedModel: openrouter/auto');
  });

  it('requires and submits a model ID for the Custom preset', async () => {
    const consult = vi.fn().mockResolvedValue({answer: 'Custom answer.', receipt});
    const view = render(<App terminalWidth={100} initialTask="Review" dependencies={dependencies({consult})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\u001b[C');
    await press(view, '\u001b[C');
    await press(view, '\t');
    expect(frame(view)).toContain('Model ID');
    await press(view, 'anthropic/claude-sonnet-4.5');
    await press(view, '\t');
    await press(view, '\r');

    await vi.waitFor(() => expect(consult).toHaveBeenCalledOnce());
    expect(consult).toHaveBeenCalledWith(expect.objectContaining({
      task: 'Review',
      model: 'anthropic/claude-sonnet-4.5',
      preset: 'custom',
    }), expect.any(AbortSignal));
  });

  it('shows an actionable local error when the Custom model ID is empty', async () => {
    const consult = vi.fn();
    const view = render(<App terminalWidth={100} initialTask="Review" dependencies={dependencies({consult})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\u001b[C');
    await press(view, '\u001b[C');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');

    expect(frame(view)).toContain('Error: Model ID is required for Custom.');
    expect(frame(view)).toContain('Action: Enter an OpenRouter model ID and try again.');
    expect(consult).not.toHaveBeenCalled();
  });

  it('ignores duplicate submissions while a consultation is active', async () => {
    let activeSignal: AbortSignal | undefined;
    const consult = vi.fn((_input: unknown, signal: AbortSignal) => {
      activeSignal = signal;
      return new Promise(() => undefined);
    });
    const view = render(<App terminalWidth={100} initialTask="Review" dependencies={dependencies({consult: consult as TuiDependencies['consult']})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await press(view, '\r');
    await vi.waitFor(() => expect(consult).toHaveBeenCalledOnce());
    await press(view, '\u0003');

    expect(activeSignal?.aborted).toBe(true);
  });

  it('shows an actionable consultation error and cancels once before exiting on a second Ctrl+C', async () => {
    const consult = vi.fn((_input: unknown, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('Cancelled'), {details: {
        code: 'REQUEST_CANCELLED', action: 'Retry when ready.', message: 'Cancelled',
      }})));
    }));
    const onExit = vi.fn();
    const view = render(<App terminalWidth={100} initialTask="Review" onExit={onExit} dependencies={dependencies({consult: consult as TuiDependencies['consult']})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(consult).toHaveBeenCalled());
    await press(view, '\u0003');
    await vi.waitFor(() => expect(frame(view)).toContain('Retry when ready.'));
    expect(frame(view)).toContain('Request stage: Cancelled');
    expect(onExit).not.toHaveBeenCalled();
    await press(view, '\u0003');
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('exits on Ctrl+C when no request is active', async () => {
    const onExit = vi.fn();
    const view = render(<App terminalWidth={100} onExit={onExit} dependencies={dependencies()}/>);

    await press(view, '\u0003');

    expect(onExit).toHaveBeenCalledOnce();
  });

  it('retains and labels a successful compare answer when the other advisor fails', async () => {
    const consult = vi.fn()
      .mockResolvedValueOnce({answer: 'Advisor one answer', receipt: {...receipt, model: undefined}})
      .mockRejectedValueOnce({details: {message: 'Provider unavailable', action: 'Try another advisor.'}});
    const view = render(<App terminalWidth={100} initialTask="Compare this" dependencies={dependencies({consult})}/>);

    await press(view, '\u001b[B');
    await press(view, '\r');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');

    await vi.waitFor(() => expect(frame(view)).toContain('Advisor one answer'));
    expect(frame(view)).toContain('Failed');
    expect(frame(view)).toContain('Try another advisor.');
    expect(frame(view)).toContain('Compare results');
    expect(frame(view)).not.toContain('successful advice is retained');
    expect(consult).toHaveBeenCalledTimes(2);
    expect(consult).not.toHaveBeenCalledWith(expect.objectContaining({model: 'openrouter/auto'}), expect.anything());
  });

  it('renders only receipt fields that were actually present', async () => {
    const consult = vi.fn().mockResolvedValue({answer: 'Answer', receipt});
    const view = render(<App terminalWidth={100} initialTask="Review" dependencies={dependencies({consult})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('Answer'));
    await press(view, '\u001b');
    await press(view, '\u001b[B');
    await press(view, '\u001b[B');
    await press(view, '\u001b[B');
    await press(view, '\u001b[B');
    await press(view, '\r');

    expect(frame(view)).toContain('Last Receipt');
    expect(frame(view)).toContain('requestedModel: openrouter/auto');
    expect(frame(view)).not.toContain('provider:');
    expect(frame(view)).not.toContain('selectedModel:');
    expect(frame(view)).not.toContain('costUsd:');
  });

  it('renders through Ink with only the approved terminal controls', async () => {
    const instance = {waitUntilExit: vi.fn().mockResolvedValue(undefined)};
    const renderer = vi.fn().mockReturnValue(instance);

    await expect(runTui({render: renderer as never})).resolves.toBeUndefined();

    expect(renderer).toHaveBeenCalledWith(expect.anything(), {
      alternateScreen: true,
      exitOnCtrlC: false,
    });
  });
});
