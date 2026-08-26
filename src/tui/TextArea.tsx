import React from 'react';
import {Box, Text, useInput} from 'ink';
import {sanitizeTerminalText, terminalGraphemes, terminalGraphemeWidth, terminalTextWidth, withoutLastTerminalGrapheme} from '../terminal.js';

export interface TextAreaProps {
  label: string;
  value: string;
  active?: boolean;
  maxVisibleLines?: number;
  maxVisibleColumns?: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function tailWithinColumns(value: string, columns: number): string {
  const characters = terminalGraphemes(value);
  if (terminalTextWidth(value) <= columns) return value;
  const visible: string[] = [];
  let width = 1;
  for (let index = characters.length - 1; index >= 0; index--) {
    const character = characters[index]!;
    const nextWidth = width + terminalGraphemeWidth(character);
    if (nextWidth > columns) break;
    visible.unshift(character);
    width = nextWidth;
  }
  return `…${visible.join('')}`;
}

export function TextArea({label, value, active = false, maxVisibleLines, maxVisibleColumns, onChange, onSubmit}: TextAreaProps): React.JSX.Element {
  useInput((input, key) => {
    if (key.ctrl || key.escape || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
    if (key.return) {
      if (key.shift) onChange(`${value}\n`);
      else onSubmit();
      return;
    }
    if (key.backspace || key.delete) {
      onChange(withoutLastTerminalGrapheme(value));
      return;
    }
    if (input.length > 0 && input !== '\u0003') onChange(`${value}${input}`);
  }, {isActive: active});

  const sanitizedValue = sanitizeTerminalText(value);
  const lines = sanitizedValue.split('\n');
  const boundedLineCount = maxVisibleLines === undefined ? lines.length : Math.max(1, maxVisibleLines);
  const hiddenLines = Math.max(0, lines.length - boundedLineCount);
  const visibleLines = hiddenLines === 0
    ? lines
    : boundedLineCount === 1
      ? [`… ${hiddenLines} earlier lines · ${lines.at(-1)}`]
      : [`… ${hiddenLines + 1} earlier lines`, ...lines.slice(-(boundedLineCount - 1))];
  const visibleValue = visibleLines
    .map(line => maxVisibleColumns === undefined ? line : tailWithinColumns(line, Math.max(8, maxVisibleColumns)))
    .join('\n');

  return <Box flexDirection="column"><Text color={active ? 'cyan' : undefined}>{active ? '› ' : '  '}{sanitizeTerminalText(label)}</Text><Text>{value ? visibleValue : '  (empty)'}</Text></Box>;
}
