import { Box, Text, useInput, useStdout } from 'ink';
import { useMemo, useState } from 'react';
import { getMemoriesBySession, type AbsoluteDatabase, type Memory } from '@absolute/core';
import { theme } from '../styles/theme.js';

export interface MemoriesScreenProps {
  db: AbsoluteDatabase;
  sessionId: string | null;
  onBack: () => void;
  /** Vertical space reserved above the screen by an overlay. */
  overlayHeight?: number;
}

interface MemNode {
  memory: Memory;
  children: MemNode[];
}

function truncate(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text;
}

export function MemoriesScreen({ db, sessionId, onBack, overlayHeight = 0 }: MemoriesScreenProps): JSX.Element {
  const { stdout } = useStdout();
  const rows = Math.max(6, (stdout.rows > 0 ? stdout.rows : 24) - overlayHeight);
  const width = stdout.columns > 0 ? stdout.columns - 28 : 60;

  const roots = useMemo<MemNode[]>(() => {
    if (!db || !sessionId) return [];
    const all = getMemoriesBySession(db.db, sessionId, 500);
    const byParent = new Map<string | null, Memory[]>();
    for (const m of all) {
      const key = m.parent_id ?? null;
      const list = byParent.get(key) ?? [];
      list.push(m);
      byParent.set(key, list);
    }
    function build(key: string | null): MemNode[] {
      return (byParent.get(key) ?? []).map((m) => ({
        memory: m,
        children: build(m.id),
      }));
    }
    return build(null);
  }, [db, sessionId]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);

  const flat = useMemo<Array<{ node: MemNode; depth: number }>>(() => {
    const out: Array<{ node: MemNode; depth: number }> = [];
    const walk = (nodes: MemNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ node: n, depth });
        if (expanded.has(n.memory.id) && n.children.length > 0) {
          walk(n.children, depth + 1);
        }
      }
    };
    walk(roots, 0);
    return out;
  }, [roots, expanded]);

  useInput((input, key) => {
    if (overlayHeight > 0) return; // an overlay owns the terminal while open
    if (flat.length === 0) {
      if (input === 'q' || key.escape) onBack();
      return;
    }
    if (key.upArrow) {
      setIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setIndex((i) => Math.min(flat.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const row = flat[index];
      if (row && row.node.children.length > 0) {
        const id = row.node.memory.id;
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }
      return;
    }
    if (input === 'b' && index > 0) {
      setIndex(0);
      return;
    }
    if (input === 'q' || key.escape) {
      onBack();
    }
  });

  const listRows = Math.max(3, rows - 14);
  const start = Math.max(0, Math.min(index - Math.floor(listRows / 2), Math.max(0, flat.length - listRows)));
  const visible = flat.slice(start, start + listRows);
  const selected = flat[index]?.node.memory;

  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={theme.primary} bold>
          Memories
        </Text>
        <Text color={theme.header}>
          {' '}
          — {sessionId ? sessionId.slice(0, 8) : 'no session'}
        </Text>
        <Text color={theme.muted}>
          {'  '}enter expand/collapse
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {flat.length === 0 ? (
          <Text color={theme.muted} dimColor>
            {'  No memories in this session yet. Chat to create them.'}
          </Text>
        ) : (
          visible.map((row, i) => {
            const idx = start + i;
            const m = row.node.memory;
            const selectedRow = idx === index;
            const hasChildren = row.node.children.length > 0;
            const isOpen = expanded.has(m.id);
            const marker = hasChildren ? (isOpen ? '▾' : '▸') : ' ';
            return (
              <Box key={m.id}>
                <Text color={selectedRow ? theme.accent : theme.muted}>
                  {selectedRow ? '>' : ' '}{' '}
                </Text>
                <Text color={theme.border}>{'  '.repeat(row.depth)}</Text>
                <Text color={selectedRow ? theme.accent : theme.muted} bold={selectedRow}>
                  {marker}{' '}
                </Text>
                <Text color={theme.user}>{`[${m.type}]`}</Text>
                <Text color={theme.muted}>
                  {' '}
                  <Text color={theme.statusWarn}>imp:{m.importance}</Text>
                  {' '}
                  <Text color={theme.muted}>tok:{m.tokens_est ?? '?'}</Text>
                  {'  '}
                </Text>
                <Text color={theme.text} bold={selectedRow}>
                  {truncate(String(m.content).replace(/\n/g, ' '), width - 24)}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {selected && (
        <Box borderStyle="round" borderColor={theme.border} paddingX={1} marginBottom={1}>
          <Text color={theme.header}>
            {truncate(selected.content, width - 4)}
          </Text>
          <Text color={theme.muted} dimColor>
            {'  '}
            {selected.id} · keys: {selected.keys || '{}'} · {selected.created_at.slice(0, 19)}
          </Text>
        </Box>
      )}

      <Text color={theme.muted} dimColor>
        ↑/↓ move · enter expand · q/esc back
      </Text>
    </Box>
  );
}