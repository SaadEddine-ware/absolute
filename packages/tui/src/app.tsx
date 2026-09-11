import { Box, Text, useApp, useInput } from 'ink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { homedir } from 'node:os';
import { useSession } from './hooks/useSession.js';
import { useChat } from './hooks/useChat.js';
import { useMemory } from './hooks/useMemory.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { ChatScreen } from './screens/chat.js';
import { SessionsScreen } from './screens/sessions.js';
import { MemoriesScreen } from './screens/memories.js';
import { SettingsScreen } from './screens/settings.js';
import { Sidebar } from './components/sidebar.js';
import { SidebarInfo } from './components/sidebar-info.js';
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
import { isPromptActive } from './components/prompt-input.js';
import { createAnyProvider } from './lib/embedding.js';
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

const TAB_ORDER: Screen[] = ['chat', 'sessions', 'memories', 'settings'];

// Below this terminal width the right technical sidebar is hidden entirely so
// the chat column keeps full width on narrow terminals.
const COMPACT_WIDTH = 60;

// Longest chord (e.g. "ctrl+x t") the router tracks.
const MAX_CHORD_LEN = 2;

type Overlay = 'none' | 'command' | 'help' | 'themes';

const OVERLAY_HEIGHT: Record<Overlay, number> = {
  none: 0,
  command: COMMAND_PALETTE_HEIGHT,
  help: HELP_OVERLAY_HEIGHT,
  themes: THEMES_PICKER_HEIGHT,
};

const HELP = [
  '/help    show this help',
  '/new     start a new session',
  '/clear   clear the on-screen history',
  '/embedded-config  open the embedding/memory settings screen',
  '/sessions | /memories | /settings   jump to a screen',
  '/quit    exit (or ctrl-c)',
  '',
  'Navigation: ctrl+t chat · ctrl+l sessions · ctrl+r memories · ctrl+e settings · tab cycles',
  '',
  'ctrl+p   command palette · ? or ctrl+h help · ctrl+x t themes · ctrl+x s sidebar',
  'ctrl+g   toggle the hybrid topic-confirm prompt (sidebar "ask: on/off")',
  'pgup/pgdn page scroll · alt+up/down line scroll · ↑/↓ input history',
].join('\n');

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

  // Read before the early status returns so the hook order is stable.
  const { columns, rows } = useTerminalSize();
  // Subscribe to theme swaps so the whole tree re-renders on applyTheme()
  // (children re-read the live `theme` object).
  useThemeVersion();
  const uiConfig = useMemo(() => resolveUiConfig(loadConfig()), []);
  const [themeName, setThemeName] = useState<string>(() =>
    applyTheme(uiConfig.theme, uiConfig.themeMode).name
  );
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

  // The embedding provider is recreated from config after a TUI embedding
  // switch, so it must be state (not a module-level memo).
  const [embeddingProvider, setEmbeddingProvider] = useState(() => createAnyProvider(loadConfig()));

  // Technical sidebar data (sidebar-info.tsx): session token budget, the data
  // directory shown home-relative, and the configured LLM model label.
  const config = loadConfig();
  const budgetTokens = config.memory?.maxTokensPerSession ?? 8000;
  const sessionPath = useMemo(() => getDataDir().replace(homedir(), '~'), []);
  const modelLabel = config.model ?? '';

  // Phase 9 chord router: a running press history matches full chords first,
  // then keeps shorter prefixes as the pending which-key hint.
  const historyRef = useRef<string[]>([]);
  const pendingChordRef = useRef<string[]>([]);
  const [pendingChord, setPendingChord] = useState<string[]>([]);

  // Chat scrollback clamp lives here; ChatScreen reports its window's max
  // offset (it knows the real message-window size) and App clamps on it.
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

  // useChat must be called before routeAction fires toggleConfirm, so it is
  // hoisted above the keybind router below.
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
  });

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
        // help/themes switch the overlay content; everything else closes the
        // overlay first and then runs below.
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
        // '?' (bare printable char) must go to the focused prompt instead.
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

  // Global navigation router. Fires alongside screen-level handlers; only the
  // typed-char guard suppresses help's '?' while a prompt is focused (see
  // isPromptActive in prompt-input.tsx).
  useInput((input, key) => {
    dispatch(input, key as InkKey, isPromptActive());
  });

  // Pending chord (which-key) expires after a moment of no further input.
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

  // Command palette contents: app actions plus the slash commands.
  const paletteItems = useMemo<PaletteItem[]>(() => {
    const fromAction = (action: KeyAction): PaletteItem => {
      const b = keymap.find((x) => x.action === action);
      return {
        id: action,
        label: b?.label ?? action,
        hint: b?.keysText,
        run: () => routeAction(action),
      };
    };
    const slash: Array<[string, string, () => void]> = [
      ['/help', 'show this help', () => setOverlayBoth('help')],
      [
        '/new',
        'start a new session',
        () => {
          pushSystem('Starting a new session...');
          void handleNew().then(() => {
            pushSystem('New session started. Say hello to begin.');
          });
        },
      ],
      ['/clear', 'clear the on-screen history', () => clear()],
      ['/sessions', 'jump to the sessions screen', () => setView('sessions')],
      ['/memories', 'jump to the memories screen', () => setView('memories')],
      [
        '/embedded-config',
        'open the embedding/memory settings screen',
        () => setView('settings'),
      ],
      ['/quit', 'exit the TUI', () => exit()],
    ];
    return [
      fromAction('command_palette'),
      fromAction('view_chat'),
      fromAction('view_sessions'),
      fromAction('view_memories'),
      fromAction('view_settings'),
      fromAction('toggle_ask'),
      fromAction('sidebar_status'),
      fromAction('themes_picker'),
      ...slash.map(([cmd, desc, run]) => ({
        id: cmd,
        label: `${cmd} — ${desc}`,
        hint: 'slash command',
        run,
      })),
    ];
  }, [keymap, routeAction, pushSystem, handleNew, clear, exit, setOverlayBoth]);

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
    <Box flexDirection="row" width="100%">
      <Box flexDirection="row" flexGrow={1}>
        <Sidebar current={view} sessionLabel={session?.title ?? 'untitled'} />

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
                onPreview={(name) => {
                  applyTheme(name, uiConfig.themeMode);
                }}
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
      </Box>

      {columns >= COMPACT_WIDTH && sidebarVisible && db && session && (
        <SidebarInfo
          sessionLabel={session.title ?? 'untitled'}
          contextTokens={summary.tokensEst}
          budgetTokens={budgetTokens}
          memoryCount={summary.count}
          memoryTokens={summary.tokensEst}
          sessionPath={sessionPath}
          askOn={confirmEnabled}
          modeLabel={mode}
          modelLabel={modelLabel}
        />
      )}
    </Box>
  );
}