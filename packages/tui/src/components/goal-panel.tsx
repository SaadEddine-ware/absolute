import { Box, Text } from 'ink';
import { theme } from '../styles/theme.js';
import type { Goal } from '@absolute/core';

interface GoalPanelProps {
  goals: Goal[];
  activeGoal: Goal | null;
}

function goalStatusColor(status: string): string {
  switch (status) {
    case 'active': return theme.statusOk;
    case 'paused': return theme.statusWarn;
    case 'completed': return theme.muted;
    default: return theme.text;
  }
}

function goalLevelPrefix(level: string): string {
  switch (level) {
    case 'goal': return '';
    case 'sub_goal': return '  ';
    case 'task': return '    ';
    default: return '';
  }
}

export function GoalPanel({ goals, activeGoal }: GoalPanelProps): JSX.Element {
  const activeGoals = goals.filter((g) => g.status === 'active');
  const pausedGoals = goals.filter((g) => g.status === 'paused');
  const completedGoals = goals.filter((g) => g.status === 'completed');

  return (
    <Box flexDirection="column" gap={1}>
      <Text color={theme.primary}>
        goals
      </Text>

      {goals.length === 0 && (
        <Box>
          <Text color={theme.muted}>No goals yet</Text>
        </Box>
      )}

      {activeGoals.length > 0 && (
        <Box flexDirection="column">
          <Text color={theme.muted}>active</Text>
          {activeGoals.map((g) => (
            <Box key={g.id}>
              <Text color={goalLevelPrefix(g.level)} />
              <Text
                color={activeGoal?.id === g.id ? theme.primary : theme.text}
              >
                {activeGoal?.id === g.id ? '\u203a ' : '  '}
                {g.description.length > 24
                  ? g.description.slice(0, 22) + '..'
                  : g.description}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {pausedGoals.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.muted}>paused</Text>
          {pausedGoals.map((g) => (
            <Box key={g.id}>
              <Text color={theme.muted}>
                {'  '}{g.description.length > 22
                  ? g.description.slice(0, 20) + '..'
                  : g.description}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {completedGoals.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.muted}>done</Text>
          {completedGoals.slice(0, 3).map((g) => (
            <Box key={g.id}>
              <Text color={theme.muted} dimColor>
                {'  '}{g.description.length > 22
                  ? g.description.slice(0, 20) + '..'
                  : g.description}
              </Text>
            </Box>
          ))}
          {completedGoals.length > 3 && (
            <Text color={theme.muted} dimColor>
              {'  '}+{completedGoals.length - 3}
            </Text>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={theme.muted} dimColor>
          {activeGoals.length} active · {pausedGoals.length} paused · {completedGoals.length} done
        </Text>
      </Box>
    </Box>
  );
}
