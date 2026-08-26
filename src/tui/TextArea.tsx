import React from 'react';
import {Box, Text, useInput} from 'ink';

export interface TextAreaProps {
  label: string;
  value: string;
  active?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function TextArea({label, value, active = false, onChange, onSubmit}: TextAreaProps): React.JSX.Element {
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

  return <Box flexDirection="column"><Text color={active ? 'cyan' : undefined}>{active ? '› ' : '  '}{label}</Text><Text>{value || '  (empty)'}</Text></Box>;
}
