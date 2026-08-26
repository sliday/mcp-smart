import React from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from 'ink-testing-library';
import type {DoctorResult} from '../commands/doctor.js';
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
    expect(frame(view)).toContain('Navigation target: Consult');
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
    expect(frame(view)).toContain('Compare advisors');
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

  it('treats a question mark as task text while the editor is active', async () => {
    const view = render(<App terminalWidth={100} initialTask="Ask" dependencies={dependencies()}/>);

    await press(view, '\t');
    await press(view, '?');

    expect(frame(view)).toContain('Ask?');
    expect(frame(view)).not.toContain('Keyboard help');
  });

  it('keeps controls visible when a multiline task exceeds the terminal height', () => {
    const task = Array.from({length: 20}, (_, index) => `task-line-${String(index).padStart(2, '0')}`).join('\n');
    const view = render(<App terminalWidth={100} terminalHeight={12} initialTask={task} dependencies={dependencies()}/>);

    expect(frame(view)).toContain('…');
    expect(frame(view)).toContain('task-line-19');
    expect(frame(view)).not.toContain('task-line-00');
    expect(frame(view)).toContain('Submit consultation');
    expect(frame(view).split('\n').length).toBeLessThanOrEqual(12);
  });

  it('clips a long unbroken task by terminal columns', () => {
    const task = 'x'.repeat(600);
    const view = render(<App terminalWidth={60} terminalHeight={12} initialTask={task} dependencies={dependencies()}/>);

    expect(frame(view)).toContain('…');
    expect(frame(view)).not.toContain(task);
    expect(frame(view)).toContain('Submit consultation');
    expect(frame(view).split('\n').length).toBeLessThanOrEqual(12);
  });

  it('keeps Doctor loading state consistent and ignores a stale failure after navigation', async () => {
    let rejectDoctor: ((reason?: unknown) => void) | undefined;
    const doctor = vi.fn(() => new Promise<DoctorResult>((_resolve, reject) => { rejectDoctor = reject; }));
    const view = render(<App terminalWidth={100} dependencies={dependencies({doctor})}/>);

    await press(view, '\u001b[B');
    await press(view, '\u001b[B');
    await press(view, '\r');
    expect(frame(view)).toContain('Environment checks');
    expect(frame(view)).toContain('Request stage: Routing request');
    expect(frame(view)).not.toContain('Request stage: Idle');
    await press(view, '\u001b[A');
    await press(view, '\u001b[A');
    await press(view, '\r');
    rejectDoctor?.(new Error('stale doctor failure'));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(frame(view)).toContain('Consult · OpenRouter Auto');
    expect(frame(view)).not.toContain('stale doctor failure');
  });

  it('shows truthful error stages for Doctor and Setup failures', async () => {
    const doctor = vi.fn().mockRejectedValue(new Error('doctor failed'));
    const setup = vi.fn().mockRejectedValue(new Error('setup failed'));
    const view = render(<App terminalWidth={100} dependencies={dependencies({doctor, setup})}/>);

    await press(view, '\u001b[B');
    await press(view, '\u001b[B');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('Error: doctor failed'));
    expect(frame(view)).toContain('Request stage: Error');
    expect(frame(view)).not.toContain('Request stage: Routing request');
    await press(view, '\u001b[B');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('Error: setup failed'));
    expect(frame(view)).toContain('Request stage: Error');
    expect(frame(view)).not.toContain('Request stage: Routing request');
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

  it('submits on Enter and handles Backspace and Delete at the empty boundary', async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const Harness = (): React.JSX.Element => {
      const [value, setValue] = React.useState('ab');
      const change = (next: string) => {
        onChange(next);
        setValue(next);
      };
      return <TextArea label="Task" value={value} active onChange={change} onSubmit={onSubmit}/>;
    };
    const view = render(<Harness/>);

    await press(view, '\u007f');
    await press(view, '\u001b[3~');
    await press(view, '\u001b[3~');
    await press(view, '\r');

    expect(onChange).toHaveBeenNthCalledWith(1, 'a');
    expect(onChange).toHaveBeenNthCalledWith(2, '');
    expect(onChange).toHaveBeenNthCalledWith(3, '');
    expect(onSubmit).toHaveBeenCalledOnce();
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

  it('pages a long consultation answer within the terminal height', async () => {
    const answer = Array.from({length: 12}, (_, index) => `answer-line-${String(index).padStart(2, '0')}`).join('\n');
    const consult = vi.fn().mockResolvedValue({answer, receipt});
    const view = render(<App terminalWidth={100} terminalHeight={17} initialTask="Review" dependencies={dependencies({consult})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('Result page 1/2'));
    expect(frame(view)).toContain('answer-line-00');
    expect(frame(view)).not.toContain('answer-line-11');
    await press(view, '\u001b[6~');

    expect(frame(view)).toContain('Result page 2/2');
    expect(frame(view)).toContain('answer-line-11');
    expect(frame(view)).not.toContain('answer-line-00');
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
    expect(frame(view)).toContain('Consult · anthropic/claude-sonnet-4.5 · Custom');
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
        code: 'REQUEST_CANCELLED', action: '\u001b[8mRetry when ready.\u001b[0m', message: '\u001b]0;Owned title\u0007Cancelled',
      }})));
    }));
    const onExit = vi.fn();
    const onForceExit = vi.fn();
    const view = render(<App terminalWidth={100} initialTask="Review" onExit={onExit} onForceExit={onForceExit} dependencies={dependencies({consult: consult as TuiDependencies['consult']})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(consult).toHaveBeenCalled());
    await press(view, '\u0003');
    await vi.waitFor(() => expect(frame(view)).toContain('Retry when ready.'));
    expect(frame(view)).toContain('Request stage: Cancelled');
    expect(frame(view)).not.toContain('\u001b[8m');
    expect(frame(view)).not.toContain('Owned title');
    expect(onExit).not.toHaveBeenCalled();
    expect(onForceExit).not.toHaveBeenCalled();
    await press(view, '\u0003');
    expect(onExit).not.toHaveBeenCalled();
    expect(onForceExit).toHaveBeenCalledOnce();
  });

  it('exits on Ctrl+C when no request is active', async () => {
    const onExit = vi.fn();
    const view = render(<App terminalWidth={100} onExit={onExit} dependencies={dependencies()}/>);

    await press(view, '\u0003');

    expect(onExit).toHaveBeenCalledOnce();
  });

  it('force exits when two cancellation keys arrive before a rerender', async () => {
    const consult = vi.fn((_input: unknown, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Cancelled')));
    }));
    const onForceExit = vi.fn();
    const view = render(<App terminalWidth={100} initialTask="Review" onForceExit={onForceExit} dependencies={dependencies({consult: consult as TuiDependencies['consult']})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(consult).toHaveBeenCalledOnce());
    view.stdin.write('\u0003');
    view.stdin.write('\u0003');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(onForceExit).toHaveBeenCalledOnce();
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

  it('reports Error when every selected advisor fails', async () => {
    const consult = vi.fn().mockRejectedValue({details: {message: 'Provider unavailable', action: 'Try later.'}});
    const view = render(<App terminalWidth={100} initialTask="Compare this" dependencies={dependencies({consult})}/>);

    await press(view, '\u001b[B');
    await press(view, '\r');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');

    await vi.waitFor(() => expect(frame(view)).toContain('Request stage: Error'));
    expect(frame(view)).toContain('Failed: Provider unavailable');
    expect(frame(view)).not.toContain('Request stage: Response received');
    expect(frame(view)).not.toContain('a answers');
    await press(view, 'a');
    expect(frame(view)).not.toContain('Full advisor answers');
  });

  it('selects explicit non-first-N advisors from a deduplicated four-model checklist', async () => {
    const consult = vi.fn().mockResolvedValue({answer: 'Advisor answer', receipt});
    const advisorModels = ['openrouter/auto', 'model/a', 'model/a', 'model/b', 'model/c', 'model/d'];
    const view = render(<App terminalWidth={100} initialTask="Compare this" advisorModels={advisorModels} dependencies={dependencies({consult})}/>);

    await press(view, '\u001b[B');
    await press(view, '\r');
    expect(frame(view)).toContain('Advisors · 2 selected');
    expect(frame(view)).toContain('[x] model/a');
    expect(frame(view)).toContain('[x] model/b');
    expect(frame(view)).toContain('[ ] model/c');
    expect(frame(view)).toContain('[ ] model/d');
    expect(frame(view).match(/model\/a/g)).toHaveLength(1);
    await press(view, '\t');
    await press(view, '\t');
    expect(frame(view)).toContain('Focus: Advisors');
    await press(view, '\u001b[B');
    await press(view, '\u001b[B');
    await press(view, ' ');
    await press(view, '\u001b[A');
    await press(view, ' ');
    await press(view, '\u001b[A');
    await press(view, ' ');
    expect(frame(view)).toContain('Advisors · 2 selected');
    expect(frame(view)).toContain('[x] model/a');
    expect(frame(view)).toContain('[ ] model/b');
    expect(frame(view)).toContain('[x] model/c');
    await press(view, '\t');
    await press(view, '\r');

    await vi.waitFor(() => expect(consult).toHaveBeenCalledTimes(2));
    expect(consult).toHaveBeenNthCalledWith(1, expect.objectContaining({model: 'model/a', preset: 'custom', excludedModels: ['openrouter/auto']}), expect.any(AbortSignal));
    expect(consult).toHaveBeenNthCalledWith(2, expect.objectContaining({model: 'model/c', preset: 'custom', excludedModels: ['openrouter/auto']}), expect.any(AbortSignal));
  });

  it('recomputes a truthful digest from successful answers and preserves a partial success', async () => {
    const consult = vi.fn()
      .mockResolvedValueOnce({answer: 'Cache results and retry failed requests.', receipt})
      .mockResolvedValueOnce({answer: 'Retry failed requests, then cache results.', receipt})
      .mockResolvedValueOnce({answer: 'Ship the smallest safe patch.', receipt})
      .mockRejectedValueOnce({details: {message: 'Provider unavailable', action: 'Try another advisor.'}});
    const view = render(<App terminalWidth={200} initialTask="Compare this" advisorModels={['model/a', 'model/b']} dependencies={dependencies({consult})}/>);

    await press(view, '\u001b[B');
    await press(view, '\r');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');

    await vi.waitFor(() => expect(frame(view)).toContain('Shared terms: cache, results, retry, failed, requests.'));
    expect(frame(view).replace(/\s+/g, ' ')).toContain('Different emphases: model/a: Cache results and retry failed requests. model/b: Retry failed requests, then cache results.');
    expect(frame(view)).toContain("Suggested next step: Review the shared terms against each advisor's emphasis.");
    expect(frame(view)).not.toContain('Agreements:');
    expect(frame(view)).not.toContain('Recommendation:');

    await press(view, '\r');

    await vi.waitFor(() => expect(frame(view)).toContain('model/a: Ship the smallest safe patch.'));
    expect(frame(view)).toContain('Shared terms: Not enough successful answers to measure overlap.');
    expect(frame(view).replace(/\s+/g, ' ')).toContain('Suggested next step: Review the available advisor summary and retry failed advisors.');
    expect(frame(view)).toContain('Provider unavailable');
    expect(frame(view)).not.toContain('Cache results and retry failed requests.');
    expect(consult).toHaveBeenCalledTimes(4);
  });

  it('keeps four-advisor results compact at 60 columns until a reveals full answers', async () => {
    const answers = [
      'Cache writes first. ALPHA_FULL_DETAIL '.padEnd(180, 'a'),
      'Validate inputs first. BETA_FULL_DETAIL '.padEnd(180, 'b'),
      'Retry transient failures. GAMMA_FULL_DETAIL '.padEnd(180, 'c'),
      `${'Measure latency changes. DELTA_FULL_DETAIL '.padEnd(180, 'd')} DELTA_END`,
    ];
    const consult = vi.fn();
    answers.forEach((answer, index) => consult.mockResolvedValueOnce({answer, receipt: {...receipt, costUsd: (index + 1) / 100}}));
    const view = render(<App terminalWidth={60} terminalHeight={24} initialTask="Compare this" advisorModels={['model/a', 'model/b', 'model/c', 'model/d']} dependencies={dependencies({consult})}/>);

    await press(view, '\u001b[B');
    await press(view, '\r');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\u001b[B');
    await press(view, '\u001b[B');
    await press(view, ' ');
    await press(view, '\u001b[B');
    await press(view, ' ');
    await press(view, '\t');
    await press(view, '\r');

    await vi.waitFor(() => expect(frame(view)).toContain('Answers: collapsed · a to show'));
    const collapsed = frame(view);
    expect(consult).toHaveBeenCalledTimes(4);
    expect(collapsed).toContain('model/d · Success');
    expect(collapsed).toContain('costUsd: 0.04');
    expect(collapsed).not.toContain('ALPHA_FULL_DETAIL');
    expect(collapsed.indexOf('model/a · Success')).toBeLessThan(collapsed.indexOf('Shared terms:'));
    expect(collapsed.split('\n').length).toBeLessThanOrEqual(24);

    await press(view, 'a');

    expect(frame(view)).toContain('Answers: expanded · a to hide');
    expect(frame(view)).not.toContain('DELTA_FULL_DETAIL');
    expect(frame(view)).toContain('Result page 1/');
    let sawAlpha = frame(view).includes('ALPHA_FULL_DETAIL');
    for (let index = 0; index < 10 && !sawAlpha; index++) {
      await press(view, '\u001b[6~');
      sawAlpha = frame(view).includes('ALPHA_FULL_DETAIL');
    }
    expect(sawAlpha).toBe(true);
    for (let index = 0; index < 20; index++) await press(view, '\u001b[6~');
    expect(frame(view)).toContain('DELTA_END');
    expect(frame(view)).not.toContain('ALPHA_FULL_DETAIL');
    expect(frame(view).split('\n').length).toBeLessThanOrEqual(24);
  });

  it('caps shared terms so collapsed Compare results stay compact', async () => {
    const shared = Array.from({length: 20}, (_, index) => `term${index}`).join(' ');
    const consult = vi.fn().mockResolvedValue({answer: shared, receipt});
    const view = render(<App terminalWidth={200} initialTask="Compare" advisorModels={['model/a', 'model/b']} dependencies={dependencies({consult})}/>);

    await press(view, '\u001b[B');
    await press(view, '\r');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('Shared terms:'));

    expect(frame(view)).toContain('term0, term1, term2, term3, term4, term5, term6, term7 (+12 more).');
    expect(frame(view)).not.toContain('term19.');
  });

  it('finds shared Unicode terms in non-English answers', async () => {
    const consult = vi.fn().mockResolvedValue({answer: 'Кэширование снижает повторные запросы.', receipt});
    const view = render(<App terminalWidth={100} initialTask="Compare" advisorModels={['model/a', 'model/b']} dependencies={dependencies({consult})}/>);

    await press(view, '\u001b[B');
    await press(view, '\r');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('Shared terms: кэширование, снижает, повторные, запросы.'));
  });

  it('bounds a shared no-space Unicode term in the compare digest', async () => {
    const shared = '長'.repeat(500);
    const consult = vi.fn().mockResolvedValue({answer: shared, receipt});
    const view = render(<App terminalWidth={100} initialTask="Compare" advisorModels={['model/a', 'model/b']} dependencies={dependencies({consult})}/>);

    await press(view, '\u001b[B');
    await press(view, '\r');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('Shared terms:'));

    expect(frame(view)).toContain(`Shared terms: ${'長'.repeat(21)}...`);
    expect(frame(view)).not.toContain('長'.repeat(100));
  });

  it('aborts an active request on route switch and ignores its stale completion', async () => {
    let activeSignal: AbortSignal | undefined;
    let resolveConsult: ((value: {answer: string; receipt: typeof receipt}) => void) | undefined;
    const consult = vi.fn((_input: unknown, signal: AbortSignal) => {
      activeSignal = signal;
      return new Promise<{answer: string; receipt: typeof receipt}>(resolve => { resolveConsult = resolve; });
    });
    const view = render(<App terminalWidth={100} initialTask="Review" dependencies={dependencies({consult: consult as TuiDependencies['consult']})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(consult).toHaveBeenCalledOnce());
    await press(view, '\u001b[Z');
    await press(view, '\u001b[Z');
    await press(view, '\u001b[Z');
    await press(view, '\u001b[Z');
    await press(view, '\u001b[B');
    await press(view, '\u001b[B');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('Environment checks'));
    resolveConsult?.({answer: 'stale answer', receipt});
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(activeSignal?.aborted).toBe(true);
    expect(frame(view)).not.toContain('stale answer');
  });

  it('aborts an active request before q exits', async () => {
    let activeSignal: AbortSignal | undefined;
    const consult = vi.fn((_input: unknown, signal: AbortSignal) => {
      activeSignal = signal;
      return new Promise(() => undefined);
    });
    const onExit = vi.fn();
    const view = render(<App terminalWidth={100} initialTask="Review" onExit={onExit} dependencies={dependencies({consult: consult as TuiDependencies['consult']})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(consult).toHaveBeenCalledOnce());
    await press(view, '\u001b[Z');
    await press(view, '\u001b[Z');
    await press(view, '\u001b[Z');
    await press(view, '\u001b[Z');
    await press(view, 'q');

    expect(activeSignal?.aborted).toBe(true);
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('keeps the submitted task stable while its request is active', async () => {
    const consult = vi.fn(() => new Promise(() => undefined));
    const view = render(<App terminalWidth={100} initialTask="Review" dependencies={dependencies({consult: consult as TuiDependencies['consult']})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(consult).toHaveBeenCalledOnce());
    await press(view, '\u001b[Z');
    await press(view, '\u001b[Z');
    await press(view, '\u001b[Z');
    await press(view, ' changed');

    expect(frame(view)).toContain('Review');
    expect(frame(view)).not.toContain('Review changed');
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

  it('clears the previous receipt when a follow-up request fails', async () => {
    const consult = vi.fn()
      .mockResolvedValueOnce({answer: 'First answer', receipt})
      .mockRejectedValueOnce({details: {message: 'Provider failed', action: 'Retry later.'}});
    const view = render(<App terminalWidth={100} initialTask="Review" dependencies={dependencies({consult})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('requestedModel: openrouter/auto'));
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('Provider failed'));

    expect(frame(view)).not.toContain('requestedModel: openrouter/auto');
    await press(view, '\u001b[Z');
    await press(view, '\u001b[Z');
    await press(view, '\u001b[Z');
    await press(view, '\u001b[Z');
    await press(view, '\u001b[B');
    await press(view, '\u001b[B');
    await press(view, '\u001b[B');
    await press(view, '\u001b[B');
    await press(view, '\r');
    expect(frame(view)).toContain('Last Receipt');
    expect(frame(view)).toContain('requestedModel: openrouter/auto');
  });

  it('strips terminal controls from answers and receipt values', async () => {
    const consult = vi.fn().mockResolvedValue({
      answer: '\u001b]0;Owned title\u0007Keep \u001b[8mthis visible\u001b[0m.',
      receipt: {...receipt, selectedModel: '\u001b[8mmodel/a\u001b[0m'},
    });
    const view = render(<App terminalWidth={100} initialTask="Review" dependencies={dependencies({consult})}/>);

    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\t');
    await press(view, '\r');
    await vi.waitFor(() => expect(frame(view)).toContain('Keep this visible.'));

    expect(frame(view)).toContain('selectedModel: model/a');
    expect(frame(view)).not.toContain('\u001b[8m');
    expect(frame(view)).not.toContain('Owned title');
  });

  it('renders through Ink with only the approved terminal controls', async () => {
    const instance = {waitUntilExit: vi.fn().mockResolvedValue(undefined)};
    const renderer = vi.fn().mockReturnValue(instance);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    try {
      await expect(runTui({render: renderer as never})).resolves.toBeUndefined();

      expect(renderer).toHaveBeenCalledWith(expect.anything(), {
        alternateScreen: true,
        exitOnCtrlC: false,
      });
      const app = renderer.mock.calls[0]?.[0] as React.ReactElement<{onForceExit: () => void}>;
      app.props.onForceExit();
      expect(exit).toHaveBeenCalledWith(130);
    } finally {
      exit.mockRestore();
    }
  });
});
