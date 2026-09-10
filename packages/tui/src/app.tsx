import { Box, Text, useApp, useInput } from 'ink';
import { useCallback, useState } from 'react';
import { useSession } from './hooks/useSession.js';
import { useChat } from './hooks/useChat.js';
import { useMemory } from './hooks/useMemory.js';
import { ChatScreen } from './screens/chat.js';
import { SessionsScreen } from './screens/sessions.js';
import { MemoriesScreen } from './screens/memories.js';
import { SettingsScreen } from './screens/settings.js';
import { Sidebar } from './components/sidebar.js';
import type { ChatContext, Screen } from './types.js';
import { theme } from './styles/theme.js';
import { loadConfig } from './lib/config.js';
import { createAnyProvider } from './lib/embedding.js';

const TAB_ORDER: Screen[] = ['chat', 'sessions', 'memories', 'settings'];

const HELP = [
  '/help    show this help',
  '/new     start a new session',
  '/clear   clear the on-screen history',
  '/embedded-config  open the embedding/memory settings screen',
  '/sessions | /memories | /settings   jump to a screen',
  '/quit    exit (or ctrl-c)',
  '',
  'Navigation: ctrl+t chat · ctrl+l sessions · ctrl+r memories · ctrl+e settings · tab cycles',
].join('\n');

export function App(): JSX.Element {
  const { exit } = useApp();
  const [view, setView] = useState<Screen>('chat');
  const {
    status,
    db,
    session,
    sessions,
    error,
    startNew,
    switchSession,
    refreshSessions,
    removeSession,
  } = useSession();

  // The embedding provider is recreated from config after a TUI embedding
  // switch, so it must be state (not a module-level memo).
  const [embeddingProvider, setEmbeddingProvider] = useState(() => createAnyProvider(loadConfig()));

  // Global navigation. Fires alongside screen-level handlers; only reacts to
  // the view keys, never to plain typing.
  useInput((input, key) => {
    if (key.ctrl) {
      const map: Record<string, Screen> = {
        t: 'chat',
        l: 'sessions',
        r: 'memories',
        e: 'settings',
      };
      const target = map[input];
      if (target) {
        setView(target);
        return;
      }
    }
    if (key.tab) {
      setView((v) => TAB_ORDER[(TAB_ORDER.indexOf(v) + 1) % TAB_ORDER.length]);
    }
  });

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

  const { messages, send, pushSystem, clear, isThinking, mode, pendingConfirm, answerConfirm } = useChat(getContext, {
    db,
    provider: hasSession ? embeddingProvider : null,
    onExchange: store,
  });

  const handleSwitch = useCallback(
    async (id: string): Promise<void> => {
      await switchSession(id);
      refresh();
      clear();
    },
    [switchSession, refresh, clear]
  );

  const handleNew = useCallback(async (): Promise<void> => {
    await startNew();
    refresh();
    clear();
    setView('chat');
  }, [startNew, refresh, clear]);

  const handleDelete = useCallback(
    async (id: string): Promise<boolean> => {
      return removeSession(id);
    },
    [removeSession]
  );

  const handleConfigChanged = useCallback((): void => {
    setEmbeddingProvider(createAnyProvider(loadConfig()));
    refresh();
  }, [refresh]);

  const handleCommand = useCallback(
    (command: string) => {
      const name = command.trim().split(/\s+/)[0] ?? '';
      switch (name) {
        case 'help':
          pushSystem(HELP);
          break;
        case 'new':
          pushSystem('Starting a new session...');
          void handleNew().then(() => {
            pushSystem('New session started. Say hello to begin.');
          });
          break;
        case 'clear':
          clear();
          break;
        case 'embedded-config':
        case 'settings':
          setView('settings');
          break;
        case 'sessions':
          setView('sessions');
          break;
        case 'memories':
          setView('memories');
          break;
        case 'quit':
          exit();
          break;
        default:
          pushSystem(`Unknown command /${name}. Type /help for commands.`);
      }
    },
    [pushSystem, handleNew, clear, exit]
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
    <Box flexDirection="row">
      <Sidebar current={view} sessionLabel={session?.title ?? 'untitled'} />

      {view === 'chat' && (
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
          pendingConfirm={pendingConfirm}
          onAnswerConfirm={answerConfirm}
        />
      )}

      {view === 'sessions' && db && (
        <SessionsScreen
          sessions={sessions}
          currentSessionId={session?.id ?? null}
          canDelete={(s) => s.id !== session?.id}
          onSwitch={handleSwitch}
          onNew={handleNew}
          onDelete={handleDelete}
          onBack={() => setView('chat')}
        />
      )}

      {view === 'memories' && db && (
        <MemoriesScreen
          db={db}
          sessionId={session?.id ?? null}
          onBack={() => setView('chat')}
        />
      )}

      {view === 'settings' && db && (
        <SettingsScreen
          db={db}
          onBack={() => setView('chat')}
          onConfigChanged={handleConfigChanged}
        />
      )}

      {view !== 'chat' && !db && (
        <Box>
          <Text color={theme.statusErr}>Database not ready.</Text>
        </Box>
      )}
    </Box>
  );
}