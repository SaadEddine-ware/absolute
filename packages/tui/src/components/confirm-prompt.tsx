import { Box, Text, useInput } from 'ink';
import { theme } from '../styles/theme.js';

export interface ConfirmPromptProps {
  prompt: string;
  onAnswer: (answer: boolean | null) => void;
}

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
      <Text color={theme.primary}>
        {prompt}
      </Text>
      <Text color={theme.muted} dimColor>
        y = yes · n = no · esc = skip
      </Text>
    </Box>
  );
}
