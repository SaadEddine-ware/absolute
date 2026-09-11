import { render } from 'ink';
import { App } from './app.js';
import { createStubResponder } from './hooks/useChat.js';
import { enterAltScreen } from './lib/alt-screen.js';

export function runTui(): void {
  // Ink's raw-mode input requires a real terminal. `process.stdin.isTTY` is the
  // type-safe check here (ink exports isRawModeSupported but not in its d.ts).
  if (!process.stdin.isTTY) {
    console.error('ABSOLUTE TUI needs an interactive terminal (stdin must be a TTY).');
    process.exit(1);
  }
  // Paint into the alternate screen buffer so the shell scrollback stays clean
  // and no mouse/resize traces survive an exit (including SIGINT/SIGTERM).
  enterAltScreen(process.stdout);
  try {
    render(<App />);
  } catch (e) {
    console.error(
      'ABSOLUTE TUI could not start:',
      e instanceof Error ? e.message : String(e)
    );
    process.exit(1);
  }
}

export { enterAltScreen, leaveAltScreen } from './lib/alt-screen.js';
export {
  serializePress,
  canonicalToken,
  parsePressList,
  resolveKeymap,
  matchBinding,
  pendingBindings,
  chordNext,
  DEFAULT_KEYMAP,
  KEY_ACTIONS,
  type KeyAction,
  type KeyBindingDef,
  type ResolvedBinding,
  type InkKey,
} from './lib/keybinds.js';
export {
  theme,
  applyTheme,
  getThemeSpec,
  listThemes,
  variantFor,
  useThemeVersion,
  getThemeVersion,
  getAppliedTheme,
  THEMES_DIR,
  type Theme,
  type ThemeMode,
  type ThemeSpec,
  type ThemeVariant,
  type ThemeMeta,
  type ApplyThemeResult,
} from './styles/theme.js';
export {
  PromptInput,
  isPromptActive,
  type PromptInputProps,
} from './components/prompt-input.js';
export { usePromptHistory, type UsePromptHistoryResult } from './hooks/usePromptHistory.js';
export {
  CommandPalette,
  COMMAND_PALETTE_HEIGHT,
  type CommandPaletteProps,
  type PaletteItem,
} from './components/command-palette.js';
export {
  HelpOverlay,
  HELP_OVERLAY_HEIGHT,
  type HelpOverlayProps,
} from './components/help-overlay.js';
export {
  ThemePicker,
  THEMES_PICKER_HEIGHT,
  type ThemePickerProps,
} from './components/theme-picker.js';

export { App } from './app.js';
export { createStubResponder } from './hooks/useChat.js';
export type {
  ChatMessage,
  ChatContext,
  MessageRole,
  MessageResponder,
  MessageResponderHandlers,
  Screen,
} from './types.js';
export type { UseChatResult } from './hooks/useChat.js';
export type { UseSessionResult } from './hooks/useSession.js';
export type { UseMemoryResult } from './hooks/useMemory.js';
export type { MemorySummary } from './hooks/useMemory.js';
export type { InputProps } from './components/input.js';
export type { StatusBarProps } from './components/status-bar.js';
export type { MemoryBadgeProps } from './components/memory-badge.js';
export { Sidebar, SIDEBAR_ITEMS, type SidebarProps, type SidebarItem } from './components/sidebar.js';
export {
  SidebarInfo,
  type SidebarInfoProps,
} from './components/sidebar-info.js';
export { useTerminalSize, type TerminalSize } from './hooks/useTerminalSize.js';
export { ConfirmPrompt, type ConfirmPromptProps } from './components/confirm-prompt.js';
export { SessionsScreen, type SessionsScreenProps } from './screens/sessions.js';
export { MemoriesScreen, type MemoriesScreenProps } from './screens/memories.js';
export { SettingsScreen, type SettingsScreenProps } from './screens/settings.js';
export {
  detectSessionContext,
  storeExchangeMemory,
  buildNextMessages,
  scoreImportance,
  extractExchangeKeywords,
  ensureInitialGoal,
  supersedeGoals,
  SYNC_DETECT_TIMEOUT_MS,
  ASYNC_EMBED_TIMEOUT_MS,
  RECALL_TOP_K,
  GOAL_DESC_MAX_CHARS,
  type Exchange,
  type SyncResult,
  type BuildNextMessagesInput,
} from './lib/memory-pipeline.js';