import { Box, Text, useApp, useInput } from 'ink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { homedir } from 'node:os';
import { useSession } from './hooks/useSession.js';
import { useChat } from './hooks/useChat.js';
import { useMemory } from './hooks/useMemory.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useContextEngine } from './hooks/useContextEngine.js';
import { ChatScreen } from './screens/chat.js';
import { SessionsScreen } from './screens/sessions.js';
import { MemoriesScreen } from './screens/memories.js';
import { GoalsScreen } from './screens/goals.js';
import { SettingsScreen } from './screens/settings.js';
import { Sidebar } from './components/sidebar.js';
import { ContextEnginePanel } from './components/context-engine-panel.js';
import { GoalPanel } from './components/goal-panel.js';
import { NotificationToast, useNotifications } from './components/notifications.js';
import {
  CommandPalette,
  COMMAND_PALETTE_HEIGHT,
  type PaletteItem,
} from './components/command-palette.js';
import { HelpOverlay, HELP_OVERLAY_HEIGHT } from './components/help-overlay.js';
import { ThemePicker, THEMES_PICKER_HEIGHT } from './components/theme-picker.js';
import type { ChatContext, Screen } from './types.js';
import { theme, applyTheme, useThemeVersion, listThemes } from './styles/theme.js';
import { loadConfig, saveConfig, resolveUiConfig, getDataDir } from './lib/config.js';
import { isPromptActive, isAutocompleteActive } from './components/prompt-input.js';
import { createAnyProvider } from './lib/embedding.js';
import { getActiveGoals, getUserSettings } from '@absolute/core';
import { getCommandRegistry, type CommandContext } from './lib/commands.js';
import { Footer } from './components/footer.js';
import {
  serializePress,
  matchBinding,
  pendingBindings,
  chordNext,
  resolveKeymap,
  type KeyAction,
  type ResolvedBinding,
  type InkKey,
} from './lib/keybinds.js';

const TAB_ORDER: Screen[] = ['chat', 'sessions', 'memories', 'goals', 'settings'];

const COMPACT_WIDTH = 72;
const NARROW_WIDTH = 56;

const MAX_CHORD_LEN = 2;

type Overlay = 'none' | 'command' | 'help' | 'themes';

const OVERLAY_HEIGHT: Record<Overlay, number> = {
  none: 0,
  command: COMMAND_PALETTE_HEIGHT,
  help: HELP_OVERLAY_HEIGHT,
  themes: THEMES_PICKER_HEIGHT,
};

export function App(): JSX.Element {
  const { exit } = useApp();
  const [view, setView] = useState<Screen>('chat');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [scrollOffset, setScrollOffset] = useState(0);
  const overlayRef = useRef<Overlay>('none');
  const setOverlayBoth = useCallback((o: Overlay) => {
    overlayRef.current = o;
    setOverlay(o);
  }, []);

  const { columns, rows } = useTerminalSize();
  useThemeVersion();
  const uiConfig = useMemo(() => resolveUiConfig(loadConfig()), []);
  const [themeName, setThemeName] = useState<string>(() =>
    applyTheme(uiConfig.theme, uiConfig.themeMode).name
  );

  // Paint terminal background opaque on mount so no transparency shows through
  useEffect(() => {
    const hex = theme.bg;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // truecolor bg + clear screen + cursor home
    process.stdout.write(`\x1b[48;2;${r};${g};${b}m\x1b[2J\x1b[H`);
    return () => {
      process.stdout.write('\x1b[0m');
    };
  }, []);
  const keymap = useMemo<ResolvedBinding[]>(
    () => resolveKeymap(uiConfig.keybindings),
    [uiConfig.keybindings]
  );
  const keymapRef = useRef<ResolvedBinding[]>(keymap);
  keymapRef.current = keymap;
  const themeList = useMemo(() => listThemes(), []);

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

  const [embeddingProvider, setEmbeddingProvider] = useState(() => createAnyProvider(loadConfig()));

  const config = loadConfig();
  const budgetTokens = config.memory?.maxTokensPerSession ?? 8000;
  const sessionPath = useMemo(() => getDataDir().replace(homedir(), '~'), []);
  const modelLabel = config.model ?? '';

  const historyRef = useRef<string[]>([]);
  const pendingChordRef = useRef<string[]>([]);
  const [pendingChord, setPendingChord] = useState<string[]>([]);

  const maxOffsetRef = useRef(0);
  const setMaxOffset = useCallback((max: number) => {
    maxOffsetRef.current = max;
    setScrollOffset((o) => Math.min(Math.max(0, o), max));
  }, []);
  const scrollBy = useCallback((delta: number) => {
    setScrollOffset((o) => Math.max(0, Math.min(o + delta, maxOffsetRef.current)));
  }, []);

  const overlayHeight =
    overlay === 'none' ? 0 : Math.min(OVERLAY_HEIGHT[overlay], Math.max(6, rows - 8));

  const hasSession = db !== null && session !== null;
  const { summary, refresh, store } = useMemory(
    db,
    session?.id ?? null,
    hasSession ? embeddingProvider : null,
    budgetTokens
  );

  // Context engine state
  const contextEngine = useContextEngine();

  // Goals state
  const [goalsVersion, setGoalsVersion] = useState(0);
  const activeGoals = useMemo(() => {
    if (!db || !session) return [];
    return getActiveGoals(db.db, session.id);
  }, [db, session, goalsVersion]);
  const allGoals = useMemo(() => {
    if (!db || !session) return [];
    try {
      const { getGoalsBySession } = require('@absolute/core');
      return getGoalsBySession(db.db, session.id, 100);
    } catch {
      return [];
    }
  }, [db, session, goalsVersion]);
  const activeGoal = activeGoals[0] ?? null;

  // User settings for threshold display
  const userSettings = useMemo(() => {
    if (!db) return null;
    try {
      return getUserSettings(db.db);
    } catch {
      return null;
    }
  }, [db]);

  // Notifications
  const { notifications, push: pushNotif, dismiss: dismissNotif } = useNotifications();

  const getContext = useCallback(
    (): ChatContext => ({
      sessionId: session?.id ?? 'none',
      memoryCount: summary.count,
      memoryTokens: summary.tokensEst,
    }),
    [session, summary]
  );

  const {
    messages,
    send,
    pushSystem,
    clear,
    isThinking,
    mode,
    pendingConfirm,
    answerConfirm,
    confirmEnabled,
    toggleConfirm,
  } = useChat(getContext, {
    db,
    provider: hasSession ? embeddingProvider : null,
    onExchange: store,
    maxTokens: budgetTokens,
    promptConfig: config.systemPrompt,
    onDetection: (result) => {
      contextEngine.updateFromDetection({
        similarity: result.similarity,
        threshold: result.threshold,
        decision: result.decision,
        goal: result.goal,
        goalEvaluated: result.goalEvaluated,
      });
    },
  });

  // Sync context engine with detection results from useChat
  // (The detection result is available in the send() pipeline; we poll the
  // active goal and threshold to keep the panel updated.)
  useEffect(() => {
    if (!db || !session) return;
    const interval = setInterval(() => {
      try {
        const goals = getActiveGoals(db.db, session.id);
        const settings = getUserSettings(db.db);
        contextEngine.updateFromDetection({
          goal: goals[0] ?? null,
          threshold: settings.similarity_threshold,
        });
        setGoalsVersion((v) => v + 1);
      } catch {
        // best-effort
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [db, session, contextEngine]);

  const routeAction = useCallback(
    (action: KeyAction) => {
      historyRef.current = [];
      pendingChordRef.current = [];
      setPendingChord([]);
      const ov = overlayRef.current;
      if (ov !== 'none') {
        if (action === 'command_palette') {
          setOverlayBoth('none');
          return;
        }
        if (action !== 'help_overlay' && action !== 'themes_picker') {
          setOverlayBoth('none');
        }
      }
      switch (action) {
        case 'view_chat':
          setView('chat');
          break;
        case 'view_sessions':
          setView('sessions');
          break;
        case 'view_memories':
          setView('memories');
          break;
        case 'view_goals':
          setView('goals');
          break;
        case 'view_settings':
          setView('settings');
          break;
        case 'cycle_screens':
          setView((v) => TAB_ORDER[(TAB_ORDER.indexOf(v) + 1) % TAB_ORDER.length]);
          break;
        case 'toggle_ask':
          toggleConfirm();
          break;
        case 'command_palette':
          setOverlayBoth('command');
          break;
        case 'help_overlay':
          setOverlayBoth('help');
          break;
        case 'themes_picker':
          setOverlayBoth('themes');
          break;
        case 'sidebar_status':
          setSidebarVisible((v) => !v);
          break;
        case 'scroll_page_up':
          scrollBy(-(Math.max(3, rows - 8 - overlayHeight)));
          break;
        case 'scroll_page_down':
          scrollBy(Math.max(3, rows - 8 - overlayHeight));
          break;
        case 'scroll_line_up':
          scrollBy(-1);
          break;
        case 'scroll_line_down':
          scrollBy(1);
          break;
      }
    },
    [scrollBy, setOverlayBoth, toggleConfirm, rows, overlayHeight]
  );

  const dispatch = useCallback(
    (input: string, key: InkKey, isActive: boolean) => {
      const token = serializePress(input, key);
      if (!token) return;
      const nextHistory = [...historyRef.current, token].slice(-MAX_CHORD_LEN);
      const best = matchBinding(keymapRef.current, nextHistory);
      if (best) {
        historyRef.current = [];
        pendingChordRef.current = [];
        setPendingChord([]);
        if (best.consumesTypedChars && isActive) return;
        routeAction(best.action);
        return;
      }
      const pend = pendingBindings(keymapRef.current, nextHistory);
      if (pend.length > 0) {
        historyRef.current = nextHistory;
        setPendingChord(nextHistory);
      } else {
        historyRef.current = [];
        setPendingChord([]);
      }
    },
    [routeAction]
  );

  useInput((input, key) => {
    // When autocomplete popup is open, suppress all app-level keybinds
    // so arrows/enter/escape/tab go to the autocomplete handler.
    if (isAutocompleteActive()) return;
    dispatch(input, key as InkKey, isPromptActive());
  });

  useEffect(() => {
    if (pendingChord.length === 0) return;
    const t = setTimeout(() => {
      historyRef.current = [];
      pendingChordRef.current = [];
      setPendingChord([]);
    }, 1500);
    return () => clearTimeout(t);
  }, [pendingChord]);

  const pendingChordHint = useMemo(() => {
    if (pendingChord.length === 0) return undefined;
    const leader = pendingChord.join(' ');
    const pend = pendingBindings(keymap, pendingChord);
    const entries = pend
      .flatMap((b) =>
        b.chords
          .filter((c) => c.length > pendingChord.length)
          .map((c) => ({ k: chordNext(c, pendingChord) ?? '', label: b.label }))
      )
      .filter((e) => e.k !== '');
    return `[${leader}] ${entries.map((e) => `[${e.k}] ${e.label}`).join('  ')}`;
  }, [pendingChord, keymap]);

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

  // --- Command registry ---
  const cmdRegistry = useMemo(() => {
    const reg = getCommandRegistry();
    // Load custom commands from config (runs once per config load)
    if (config.commands) reg.loadUserCommands(config.commands);
    return reg;
  }, [config.commands]);

  const cmdCtx = useMemo<CommandContext>(
    () => ({
      pushSystem,
      clear,
      exit,
      handleNew,
      setView,
      setOverlayBoth,
      db,
      sessionId: session?.id ?? null,
      provider: config.provider ?? 'openai',
      model: config.model ?? 'gpt-4o',
    }),
    [pushSystem, clear, exit, handleNew, setView, setOverlayBoth, db, session?.id, config.provider, config.model]
  );

  const handleCommand = useCallback(
    async (command: string) => {
      const handled = await cmdRegistry.execute(command, cmdCtx);
      if (!handled) {
        const name = command.trim().split(/\s+/)[0] ?? '';
        if (name) pushSystem(`Unknown command /${name}. Type /help for commands.`);
      }
    },
    [cmdRegistry, cmdCtx, pushSystem]
  );

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const actionCategory: Record<string, string> = {
      command_palette: 'Navigation',
      view_chat: 'Navigation',
      view_sessions: 'Navigation',
      view_memories: 'Navigation',
      view_goals: 'Navigation',
      view_settings: 'Navigation',
      toggle_ask: 'Config',
      sidebar_status: 'Config',
    };
    const fromAction = (action: KeyAction): PaletteItem => {
      const b = keymap.find((x) => x.action === action);
      return {
        id: action,
        label: b?.label ?? action,
        category: actionCategory[action] ?? 'Navigation',
        keybind: b?.keysText || undefined,
        run: () => routeAction(action),
      };
    };
    // Build slash commands from the registry
    const catLabel: Record<string, string> = {
      session: 'Session',
      memory: 'Memory',
      navigation: 'Navigation',
      config: 'Config',
      user: 'Commands',
    };
    const slashItems: PaletteItem[] = cmdRegistry.list().map((cmd) => ({
      id: `/${cmd.name}`,
      label: `/${cmd.name} — ${cmd.description}`,
      category: catLabel[cmd.category] ?? 'Commands',
      run: () => void cmdRegistry.execute(`/${cmd.name}`, cmdCtx),
    }));
    return [
      fromAction('command_palette'),
      fromAction('view_chat'),
      fromAction('view_sessions'),
      fromAction('view_memories'),
      fromAction('view_goals'),
      fromAction('view_settings'),
      fromAction('toggle_ask'),
      fromAction('sidebar_status'),
      ...slashItems,
    ];
  }, [keymap, routeAction, cmdRegistry, cmdCtx]);

  if (status === 'opening') {
    return (
      <Box>
        <Text color={theme.muted}>Opening database...</Text>
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

  const narrow = columns < NARROW_WIDTH;
  const compact = columns < COMPACT_WIDTH;
  const showRightPanel = !compact && sidebarVisible && db && session;

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header bar */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        paddingX={1}
      >
        <Text color={theme.accent}>absolute</Text>
        <Text color={theme.muted}>
          {config.provider ?? 'openai'}/{config.model ?? 'gpt-4o'}
        </Text>
        <Text color={theme.muted}>
          {contextEngine.state.detecting ? '...' : contextEngine.state.decision}
        </Text>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        {/* Left sidebar */}
        {sidebarVisible && (
          <Sidebar
            activeView={view}
            sessionLabel={session?.title ?? 'untitled'}
            onSelect={setView}
            compact={narrow}
          />
        )}

        {/* Main content area */}
        <Box flexDirection="column" flexGrow={1}>
          {overlay === 'command' && (
            <Box height={overlayHeight}>
              <CommandPalette items={paletteItems} onClose={() => setOverlayBoth('none')} />
            </Box>
          )}
          {overlay === 'help' && (
            <Box height={overlayHeight}>
              <HelpOverlay bindings={keymap} onClose={() => setOverlayBoth('none')} />
            </Box>
          )}
          {overlay === 'themes' && (
            <Box height={overlayHeight}>
              <ThemePicker
                themes={themeList}
                currentName={themeName}
                mode={uiConfig.themeMode}
                onPreview={(name) => applyTheme(name, uiConfig.themeMode)}
                onPick={(name) => {
                  applyTheme(name, uiConfig.themeMode);
                  setThemeName(name);
                  const cur = loadConfig();
                  saveConfig({ ...cur, ui: { ...(cur.ui ?? {}), theme: name, themeMode: uiConfig.themeMode } });
                  pushSystem(`Theme: ${name} (${uiConfig.themeMode})`);
                }}
                onClose={() => setOverlayBoth('none')}
              />
            </Box>
          )}

          {view === 'chat' && (
            <ChatScreen
              sessionLabel={session?.title ?? 'untitled'}
              messages={messages}
              isThinking={isThinking}
              memoryCount={summary.count}
              memoryTokens={summary.tokensEst}
              sessionCount={sessions.length}
              onSubmit={send as (text: string) => void}
              onCommand={handleCommand}
              pendingConfirm={pendingConfirm}
              onAnswerConfirm={answerConfirm}
              scrollOffset={scrollOffset}
              onScroll={scrollBy}
              onMaxOffset={setMaxOffset}
              overlayHeight={overlayHeight}
              pendingChordHint={pendingChordHint}
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
              overlayHeight={overlayHeight}
            />
          )}

          {view === 'memories' && db && (
            <MemoriesScreen
              db={db}
              sessionId={session?.id ?? null}
              onBack={() => setView('chat')}
              overlayHeight={overlayHeight}
            />
          )}

          {view === 'goals' && db && (
            <GoalsScreen
              db={db}
              sessionId={session?.id ?? null}
              overlayHeight={overlayHeight}
            />
          )}

          {view === 'settings' && db && (
            <SettingsScreen
              db={db}
              onBack={() => setView('chat')}
              onConfigChanged={handleConfigChanged}
              overlayHeight={overlayHeight}
            />
          )}

          {view !== 'chat' && !db && (
            <Box>
              <Text color={theme.statusErr}>Database not ready.</Text>
            </Box>
          )}
        </Box>

        {/* Right panel: Context Engine + Goals */}
        {showRightPanel && (
          <Box
            flexDirection="column"
            width={compact ? 20 : 26}
            borderStyle="single"
            borderLeft={true}
            borderColor={theme.border}
            paddingX={1}
            paddingTop={1}
            paddingBottom={1}
          >
            <ContextEnginePanel
              state={contextEngine.state}
              compact={narrow}
            />
            <Box marginTop={1} marginBottom={1}>
              <GoalPanel
                goals={allGoals}
                activeGoal={activeGoal}
              />
            </Box>
            <Box marginTop={1}>
              <Text color={theme.muted}>
                ask{' '}
                <Text color={confirmEnabled ? theme.statusOk : theme.statusWarn}>
                  {confirmEnabled ? 'on' : 'off'}
                </Text>
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.muted} dimColor>
                {mode}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.muted} dimColor>
                tok {summary.tokensEst}/{budgetTokens}
              </Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* Notifications */}
      <NotificationToast
        notifications={notifications}
        onDismiss={dismissNotif}
      />

      {/* Footer */}
      <Footer
        connected={!!(config.provider || config.model)}
        provider={config.provider ?? 'openai'}
        model={config.model ?? 'gpt-4o'}
        cwd={getDataDir()}
      />
    </Box>
  );
}
