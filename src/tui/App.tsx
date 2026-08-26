import {randomUUID} from 'node:crypto';
import React, {useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import {runAsk} from '../commands/ask.js';
import {runDoctor, type DoctorResult} from '../commands/doctor.js';
import {runInit, type CommandResult} from '../commands/init.js';
import type {ConsultInput, ConsultationPreset, ConsultationReceipt, ConsultationResult} from '../contracts.js';
import {OpenRouterClient} from '../openrouter.js';
import {TextArea} from './TextArea.js';
import {theme} from './theme.js';

const ROUTES = ['Consult', 'Compare', 'Doctor', 'Setup', 'Last Receipt'] as const;
type Route = typeof ROUTES[number];
type Stage = 'Idle' | 'Routing request' | 'Requesting advisors' | 'Response received' | 'Cancelled' | 'Error';

const ADVISOR_MODELS = ['anthropic/claude-sonnet-4.5', 'openai/gpt-5'] as const;

export interface TuiDependencies {
  consult: (input: ConsultInput, signal: AbortSignal) => Promise<ConsultationResult>;
  doctor: () => Promise<DoctorResult>;
  setup: () => Promise<CommandResult>;
}

function errorDetails(error: unknown): {message: string; action: string} {
  const details = typeof error === 'object' && error !== null && 'details' in error
    ? (error as {details?: {message?: string; action?: string}}).details : undefined;
  return {message: details?.message ?? (error instanceof Error ? error.message : 'Request failed.'), action: details?.action ?? 'Check the request and try again.'};
}

const defaultDependencies: TuiDependencies = {
  async consult(input, signal) {
    const {task, ...options} = input;
    return runAsk(task, {
      ...options,
      client: new OpenRouterClient({apiKey: process.env.OPENROUTER_API_KEY, signal}),
    });
  },
  doctor: () => runDoctor({}),
  setup: () => runInit({}),
};

export interface AppProps {
  terminalWidth?: number;
  dependencies?: TuiDependencies;
  initialTask?: string;
  onExit?: () => void;
  advisorModels?: readonly string[];
}

function receiptLines(receipt: ConsultationReceipt): string[] {
  return Object.entries(receipt)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function routeFocuses(route: Route): string[] {
  if (route === 'Consult') return ['Navigation', 'Task', 'Context', 'Preset', 'Submit'];
  if (route === 'Compare') return ['Navigation', 'Task', 'Submit'];
  return ['Navigation'];
}

export function App({terminalWidth = process.stdout.columns ?? 80, dependencies = defaultDependencies, initialTask = '', onExit, advisorModels = ADVISOR_MODELS}: AppProps): React.JSX.Element {
  const {exit: exitInkApp} = useApp();
  const exit = onExit ?? exitInkApp;
  const [route, setRoute] = useState<Route>('Consult');
  const [navIndex, setNavIndex] = useState(0);
  const [focus, setFocus] = useState(0);
  const [task, setTask] = useState(initialTask);
  const [context, setContext] = useState('');
  const [sessionId] = useState(() => randomUUID());
  const [customModel, setCustomModel] = useState('');
  const [presetIndex, setPresetIndex] = useState(1);
  const [stage, setStage] = useState<Stage>('Idle');
  const [answer, setAnswer] = useState<string>();
  const [receipt, setReceipt] = useState<ConsultationReceipt>();
  const [error, setError] = useState<{message: string; action: string}>();
  const [doctor, setDoctor] = useState<DoctorResult>();
  const [setup, setSetup] = useState<CommandResult>();
  const [compare, setCompare] = useState<Array<{model: string; result?: ConsultationResult; error?: {message: string; action: string}}>>([]);
  const [help, setHelp] = useState(false);
  const [cancelledOnce, setCancelledOnce] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const presets: ConsultationPreset[] = ['fast', 'balanced', 'best', 'custom'];
  const custom = presets[presetIndex] === 'custom';
  const focuses = route === 'Consult' && custom ? ['Navigation', 'Task', 'Context', 'Preset', 'Model', 'Submit'] : routeFocuses(route);
  const focusName = focuses[focus] ?? 'Navigation';
  const selectedRoute = ROUTES[navIndex] ?? 'Consult';
  const compact = terminalWidth < 80;

  const requestInput = useMemo((): ConsultInput => ({
    task,
    ...(context ? {context} : {}),
    preset: presets[presetIndex],
    sessionId,
    ...(custom ? {model: customModel.trim()} : {}),
  }), [context, custom, customModel, presetIndex, sessionId, task]);

  const clearOutcome = () => {
    setAnswer(undefined); setError(undefined); setCompare([]); setStage('Idle'); setCancelledOnce(false);
  };

  const submitConsult = async () => {
    if (request.current) return;
    if (custom && customModel.trim().length === 0) {
      clearOutcome();
      setError({message: 'Model ID is required for Custom.', action: 'Enter an OpenRouter model ID and try again.'});
      setStage('Error');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    clearOutcome();
    setStage('Routing request');
    try {
      await Promise.resolve();
      setStage('Requesting advisors');
      const result = await dependencies.consult(requestInput, controller.signal);
      setAnswer(result.answer);
      setReceipt(result.receipt);
      setStage('Response received');
    } catch (caught) {
      setError(errorDetails(caught));
      setStage(controller.signal.aborted ? 'Cancelled' : 'Error');
    } finally {
      if (request.current === controller) request.current = undefined;
    }
  };

  const submitCompare = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    clearOutcome();
    setStage('Routing request');
    const models = advisorModels.filter(model => model !== 'openrouter/auto').slice(0, 2);
    try {
      await Promise.resolve();
      setStage('Requesting advisors');
      const settled = await Promise.allSettled(models.map(model => dependencies.consult({
        ...requestInput, model, preset: 'custom', excludedModels: ['openrouter/auto'],
      }, controller.signal)));
      const outcomes = settled.map((outcome, index) => outcome.status === 'fulfilled'
        ? {model: models[index]!, result: outcome.value}
        : {model: models[index]!, error: errorDetails(outcome.reason)});
      setCompare(outcomes);
      const firstSuccess = outcomes.find(outcome => outcome.result)?.result;
      if (firstSuccess) setReceipt(firstSuccess.receipt);
      setStage(controller.signal.aborted ? 'Cancelled' : 'Response received');
    } finally {
      if (request.current === controller) request.current = undefined;
    }
  };

  const activateRoute = (next: Route) => {
    setRoute(next); setNavIndex(ROUTES.indexOf(next)); setFocus(0); setHelp(false); clearOutcome();
    if (next === 'Doctor') {
      void dependencies.doctor().then(setDoctor).catch(caught => setError(errorDetails(caught)));
    }
    if (next === 'Setup') {
      void dependencies.setup().then(setSetup).catch(caught => setError(errorDetails(caught)));
    }
  };

  useInput((input, key) => {
    const ctrlC = input === '\u0003' || (key.ctrl && input.toLowerCase() === 'c');
    if (ctrlC) {
      if (cancelledOnce) { exit(); return; }
      if (request.current) {
        request.current.abort();
        setCancelledOnce(true);
        setStage('Cancelled');
      } else {
        exit();
      }
      return;
    }
    if (input === '?') { setHelp(value => !value); return; }
    if (key.escape) { setHelp(false); setFocus(0); return; }
    if (input === 'q' && focus === 0) { exit(); return; }
    if (key.tab) {
      const direction = key.shift ? -1 : 1;
      setFocus(value => (value + direction + focuses.length) % focuses.length);
      return;
    }
    if (focus === 0 && (key.downArrow || key.rightArrow)) {
      setNavIndex(value => (value + 1) % ROUTES.length); return;
    }
    if (focus === 0 && (key.upArrow || key.leftArrow)) {
      setNavIndex(value => (value - 1 + ROUTES.length) % ROUTES.length); return;
    }
    if (route === 'Consult' && focus === 3 && (key.leftArrow || key.downArrow)) {
      setPresetIndex(value => (value - 1 + presets.length) % presets.length); return;
    }
    if (route === 'Consult' && focus === 3 && (key.rightArrow || key.upArrow)) {
      setPresetIndex(value => (value + 1) % presets.length); return;
    }
    if (key.return) {
      if (focus === 0) activateRoute(selectedRoute);
      else if (focus === focuses.length - 1) void (route === 'Compare' ? submitCompare() : submitConsult());
    }
  });

  const panel = () => {
    if (route === 'Consult') return <Box flexDirection="column" gap={1}>
      <Text>Consult · OpenRouter Auto · {presets[presetIndex]![0]!.toUpperCase()}{presets[presetIndex]!.slice(1)}</Text>
      <TextArea label="Task" value={task} active={focus === 1} onChange={setTask} onSubmit={() => setFocus(2)}/>
      <TextArea label="Context (optional)" value={context} active={focus === 2} onChange={setContext} onSubmit={() => setFocus(3)}/>
      <Text color={focus === 3 ? theme.accent : undefined}>{focus === 3 ? '› ' : '  '}Preset: {presets[presetIndex]}</Text>
      {custom ? <TextArea label="Model ID" value={customModel} active={focus === 4} onChange={setCustomModel} onSubmit={() => setFocus(5)}/> : null}
      <Text color={focus === focuses.length - 1 ? theme.accent : undefined}>{focus === focuses.length - 1 ? '› ' : '  '}Submit consultation</Text>
      {answer ? <Text color={theme.success}>Answer: {answer}</Text> : null}
    </Box>;
    if (route === 'Compare') return <Box flexDirection="column" gap={1}>
      <Text>Compare two advisors · routing route excluded: openrouter/auto</Text>
      <TextArea label="Task" value={task} active={focus === 1} onChange={setTask} onSubmit={() => setFocus(2)}/>
      <Text color={focus === 2 ? theme.accent : undefined}>{focus === 2 ? '› ' : '  '}Compare advisors</Text>
      {compare.length > 0 ? <Text>Compare results</Text> : null}
      {compare.map(outcome => <Box key={outcome.model} flexDirection="column"><Text>{outcome.model}: {outcome.result ? `Success: ${outcome.result.answer}` : `Failed: ${outcome.error?.message}`}</Text>{outcome.result?.receipt.costUsd !== undefined ? <Text>costUsd: {outcome.result.receipt.costUsd}</Text> : null}{outcome.error ? <Text color={theme.error}>{outcome.error.action}</Text> : null}</Box>)}
    </Box>;
    if (route === 'Doctor') return <Box flexDirection="column"><Text>Environment checks</Text>{doctor ? Object.entries(doctor.checks).map(([name, check]) => <Text key={name}>{name}: {check.status}{check.value ? `: ${check.value}` : check.action ? `: ${check.action}` : ''}</Text>) : <Text>Request stage: Routing request</Text>}</Box>;
    if (route === 'Setup') return <Box flexDirection="column"><Text>Setup</Text>{setup ? <><Text>{setup.environment.variable}</Text><Text>{setup.environment.exportCommand}</Text><Text>Next: {setup.nextCommand}</Text></> : <Text>Request stage: Routing request</Text>}</Box>;
    return <Box flexDirection="column"><Text>Last Receipt</Text>{receipt ? receiptLines(receipt).map(line => <Text key={line}>{line}</Text>) : <Text>No receipt yet</Text>}</Box>;
  };

  return <Box flexDirection="column">
    {compact ? <Text color={theme.accent}>Route: {route} · Focus: {focusName}</Text> : <Box><Box width={22} flexDirection="column"><Text>Navigation rail</Text>{ROUTES.map((name, index) => <Text key={name} color={index === navIndex ? theme.accent : undefined}>{index === navIndex ? '› ' : '  '}{name}</Text>)}</Box><Box flexDirection="column">{panel()}</Box></Box>}
    {compact ? panel() : null}
    <Text>Selected route: {selectedRoute} · Focus: {focusName} · Request stage: {stage}</Text>
    {error ? <Text color={theme.error}>Error: {error.message} Action: {error.action}</Text> : null}
    {route !== 'Last Receipt' && receipt ? <Box flexDirection="column"><Text>Receipt</Text>{receiptLines(receipt).map(line => <Text key={line}>{line}</Text>)}</Box> : null}
    {help ? <Text>Keyboard help · Tab/Shift+Tab focus · arrows choose · Enter confirm · Esc back · Ctrl+C cancel then exit · q exit</Text> : null}
    <Text color={theme.muted}>Tab focus · arrows menus/presets · Enter submit · ? help · q exit</Text>
  </Box>;
}
