import { Box, Text, useInput } from 'ink';
import { theme } from '../styles/theme.js';

export interface ConfirmPromptProps {
  prompt: string;
  onAnswer: (answer: boolean | null) => void;
}

// Phase 8 hybrid confirmation. Mounted by ChatScreen while useChat's send()
// is suspended on an 'ask' decision. Only reacts to y/n/esc — never mid-stream,
// because it only ever renders BEFORE a stream starts.
export function ConfirmPrompt({ prompt, onAnswer }: ConfirmPromptProps): JSX.Element {
  useInput((input, key) => {
    if (key.escape) {
      onAnswer(null);
      return;
    }
    const lower = input.toLowerCase();
    if (lower === 'y') {
      onAnswer(true);
      return;
    }
    if (lower === 'n') {
      onAnswer(false);
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.accent} bold>
        {'? '}
        {prompt}
      </Text>
      <Text color={theme.muted} dimColor>
        y = yes, still on this goal · n = no, new topic · esc = skip
      </Text>
    </Box>
  );
}