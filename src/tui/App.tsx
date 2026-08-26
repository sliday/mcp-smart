import {randomUUID} from 'node:crypto';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import {runAsk} from '../commands/ask.js';
import {runDoctor, type DoctorResult} from '../commands/doctor.js';
import {runInit, type CommandResult} from '../commands/init.js';
import type {ConsultInput, ConsultationPreset, ConsultationReceipt, ConsultationResult} from '../contracts.js';
import {sanitizeTerminalText} from '../terminal.js';
import {TextArea} from './TextArea.js';
import {theme} from './theme.js';

const ROUTES = ['Consult', 'Compare', 'Doctor', 'Setup', 'Last Receipt'] as const;
type Route = typeof ROUTES[number];
type Stage = 'Idle' | 'Routing request' | 'Requesting advisors' | 'Response received' | 'Cancelled' | 'Error';

const ADVISOR_MODELS = ['anthropic/claude-sonnet-4.5', 'openai/gpt-5', 'google/gemini-3.1-pro-preview', 'x-ai/grok-4.6'] as const;
const MIN_COMPARE_ADVISORS = 2;
const MAX_COMPARE_ADVISORS = 4;
const MAX_SHARED_TERMS = 8;
const MAX_SHARED_TERM_CHARACTERS = 24;
const MAX_SHARED_TERMS_CHARACTERS = 120;
type CompareOutcome = {model: string; result?: ConsultationResult; error?: {message: string; action: string}};
type CompareDigest = {sharedTerms: string; emphases: Array<{model: string; summary: string}>; nextStep: string};
type TextViewport = {lines: string[]; page: number; pages: number};

export interface TuiDependencies {
  consult: (input: ConsultInput, signal: AbortSignal) => Promise<ConsultationResult>;
  doctor: () => Promise<DoctorResult>;
  setup: () => Promise<CommandResult>;
}

function errorDetails(error: unknown): {message: string; action: string} {
  const details = typeof error === 'object' && error !== null && 'details' in error
    ? (error as {details?: {message?: string; action?: string}}).details : undefined;
  return {
    message: sanitizeTerminalText(details?.message ?? (error instanceof Error ? error.message : 'Request failed.')),
    action: sanitizeTerminalText(details?.action ?? 'Check the request and try again.'),
  };
}

const defaultDependencies: TuiDependencies = {
  async consult(input, signal) {
    const {task, ...options} = input;
    return runAsk(task, {...options, signal});
  },
  doctor: () => runDoctor({}),
  setup: () => runInit({}),
};

export interface AppProps {
  terminalWidth?: number;
  terminalHeight?: number;
  dependencies?: TuiDependencies;
  initialTask?: string;
  onExit?: () => void;
  onForceExit?: () => void;
  advisorModels?: readonly string[];
}

function receiptLines(receipt: ConsultationReceipt): string[] {
  return Object.entries(receipt)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${sanitizeTerminalText(key)}: ${sanitizeTerminalText(String(value))}`);
}

function routeFocuses(route: Route): string[] {
  if (route === 'Consult') return ['Navigation', 'Task', 'Context', 'Preset', 'Submit'];
  if (route === 'Compare') return ['Navigation', 'Task', 'Advisors', 'Submit'];
  return ['Navigation'];
}

function directAdvisorModels(models: readonly string[]): string[] {
  return [...new Set(models.filter(model => model !== 'openrouter/auto'))].slice(0, MAX_COMPARE_ADVISORS);
}

function firstSentence(answer: string): string {
  const normalized = sanitizeTerminalText(answer).trim().replace(/\s+/g, ' ');
  const end = normalized.search(/[.!?](?:\s|$)/);
  const sentence = end >= 0 ? normalized.slice(0, end + 1) : normalized;
  return sentence.length > 96 ? `${sentence.slice(0, 93)}...` : sentence;
}

function boundedTerm(term: string): string {
  const characters = [...term];
  return characters.length > MAX_SHARED_TERM_CHARACTERS
    ? `${characters.slice(0, MAX_SHARED_TERM_CHARACTERS - 3).join('')}...`
    : term;
}

function sharedTermsText(shared: string[]): string {
  const visible: string[] = [];
  for (const term of shared.slice(0, MAX_SHARED_TERMS)) {
    const bounded = boundedTerm(term);
    const candidate = [...visible, bounded].join(', ');
    if (candidate.length > MAX_SHARED_TERMS_CHARACTERS && visible.length > 0) break;
    visible.push(bounded);
  }
  const hidden = shared.length - visible.length;
  return `${visible.join(', ')}${hidden > 0 ? ` (+${hidden} more)` : ''}.`;
}

function textViewport(text: string, width: number, height: number, requestedPage: number): TextViewport {
  const lineWidth = Math.max(20, width);
  const lines = sanitizeTerminalText(text).split('\n').flatMap(line => {
    const characters = [...line];
    if (characters.length === 0) return [''];
    const wrapped: string[] = [];
    for (let offset = 0; offset < characters.length; offset += lineWidth) {
      wrapped.push(characters.slice(offset, offset + lineWidth).join(''));
    }
    return wrapped;
  });
  const pageSize = Math.max(3, height);
  const pages = Math.max(1, Math.ceil(lines.length / pageSize));
  const page = Math.min(Math.max(0, requestedPage), pages - 1);
  return {lines: lines.slice(page * pageSize, (page + 1) * pageSize), page, pages};
}

function compareDigest(outcomes: CompareOutcome[]): CompareDigest | undefined {
  const successes = outcomes.filter((outcome): outcome is CompareOutcome & {result: ConsultationResult} => outcome.result !== undefined);
  if (successes.length === 0) return undefined;
  const emphases = successes.map(outcome => ({model: outcome.model, summary: firstSentence(outcome.result.answer)}));
  if (successes.length === 1) return {sharedTerms: 'Not enough successful answers to measure overlap.', emphases, nextStep: 'Review the available advisor summary and retry failed advisors.'};
  const terms = (answer: string) => sanitizeTerminalText(answer).toLowerCase().match(/\p{L}[\p{L}\p{N}'’-]*/gu)?.filter(term => term.length > 3 && !['that', 'then', 'this', 'with'].includes(term)) ?? [];
  const termSets = successes.map(outcome => new Set(terms(outcome.result.answer)));
  const shared = [...termSets[0]!].filter(term => termSets.slice(1).every(set => set.has(term)));
  return {
    sharedTerms: shared.length > 0 ? sharedTermsText(shared) : 'No lexical overlap across the successful answers.',
    emphases,
    nextStep: shared.length > 0 ? "Review the shared terms against each advisor's emphasis." : 'Review the advisor summaries and investigate different emphases before deciding.',
  };
}

export function App({terminalWidth = process.stdout.columns ?? 80, terminalHeight = process.stdout.rows ?? 24, dependencies = defaultDependencies, initialTask = '', onExit, onForceExit, advisorModels = ADVISOR_MODELS}: AppProps): React.JSX.Element {
  const {exit: exitInkApp} = useApp();
  const exit = onExit ?? exitInkApp;
  const forceExit = onForceExit ?? exit;
  const availableAdvisorModels = directAdvisorModels(advisorModels);
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
  const [lastReceipt, setLastReceipt] = useState<ConsultationReceipt>();
  const [error, setError] = useState<{message: string; action: string}>();
  const [doctor, setDoctor] = useState<DoctorResult>();
  const [setup, setSetup] = useState<CommandResult>();
  const [compare, setCompare] = useState<CompareOutcome[]>([]);
  const [selectedAdvisorModels, setSelectedAdvisorModels] = useState(() => availableAdvisorModels.slice(0, MIN_COMPARE_ADVISORS));
  const [advisorCursor, setAdvisorCursor] = useState(0);
  const [showCompareAnswers, setShowCompareAnswers] = useState(false);
  const [help, setHelp] = useState(false);
  const [outputPage, setOutputPage] = useState(0);
  const cancelledOnce = useRef(false);
  const request = useRef<AbortController | undefined>(undefined);
  const routeGeneration = useRef(0);
  useEffect(() => () => {
    request.current?.abort();
    routeGeneration.current++;
  }, []);
  const presets: ConsultationPreset[] = ['fast', 'balanced', 'best', 'custom'];
  const custom = presets[presetIndex] === 'custom';
  const focuses = route === 'Consult' && custom ? ['Navigation', 'Task', 'Context', 'Preset', 'Model', 'Submit'] : routeFocuses(route);
  const focusName = focuses[focus] ?? 'Navigation';
  const selectedRoute = ROUTES[navIndex] ?? 'Consult';
  const compact = terminalWidth < 80;
  const editorCount = route === 'Consult' ? (custom ? 3 : 2) : route === 'Compare' ? 1 : 0;
  const editorPreviewLines = Math.max(1, Math.min(6, Math.floor((terminalHeight - 10) / Math.max(1, editorCount))));
  const digest = useMemo(() => compareDigest(compare), [compare]);
  const hasCompareSuccess = compare.some(outcome => outcome.result !== undefined);
  const requestActive = stage === 'Routing request' || stage === 'Requesting advisors';
  const outputWidth = terminalWidth - (compact ? 2 : 24);
  const outputHeight = terminalHeight - 7;
  const compareAnswerText = useMemo(() => showCompareAnswers ? compare
    .filter((outcome): outcome is CompareOutcome & {result: ConsultationResult} => outcome.result !== undefined)
    .map(outcome => `${sanitizeTerminalText(outcome.model)}: ${sanitizeTerminalText(outcome.result.answer)}`)
    .join('\n\n') : '', [compare, showCompareAnswers]);
  const consultResultText = useMemo(() => answer === undefined ? undefined : [
    'Answer',
    sanitizeTerminalText(answer),
    ...(receipt ? ['', 'Receipt', ...receiptLines(receipt)] : []),
  ].join('\n'), [answer, receipt]);
  const compareResultText = useMemo(() => compare.length === 0 ? undefined : [
    ...compare.map(outcome => outcome.result
      ? `✓ ${sanitizeTerminalText(outcome.model)} · Success${outcome.result.receipt.costUsd !== undefined ? ` · costUsd: ${outcome.result.receipt.costUsd}` : ''}`
      : `✗ ${sanitizeTerminalText(outcome.model)} · Failed: ${outcome.error?.message} · Action: ${outcome.error?.action}`),
    ...(hasCompareSuccess ? [`Answers: ${showCompareAnswers ? 'expanded · a to hide' : 'collapsed · a to show'}`] : []),
    ...(digest ? [
      `Shared terms: ${digest.sharedTerms}`,
      'Different emphases:',
      ...digest.emphases.map(emphasis => `${sanitizeTerminalText(emphasis.model)}: ${emphasis.summary}`),
      `Suggested next step: ${digest.nextStep}`,
    ] : []),
    ...(hasCompareSuccess && showCompareAnswers ? ['', 'Full advisor answers', compareAnswerText] : []),
  ].join('\n'), [compare, compareAnswerText, digest, hasCompareSuccess, showCompareAnswers]);
  const visibleOutput = route === 'Consult' ? consultResultText : route === 'Compare' ? compareResultText : undefined;
  const viewport = useMemo(() => visibleOutput === undefined
    ? undefined
    : textViewport(visibleOutput, outputWidth, outputHeight, outputPage),
  [outputHeight, outputPage, outputWidth, visibleOutput]);

  const requestInput = useMemo((): ConsultInput => ({
    task,
    ...(context ? {context} : {}),
    preset: presets[presetIndex],
    sessionId,
    ...(custom ? {model: customModel.trim()} : {}),
  }), [context, custom, customModel, presetIndex, sessionId, task]);

  const clearOutcome = () => {
    setAnswer(undefined); setError(undefined); setCompare([]); setStage('Idle'); cancelledOnce.current = false; setShowCompareAnswers(false); setOutputPage(0);
  };

  const submitConsult = async () => {
    if (request.current) return;
    setReceipt(undefined);
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
      if (request.current !== controller) return;
      setAnswer(result.answer);
      setReceipt(result.receipt);
      setLastReceipt(result.receipt);
      setStage('Response received');
    } catch (caught) {
      if (request.current !== controller) return;
      setError(errorDetails(caught));
      setStage(controller.signal.aborted ? 'Cancelled' : 'Error');
    } finally {
      if (request.current === controller) request.current = undefined;
    }
  };

  const submitCompare = async () => {
    if (request.current) return;
    setReceipt(undefined);
    const controller = new AbortController();
    request.current = controller;
    clearOutcome();
    setStage('Routing request');
    const models = availableAdvisorModels.filter(model => selectedAdvisorModels.includes(model));
    try {
      await Promise.resolve();
      setStage('Requesting advisors');
      const settled = await Promise.allSettled(models.map(model => dependencies.consult({
        ...requestInput, model, preset: 'custom', excludedModels: ['openrouter/auto'],
      }, controller.signal)));
      if (request.current !== controller) return;
      const outcomes = settled.map((outcome, index) => outcome.status === 'fulfilled'
        ? {model: models[index]!, result: outcome.value}
        : {model: models[index]!, error: errorDetails(outcome.reason)});
      setCompare(outcomes);
      const firstSuccess = outcomes.find(outcome => outcome.result)?.result;
      if (firstSuccess) {
        setReceipt(firstSuccess.receipt);
        setLastReceipt(firstSuccess.receipt);
      }
      setStage(controller.signal.aborted ? 'Cancelled' : firstSuccess ? 'Response received' : 'Error');
    } finally {
      if (request.current === controller) request.current = undefined;
    }
  };

  const activateRoute = (next: Route) => {
    const generation = ++routeGeneration.current;
    request.current?.abort();
    request.current = undefined;
    setRoute(next); setNavIndex(ROUTES.indexOf(next)); setFocus(0); setHelp(false); clearOutcome(); setReceipt(undefined);
    if (next === 'Doctor') {
      setDoctor(undefined);
      setStage('Routing request');
      void dependencies.doctor().then(result => {
        if (routeGeneration.current !== generation) return;
        setDoctor(result); setStage('Response received');
      }).catch(caught => {
        if (routeGeneration.current !== generation) return;
        setError(errorDetails(caught)); setStage('Error');
      });
    }
    if (next === 'Setup') {
      setSetup(undefined);
      setStage('Routing request');
      void dependencies.setup().then(result => {
        if (routeGeneration.current !== generation) return;
        setSetup(result); setStage('Response received');
      }).catch(caught => {
        if (routeGeneration.current !== generation) return;
        setError(errorDetails(caught)); setStage('Error');
      });
    }
  };

  useInput((input, key) => {
    const ctrlC = input === '\u0003' || (key.ctrl && input.toLowerCase() === 'c');
    if (ctrlC) {
      if (cancelledOnce.current) { forceExit(); return; }
      if (request.current) {
        request.current.abort();
        cancelledOnce.current = true;
        setStage('Cancelled');
      } else {
        routeGeneration.current++;
        exit();
      }
      return;
    }
    const textEntryFocused = route === 'Compare'
      ? focus === 1
      : route === 'Consult' && (focus === 1 || focus === 2 || custom && focus === 4);
    if (input === '?' && !textEntryFocused) { setHelp(value => !value); return; }
    if (input === 'a' && route === 'Compare' && hasCompareSuccess && focus !== 1) { setOutputPage(0); setShowCompareAnswers(value => !value); return; }
    if (viewport && key.pageUp) { setOutputPage(value => Math.max(0, value - 1)); return; }
    if (viewport && key.pageDown) { setOutputPage(value => Math.min(viewport.pages - 1, value + 1)); return; }
    if (viewport && key.home) { setOutputPage(0); return; }
    if (viewport && key.end) { setOutputPage(viewport.pages - 1); return; }
    if (viewport && key.escape) { clearOutcome(); setFocus(1); return; }
    if (key.escape) { setHelp(false); setFocus(0); return; }
    if (input === 'q' && (focus === 0 || viewport || route === 'Doctor' || route === 'Setup' || route === 'Last Receipt')) { request.current?.abort(); request.current = undefined; routeGeneration.current++; exit(); return; }
    if (requestActive && focus !== 0 && !key.tab) return;
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
    if (route === 'Compare' && focus === 2 && input === ' ') {
      const model = availableAdvisorModels[advisorCursor];
      if (!model) return;
      setSelectedAdvisorModels(value => value.includes(model)
        ? (value.length > MIN_COMPARE_ADVISORS ? value.filter(selected => selected !== model) : value)
        : (value.length < MAX_COMPARE_ADVISORS ? [...value, model] : value));
      return;
    }
    if (route === 'Compare' && focus === 2 && (key.leftArrow || key.upArrow)) {
      if (availableAdvisorModels.length > 0) setAdvisorCursor(value => (value - 1 + availableAdvisorModels.length) % availableAdvisorModels.length);
      return;
    }
    if (route === 'Compare' && focus === 2 && (key.rightArrow || key.downArrow)) {
      if (availableAdvisorModels.length > 0) setAdvisorCursor(value => (value + 1) % availableAdvisorModels.length);
      return;
    }
    if (key.return) {
      if (focus === 0) activateRoute(selectedRoute);
      else if (focus === focuses.length - 1) void (route === 'Compare' ? submitCompare() : submitConsult());
    }
  });

  const panel = () => {
    if (route === 'Consult' && viewport) return <Box flexDirection="column">
      <Text>Consult result · Enter rerun · Esc edit</Text>
      {viewport.lines.map((line, index) => <Text key={`${viewport.page}-${index}`} color={line === 'Answer' ? theme.success : undefined}>{line || ' '}</Text>)}
      {viewport.pages > 1 ? <Text>Result page {viewport.page + 1}/{viewport.pages} · PgUp/PgDn</Text> : null}
    </Box>;
    if (route === 'Consult') return <Box flexDirection="column" gap={terminalHeight < 16 ? 0 : 1}>
      <Text>Consult · {custom ? sanitizeTerminalText(customModel.trim() || 'direct model required') : 'OpenRouter Auto'} · {presets[presetIndex]![0]!.toUpperCase()}{presets[presetIndex]!.slice(1)}</Text>
      <TextArea label="Task" value={task} active={focus === 1 && !requestActive} maxVisibleLines={editorPreviewLines} maxVisibleColumns={outputWidth} onChange={setTask} onSubmit={() => setFocus(2)}/>
      <TextArea label="Context (optional)" value={context} active={focus === 2 && !requestActive} maxVisibleLines={editorPreviewLines} maxVisibleColumns={outputWidth} onChange={setContext} onSubmit={() => setFocus(3)}/>
      <Text color={focus === 3 ? theme.accent : undefined}>{focus === 3 ? '› ' : '  '}Preset: {presets[presetIndex]}</Text>
      {custom ? <TextArea label="Model ID" value={customModel} active={focus === 4 && !requestActive} maxVisibleLines={editorPreviewLines} maxVisibleColumns={outputWidth} onChange={setCustomModel} onSubmit={() => setFocus(5)}/> : null}
      <Text color={focus === focuses.length - 1 ? theme.accent : undefined}>{focus === focuses.length - 1 ? '› ' : '  '}Submit consultation</Text>
    </Box>;
    if (route === 'Compare' && viewport) return <Box flexDirection="column">
      <Text>Compare results · Enter rerun · Esc edit</Text>
      {viewport.lines.map((line, index) => <Text key={`${viewport.page}-${index}`}>{line || ' '}</Text>)}
      {viewport.pages > 1 ? <Text>Result page {viewport.page + 1}/{viewport.pages} · PgUp/PgDn</Text> : null}
    </Box>;
    if (route === 'Compare') return <Box flexDirection="column" gap={terminalHeight < 16 ? 0 : 1}>
      <Text>Compare advisors · routing route excluded: openrouter/auto</Text>
      <TextArea label="Task" value={task} active={focus === 1 && !requestActive} maxVisibleLines={editorPreviewLines} maxVisibleColumns={outputWidth} onChange={setTask} onSubmit={() => setFocus(2)}/>
      <Box flexDirection="column">
        <Text color={focus === 2 ? theme.accent : undefined}>Advisors · {selectedAdvisorModels.length} selected · Space toggles ({MIN_COMPARE_ADVISORS}-{MAX_COMPARE_ADVISORS})</Text>
        {availableAdvisorModels.map((model, index) => <Text key={model} color={focus === 2 && advisorCursor === index ? theme.accent : undefined}>{focus === 2 && advisorCursor === index ? '› ' : '  '}[{selectedAdvisorModels.includes(model) ? 'x' : ' '}] {sanitizeTerminalText(model)}</Text>)}
      </Box>
      <Text color={focus === 3 ? theme.accent : undefined}>{focus === 3 ? '› ' : '  '}Compare advisors</Text>
    </Box>;
    if (route === 'Doctor') return <Box flexDirection="column"><Text>Environment checks</Text>{doctor ? Object.entries(doctor.checks).map(([name, check]) => <Text key={name}>{sanitizeTerminalText(name)}: {check.status}{check.value ? `: ${sanitizeTerminalText(check.value)}` : check.action ? `: ${sanitizeTerminalText(check.action)}` : ''}</Text>) : stage === 'Routing request' ? <Text>Request stage: Routing request</Text> : null}</Box>;
    if (route === 'Setup') return <Box flexDirection="column"><Text>Setup</Text>{setup ? <><Text>{sanitizeTerminalText(setup.environment.variable)}</Text><Text>{sanitizeTerminalText(setup.environment.exportCommand)}</Text><Text>Next: {sanitizeTerminalText(setup.nextCommand)}</Text></> : stage === 'Routing request' ? <Text>Request stage: Routing request</Text> : null}</Box>;
    return <Box flexDirection="column"><Text>Last Receipt</Text>{lastReceipt ? receiptLines(lastReceipt).map(line => <Text key={line}>{line}</Text>) : <Text>No receipt yet</Text>}</Box>;
  };

  return <Box flexDirection="column">
    {compact ? <Text color={theme.accent}>Route: {route} · Focus: {focusName}</Text> : <Box><Box width={22} flexDirection="column"><Text>Navigation rail</Text>{ROUTES.map((name, index) => <Text key={name} color={index === navIndex ? theme.accent : undefined}>{index === navIndex ? '› ' : '  '}{name}</Text>)}</Box><Box flexDirection="column">{panel()}</Box></Box>}
    {compact ? panel() : null}
    <Text>Navigation target: {selectedRoute} · Focus: {focusName} · Request stage: {stage}</Text>
    {error ? <Text color={theme.error}>Error: {error.message} Action: {error.action}</Text> : null}
    {help ? <Text>Keyboard help · Tab/Shift+Tab focus · arrows choose · Space select advisor · {hasCompareSuccess ? 'a answers · ' : ''}PgUp/PgDn output · Enter confirm · Esc back · Ctrl+C cancel then exit · q exit</Text> : null}
    <Text color={theme.muted}>{route === 'Consult' && viewport ? 'PgUp/PgDn result · Enter rerun · Esc edit · q exit' : route === 'Consult' ? 'Tab focus · arrows preset · Enter submit · ? help · q exit' : route === 'Compare' && viewport ? `${hasCompareSuccess ? 'a answers · ' : ''}PgUp/PgDn result · Enter rerun · Esc edit · q exit` : route === 'Compare' ? 'Tab focus · arrows advisors · Space select · Enter submit · ? help · q exit' : 'arrows route · Enter open · ? help · q exit'}</Text>
  </Box>;
}
