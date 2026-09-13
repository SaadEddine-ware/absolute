import { Box, Text, useInput, useStdout } from 'ink';
import { useMemo, useState } from 'react';
import { theme } from '../styles/theme.js';
import type { Goal, AbsoluteDatabase } from '@absolute/core';
import { getGoalsBySession } from '@absolute/core';

interface GoalsScreenProps {
  db: AbsoluteDatabase | null;
  sessionId: string | null;
  overlayHeight?: number;
}

function goalStatusColor(status: string): string {
  switch (status) {
    case 'active': return theme.statusOk;
    case 'paused': return theme.statusWarn;
    case 'completed': return theme.muted;
    default: return theme.text;
  }
}

function levelIndent(level: string): string {
  switch (level) {
    case 'goal': return '';
    case 'sub_goal': return '  ';
    case 'task': return '    ';
    default: return '';
  }
}

export function GoalsScreen({ db, sessionId, overlayHeight = 0 }: GoalsScreenProps): JSX.Element {
  const { stdout } = useStdout();
  const rows = Math.max(6, (stdout.rows > 0 ? stdout.rows : 24) - overlayHeight);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const goals = useMemo(() => {
    if (!db || !sessionId) return [];
    return getGoalsBySession(db.db, sessionId, 100);
  }, [db, sessionId]);

  const activeGoals = goals.filter((g) => g.status === 'active');
  const pausedGoals = goals.filter((g) => g.status === 'paused');
  const completedGoals = goals.filter((g) => g.status === 'completed');

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(goals.length - 1, i + 1));
    }
  });

  if (goals.length === 0) {
    return (
      <Box flexDirection="column" height={rows} paddingX={1}>
        <Box marginBottom={1}>
          <Text color={theme.primary}>Goals</Text>
        </Box>
        <Text color={theme.muted}>No goals yet.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={theme.primary}>Goals</Text>
        <Text color={theme.muted} dimColor>{'  '}{activeGoals.length} active · {pausedGoals.length} paused · {completedGoals.length} done</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {goals.map((goal, i) => {
          const selected = i === selectedIndex;
          return (
            <Box key={goal.id} flexDirection="row">
              <Text color={selected ? theme.primary : goalStatusColor(goal.status)}>
                {levelIndent(goal.level)}
                {selected ? '\u203a ' : '  '}
              </Text>
              <Text
                color={selected ? theme.text : theme.muted}
              >
                {goal.description.length > 50
                  ? goal.description.slice(0, 48) + '..'
                  : goal.description}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Text color={theme.muted} dimColor>
        q back · enter details
      </Text>
    </Box>
  );
}
