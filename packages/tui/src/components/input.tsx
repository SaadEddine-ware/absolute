import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { theme } from '../styles/theme.js';

export interface InputProps {
  onSubmit: (value: string) => void;
  onCommand: (command: string) => void;
  isEnabled?: boolean;
  placeholder?: string;
  thinking?: boolean;
}

const PREFIX = '>';

export function Input({
  onSubmit,
  onCommand,
  isEnabled = true,
  placeholder = 'Type a message. /help for commands.',
  thinking = false,
}: InputProps): JSX.Element {
  const [value, setValue] = useState('');
  const { exit } = useApp();

  // Ctrl+D and Ctrl+C exit the app cleanly (Ink restores the terminal).
  useInput((input, key) => {
    if (key.ctrl && (input === 'c' || input === 'd')) {
      exit();
    }
  });

  const handleSubmit = (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('/')) {
      onCommand(trimmed.slice(1));
      setValue('');
      return;
    }
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.muted} dimColor>
        {thinking ? '… thinking' : placeholder}
      </Text>
      <Box flexDirection="row">
        <Text color={theme.accent} bold>
          {PREFIX}{' '}
        </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          focus={isEnabled}
        />
      </Box>
    </Box>
  );
}