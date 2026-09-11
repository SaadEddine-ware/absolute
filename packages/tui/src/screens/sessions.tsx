import { Box, Text, useInput, useStdout } from 'ink';
import { useState } from 'react';
import type { Session } from '@absolute/core';
import { theme } from '../styles/theme.js';

export interface SessionsScreenProps {
  sessions: Session[];
  currentSessionId: string | null;
  canDelete: (session: Session) => boolean;
  onSwitch: (id: string) => Promise<void>;
  onNew: () => Promise<void>;
  onDelete: (id: string) => Promise<boolean>;
  onBack: () => void;
  /** Vertical space reserved above the screen by an overlay. */
  overlayHeight?: number;
}

function truncate(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text;
}

export function SessionsScreen({
  sessions,
  currentSessionId,
  canDelete,
  onSwitch,
  onNew,
  onDelete,
  onBack,
  overlayHeight = 0,
}: SessionsScreenProps): JSX.Element {
  const { stdout } = useStdout();
  const rows = Math.max(6, (stdout.rows > 0 ? stdout.rows : 24) - overlayHeight);
  const width = stdout.columns > 0 ? stdout.columns - 28 : 60;

  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  useInput((input, key) => {
    if (overlayHeight > 0) return; // an overlay owns the terminal while open
    if (confirm) {
      if (input === 'y') {
        const target = confirm;
        setConfirm(null);
        void onDelete(target.id).then((removed) => {
          setNotice(removed ? `Deleted session "${target.title ?? target.id}".` : 'Delete failed.');
        });
      } else if (input === 'n' || key.escape) {
        setConfirm(null);
      }
      return;
    }

    if (key.upArrow) {
      setIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setIndex((i) => Math.min(sessions.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const target = sessions[index];
      if (target) {
        void onSwitch(target.id).then(() => onBack());
      }
      return;
    }
    if (input === 'n') {
      void onNew();
      return;
    }
    if (input === 'd') {
      const target = sessions[index];
      if (target && canDelete(target)) {
        setConfirm(target);
      } else if (target) {
        setNotice(`Cannot delete the active session. Switch first.`);
      }
      return;
    }
    if (input === 'r') {
      setNotice('Refreshed.');
      return;
    }
    if (input === 'q' || key.escape) {
      onBack();
      return;
    }
  });

  const listRows = Math.max(3, rows - 12);
  const start = Math.max(0, Math.min(index - Math.floor(listRows / 2), Math.max(0, sessions.length - listRows)));
  const visible = sessions.slice(start, start + listRows);

  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={theme.primary} bold>
          Sessions
        </Text>
        <Text color={theme.header}>
          {' '}
          — {sessions.length} total
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {sessions.length === 0 ? (
          <Text color={theme.muted} dimColor>
            {'  No sessions yet. Press [n] to start one.'}
          </Text>
        ) : (
          visible.map((s, i) => {
            const idx = start + i;
            const isCurrent = s.id === currentSessionId;
            const selected = idx === index;
            return (
              <Box key={s.id}>
                <Text color={selected ? theme.accent : theme.muted}>
                  {selected ? '>' : ' '}{' '}
                </Text>
                <Text color={isCurrent ? theme.statusOk : theme.text} bold={selected}>
                  {truncate(s.title ?? 'untitled', width - 26)}
                </Text>
                <Text color={theme.muted} dimColor>
                  {'  '}
                  {isCurrent ? '(active) ' : ''}
                  {new Date(s.created_at).toLocaleString().slice(0, 17)}
                  {'  '}
                  {s.id.slice(0, 8)}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {notice && (
        <Box>
          <Text color={theme.statusWarn}>{notice}</Text>
        </Box>
      )}
      {confirm && (
        <Box borderStyle="round" borderColor={theme.statusWarn} paddingX={1} marginBottom={1}>
          <Text color={theme.text}>
            Delete session "{truncate(confirm.title ?? confirm.id, 30)}" and all its memories?{' '}
            <Text color={theme.statusOk}>[y]</Text>
            {' '}
            <Text color={theme.statusErr}>[n]</Text>
            {'  esc cancels'}
          </Text>
        </Box>
      )}

      <Text color={theme.muted} dimColor>
        ↑/↓ select · enter open · n new · d delete · esc back
      </Text>
    </Box>
  );
}