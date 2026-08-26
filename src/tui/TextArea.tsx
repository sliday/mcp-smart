import React from 'react';
import {Box, Text, useInput} from 'ink';
import {sanitizeTerminalText} from '../terminal.js';

export interface TextAreaProps {
  label: string;
  value: string;
  active?: boolean;
  maxVisibleLines?: number;
  maxVisibleColumns?: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function characterWidth(character: string): number {
  if (/\p{Mark}/u.test(character)) return 0;
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f || codePoint === 0x2329 || codePoint === 0x232a ||
    codePoint >= 0x2e80 && codePoint <= 0xa4cf ||
    codePoint >= 0xac00 && codePoint <= 0xd7a3 ||
    codePoint >= 0xf900 && codePoint <= 0xfaff ||
    codePoint >= 0xfe10 && codePoint <= 0xfe6f ||
    codePoint >= 0xff00 && codePoint <= 0xff60 ||
    codePoint >= 0x1f300
  ) ? 2 : 1;
}

function tailWithinColumns(value: string, columns: number): string {
  const characters = [...value];
  if (characters.reduce((sum, character) => sum + characterWidth(character), 0) <= columns) return value;
  const visible: string[] = [];
  let width = 1;
  for (let index = characters.length - 1; index >= 0; index--) {
    const character = characters[index]!;
    const nextWidth = width + characterWidth(character);
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
      onChange(value.slice(0, -1));
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
