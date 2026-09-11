import { Box, Text } from 'ink';
import { useState } from 'react';
import { theme } from '../styles/theme.js';
import { PromptInput } from './prompt-input.js';
import { usePromptHistory } from '../hooks/usePromptHistory.js';

export interface InputProps {
  onSubmit: (text: string) => void;
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
  const { history, push } = usePromptHistory();

  const handleSubmit = (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    push(trimmed);
    setValue('');
    if (trimmed.startsWith('/')) {
      onCommand(trimmed.slice(1));
      return;
    }
    onSubmit(trimmed);
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
        <PromptInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          isEnabled={isEnabled}
          history={history}
        />
      </Box>
    </Box>
  );
}