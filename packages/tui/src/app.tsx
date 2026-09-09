import { Box, Text, useApp } from 'ink';
import { useCallback, useMemo } from 'react';
import { useSession } from './hooks/useSession.js';
import { useChat } from './hooks/useChat.js';
import { useMemory } from './hooks/useMemory.js';
import { ChatScreen } from './screens/chat.js';
import type { ChatContext } from './types.js';
import { theme } from './styles/theme.js';
import { loadConfig } from './lib/config.js';
import { createAnyProvider } from './lib/embedding.js';

const HELP = [
  '/help    show this help',
  '/new     start a new session',
  '/clear   clear the on-screen history',
  '/quit    exit (or ctrl-c)',
].join('\n');

export function App(): JSX.Element {
  const { exit } = useApp();
  const { status, db, session, sessions, error, startNew } = useSession();

  // Build the embedding provider once (config is stable for a session).
  const embeddingProvider = useMemo(() => createAnyProvider(loadConfig()), []);

  const hasSession = db !== null && session !== null;
  const { summary, refresh, store } = useMemory(
    db,
    session?.id ?? null,
    hasSession ? embeddingProvider : null
  );

  const getContext = useCallback(
    (): ChatContext => ({
      sessionId: session?.id ?? 'none',
      memoryCount: summary.count,
      memoryTokens: summary.tokensEst,
    }),
    [session, summary]
  );

  const { messages, send, pushSystem, clear, isThinking, mode } = useChat(getContext, {
    db,
    provider: hasSession ? embeddingProvider : null,
    onExchange: store,
  });

  const handleCommand = useCallback(
    (command: string) => {
      const name = command.trim().split(/\s+/)[0] ?? '';
      switch (name) {
        case 'help':
          pushSystem(HELP);
          break;
        case 'new':
          pushSystem('Starting a new session...');
          void startNew().then(() => {
            refresh();
            clear();
            pushSystem('New session started. Say hello to begin.');
          });
          break;
        case 'clear':
          clear();
          break;
        case 'quit':
          exit();
          break;
        default:
          pushSystem(`Unknown command /${name}. Type /help for commands.`);
      }
    },
    [pushSystem, startNew, refresh, clear, exit]
  );

  if (status === 'opening') {
    return (
      <Box>
        <Text color={theme.muted}>Opening database…</Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={theme.statusErr} bold>
          TUI could not start:
        </Text>
        <Text color={theme.statusErr}>{error}</Text>
        <Text color={theme.muted}>Run `absolute worker status` to diagnose.</Text>
      </Box>
    );
  }

  return (
    <ChatScreen
      sessionLabel={session?.title ?? 'untitled'}
      mode={mode}
      messages={messages}
      isThinking={isThinking}
      memoryCount={summary.count}
      memoryTokens={summary.tokensEst}
      sessionCount={sessions.length}
      onSubmit={send as (text: string) => void}
      onCommand={handleCommand}
    />
  );
}