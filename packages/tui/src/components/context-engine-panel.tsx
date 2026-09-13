import { Box, Text } from 'ink';
import { theme } from '../styles/theme.js';
import type { ContextEngineState } from '../hooks/useContextEngine.js';

interface ContextEnginePanelProps {
  state: ContextEngineState;
  compact?: boolean;
}

function decisionColor(decision: string): string {
  switch (decision) {
    case 'continue': return theme.decisionContinue;
    case 'ask': return theme.decisionAsk;
    case 'switch': return theme.decisionSwitch;
    default: return theme.muted;
  }
}

function fmt(n: number): string {
  return n.toFixed(2);
}

export function ContextEnginePanel({ state, compact = false }: ContextEnginePanelProps): JSX.Element {
  const { goal, similarity, threshold, decision, goalEvaluated, detecting } = state;
  const goalDesc = goal?.description ?? '(none)';
  const truncatedGoal = goalDesc.length > 22 ? goalDesc.slice(0, 20) + '..' : goalDesc;

  if (compact) {
    return (
      <Box flexDirection="column" gap={0}>
        <Text color={theme.primary}>context</Text>
        <Text color={theme.text}>
          {truncatedGoal}
        </Text>
        <Text color={theme.muted}>
          {fmt(similarity)} / {fmt(threshold)}
        </Text>
        <Text color={decisionColor(decision)}>
          {detecting ? '...' : decision}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={0}>
      <Text color={theme.primary}>
        context
      </Text>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.muted}>goal</Text>
        <Text color={theme.text}>
          {goalEvaluated ? truncatedGoal : '(none)'}
        </Text>
        {goal && (
          <Text color={theme.muted} dimColor>
            {goal.level} · {goal.status}
          </Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.muted}>similarity</Text>
        <Text color={decisionColor(decision)}>
          {fmt(similarity)}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.muted}>threshold</Text>
        <Text color={theme.muted}>
          {fmt(threshold)}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.muted}>decision</Text>
        <Text color={decisionColor(decision)}>
          {detecting ? '...' : decision}
        </Text>
      </Box>
    </Box>
  );
}
