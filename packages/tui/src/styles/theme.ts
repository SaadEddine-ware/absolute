// Slate/dark custom theme (the TUI design is custom, not an opencode clone).
export const theme = {
  // Accent / primary (teal)
  primary: '#5eead4',
  accent: '#22d3ee',

  // Roles
  user: '#38bdf8',
  assistant: '#a3e635',
  system: '#a78bfa',

  // Neutrals
  text: '#e2e8f0',
  muted: '#64748b',
  border: '#334155',
  // Only used as fill for the input/submit area ring
  bg: '#0f172a',

  // Status
  statusOk: '#4ade80',
  statusWarn: '#facc15',
  statusErr: '#f87171',

  // Highlight for the message window header
  header: '#94a3b8',
} as const;

export type Theme = typeof theme;