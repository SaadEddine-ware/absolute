# ABSOLUTE - AI CLI with Neural Memory

## Problem Statement

The current MCP server approach for the Neural Memory system causes AI sessions to crash on startup. When a session begins, the memory system tries to create neural memories synchronously, overwhelming the AI and forcing session closure. The solution: build an independent CLI app (like opencode) with the memory system integrated natively as a transparent, non-blocking layer.

## Architecture Overview

```
ABSOLUTE
├── User types prompt
├── [SYNC, target <100ms local / <500ms network, hard timeout]
│   Context detection: compute embedding via EmbeddingProvider, compare to active goal
│   → If network timeout: fall back to "continue" (no context check, never block user)
├── [SYNC] Load relevant memory headers into system prompt (via sqlite-vec KNN)
├── [LLM] AI responds (seamlessly using memory context)
├── [ASYNC fire-and-forget] Extract keywords, score importance, store memory
└── Response displayed to user
```

**Key insight**: Memory operations are split into two tiers:
- **SYNC** (blocks response, with hard timeout): embedding computation via `EmbeddingProvider` interface + sqlite-vec KNN search. Target <100ms local, <500ms network. If the embedding call exceeds the timeout, the system falls back to "continue without context check" — a hung network call must never block the CLI from responding.
- **ASYNC** (fire-and-forget): keyword extraction, importance scoring, summarization — runs after response sent

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js (ESM) |
| Language | TypeScript |
| TUI Framework | Ink (React for CLI) |
| CLI Framework | Commander.js |
| Local Storage | better-sqlite3 + sqlite-vec (vector KNN) |
| Embeddings | EmbeddingProvider interface → Cloudflare Worker (temp), local later |
| LLM Providers | Vercel AI SDK (Anthropic, OpenAI native) + openai-compatible (Groq, MiMo free tier) |
| Package Manager | npm workspaces |
| Build | tsup (fast TypeScript bundler) |

## Project Structure

```
/home/saad/absolute/
├── package.json                    # Root workspace config
├── tsconfig.json                   # Base TypeScript config
├── .gitignore
├── README.md
│
├── packages/
│   ├── core/                       # Neural Memory Engine
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts            # Public API exports
│   │   │   ├── database.ts         # SQLite setup + migrations + sqlite-vec load
│   │   │   ├── memory.ts           # CRUD for memories table
│   │   │   ├── goals.ts            # Goal tracking hierarchy
│   │   │   ├── sessions.ts         # Session management
│   │   │   ├── context-detect.ts   # [SYNC] Embedding + sqlite-vec KNN similarity
│   │   │   ├── progressive-load.ts # Progressive loading (headers → details)
│   │   │   ├── adaptive-threshold.ts # Adaptive threshold (EMA)
│   │   │   ├── cross-session.ts    # Cross-session memory linking
│   │   │   ├── retention.ts        # Memory retention/cleanup
│   │   │   ├── system-prompt.ts    # System prompt builder with memory context
│   │   │   ├── types.ts            # TypeScript interfaces (incl. EmbeddingProvider)
│   │   │   ├── embedding/
│   │   │   │   ├── types.ts        # EmbeddingProvider interface (modelId, dimensions, embed)
│   │   │   │   ├── cloudflare-provider.ts # Cloudflare Worker implementation
│   │   │   │   └── local-provider.ts     # transformers.js implementation (Phase 7+)
│   │   │   ├── migration.ts        # Re-embed all memories/goals (provider switch)
│   │   │   └── schema.sql          # SQLite schema + sqlite-vec virtual tables + metadata
│   │   └── dist/                   # Compiled output
│   │
│   ├── cli/                        # CLI entry point
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Main entry, Commander setup
│   │       ├── commands/
│   │       │   ├── session.ts      # absolute session [start|list|continue|delete]
│   │       │   ├── memory.ts       # absolute memory [search|list|recall|stats]
│   │       │   ├── config.ts       # absolute config [get|set|list|embedding]
│   │       │   ├── migrate.ts      # absolute migrate [embeddings]
│   │       │   ├── provider.ts     # absolute provider [list|set|test]
│   │       │   └── doctor.ts       # absolute doctor (health check)
│   │       └── utils/
│   │           ├── config.ts       # Config file management
│   │           └── auth.ts         # Credential storage (OS keychain via keytar, fallback 0600 file)
│   │
│   ├── tui/                        # Ink-based Terminal UI
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.tsx           # Ink render entry
│   │       ├── app.tsx             # Main App component (router)
│   │       ├── screens/
│   │       │   ├── chat.tsx        # Main chat interface
│   │       │   ├── sessions.tsx    # Session list/manager
│   │       │   ├── memories.tsx    # Memory browser
│   │       │   └── settings.tsx    # Settings/config UI
│   │       ├── components/
│   │       │   ├── message.tsx     # Message bubble renderer
│   │       │   ├── input.tsx       # Input area with autocomplete
│   │       │   ├── status-bar.tsx  # Bottom status bar
│   │       │   ├── sidebar.tsx     # Session/memory sidebar
│   │       │   ├── memory-badge.tsx # Memory indicator in messages
│   │       │   └── spinner.tsx     # Loading spinner
│   │       ├── hooks/
│   │       │   ├── useChat.ts      # Chat state management
│   │       │   ├── useSession.ts   # Session state
│   │       │   ├── useMemory.ts    # Memory operations
│   │       │   └── useProvider.ts  # LLM provider state
│   │       ├── styles/
│   │       │   ├── theme.ts        # Color theme
│   │       │   └── layout.ts       # Layout constants
│   │       └── utils/
│   │           ├── format.ts       # Text formatting
│   │           └── keys.ts         # Keybinding handling
│   │
│   └── providers/                  # LLM Provider abstraction
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # Provider manager (registers all 4 providers)
│           ├── types.ts            # LLMProvider interface + freeTier flag
│           ├── openai.ts           # OpenAI provider (native SDK)
│           ├── anthropic.ts        # Anthropic provider (native SDK)
│           ├── groq.ts             # Groq provider (openai-compatible-client, free tier)
│           ├── mimo.ts             # MiMo provider (openai-compatible-client, free tier)
│           └── openai-compatible-client.ts # Shared base for Groq/MiMo (different baseURLs)
│
├── workers/                        # Cloudflare Workers (existing, adapted)
│   ├── embedding/                  # Embedding Worker
│   │   ├── src/index.ts            # Embedding endpoint
│   │   ├── wrangler.jsonc
│   │   └── package.json
│   └── memory-api/                 # Memory REST API (optional, for sync)
│       ├── src/index.ts            # Existing Worker code (adapted)
│       ├── wrangler.jsonc
│       └── package.json
│
└── bin/
    └── absolute                    # Shell wrapper script
```

## Core Memory Integration Flow

### 1. Session Start
```
absolute session start
  → Create new session in local SQLite
  → Load subject headers from recent sessions (progressive: headers only)
  → Build system prompt with memory context
  → Start TUI with chat interface
```

### 2. During Conversation (Per Prompt)
```
User sends: "Now build the REST API"
  │
  ├── [SYNC, hard timeout 500ms]
  │   ├── EmbeddingProvider.embed("Now build the REST API")
  │   │   → Cloudflare provider: HTTP call to Worker
  │   │   → If timeout: skip context check, proceed with "continue"
  │   ├── sqlite-vec KNN: find top-K most similar memories/goals
  │   ├── Cosine similarity with active goal embedding
  │   ├── Compare to adaptive threshold (default 0.6)
  │   └── Decision: continue / ask / switch
  │
  ├── [SYNC] If ask: "Are we still working on backend?"
  │   → User confirms → continue (update threshold)
  │   → User denies → switch context (save previous, start new)
  │
  ├── [SYNC] Load matching memory headers into system prompt
  │   → System prompt += formatted memory context
  │
  ├── [LLM] AI responds using loaded context
  │   → Response streams to TUI
  │
  └── [ASYNC fire-and-forget, after response sent]
      ├── Extract keywords from AI response (local regex, no LLM call)
      ├── Score importance based on type + position
      ├── Store memory in SQLite + sqlite-vec vector row
      └── Update goal progress
```

### 3. System Prompt Template
```
You are ABSOLUTE, an AI assistant with persistent memory.

=== ACTIVE GOALS ===
[goal] Build Albab App (active)
  [sub_goal] Set up backend (active)
    [task] Database with PostgreSQL (active)
    [task] REST API (pending)

=== SESSION MEMORIES ===
[subject] Building Albab App - Full-stack application
  [action] Setting up backend - PostgreSQL, REST API, Auth
    [sub_action] Database setup - Using PostgreSQL with migrations
    [sub_action] API design - RESTful endpoints

=== RECENT CONTEXT ===
- Last prompt: "Use PostgreSQL for the database"
- Last action: Database schema design

=== INSTRUCTIONS ===
Remember context across sessions. When you create goals or make decisions,
note them naturally. The memory system handles persistence automatically.
```

## Commands

```bash
# Session management
absolute                          # Start TUI (default)
absolute session start            # New session
absolute session list             # List all sessions
absolute session continue <id>    # Resume session
absolute session delete <id>      # Delete session

# Memory management
absolute memory search <query>    # Search memories
absolute memory list              # List recent memories
absolute memory recall <topic>    # Recall memories about topic
absolute memory stats             # Memory statistics
absolute memory cleanup           # Delete expired memories

# Embedding provider management
absolute config embedding         # Show/change embedding provider (local vs cloudflare)
absolute migrate embeddings       # Re-embed all memories/goals with new provider

# Configuration
absolute config get <key>         # Get config value
absolute config set <key> <value> # Set config value
absolute config list              # List all config

# Provider management
absolute provider list            # List available providers
absolute provider set <provider>  # Set default provider
absolute provider test            # Test provider connection

# Utilities
absolute doctor                   # Health check (includes embedding provider validation)
absolute export [session-id]      # Export session as JSON
absolute import <file>            # Import session from JSON
```

## Configuration File

Location: `~/.config/absolute/config.json`

```json
{
  "$schema": "https://absolute.dev/config.schema.json",
  "provider": "openai",
  "model": "gpt-4o",
  "providers": {
    "openai": {
      "apiKey": "env:OPENAI_API_KEY"
    },
    "anthropic": {
      "apiKey": "env:ANTHROPIC_API_KEY"
    }
  },
  "memory": {
    "embeddingWorkerUrl": "https://embedding.<your-subdomain>.workers.dev",
    "similarityThreshold": 0.6,
    "maxTokensPerSession": 4000,
    "retentionDays": 30,
    "asyncProcessing": true
  },
  "theme": "default",
  "keybinds": {}
}
```

## SQLite Schema (Local)

Uses `better-sqlite3` with the `sqlite-vec` extension loaded at connection open
for native vector similarity search (KNN). The extension provides a `vec0` virtual
table that handles cosine distance indexing internally — no manual cosine math in JS.

Dimension count: confirm from Cloudflare Worker response before hardcoding. The
`@cf/baai/bge-base-en-v1.5` model returns 768-dimensional vectors (not 384).

```sql
-- ============================================================
-- CORE TABLES
-- ============================================================

-- memories: hierarchical memory storage (subject → action → sub_action → prompt_answer)
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    type TEXT NOT NULL CHECK(type IN ('subject', 'action', 'sub_action', 'prompt_answer')),
    content TEXT NOT NULL,
    keys TEXT NOT NULL DEFAULT '{}',
    goal_id TEXT,
    importance INTEGER DEFAULT 5 CHECK(importance BETWEEN 1 AND 10),
    tokens_est INTEGER,
    session_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES memories(id),
    FOREIGN KEY (goal_id) REFERENCES goals(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- goals: goal tracking hierarchy (goal → sub_goal → task)
CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    parent_goal_id TEXT,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'paused')),
    keys TEXT NOT NULL DEFAULT '{}',
    level TEXT NOT NULL CHECK(level IN ('goal', 'sub_goal', 'task')),
    session_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_goal_id) REFERENCES goals(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- sessions: conversation session metadata
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    root_subject_id TEXT,
    summary TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (root_subject_id) REFERENCES memories(id)
);

-- ============================================================
-- VECTOR STORAGE (sqlite-vec)
-- ============================================================

-- memory_vectors: KNN vector index for memory similarity search.
-- Queried via: SELECT memory_id, distance FROM memory_vectors
--   WHERE embedding MATCH ?1 ORDER BY distance LIMIT ?2
-- The vec0 extension handles cosine distance natively.
CREATE VIRTUAL TABLE memory_vectors USING vec0(
    memory_id TEXT PRIMARY KEY,
    embedding FLOAT[768]
);

-- goal_vectors: KNN vector index for goal similarity search.
-- Same query pattern as memory_vectors.
CREATE VIRTUAL TABLE goal_vectors USING vec0(
    goal_id TEXT PRIMARY KEY,
    embedding FLOAT[768]
);

-- ============================================================
-- EMBEDDING METADATA (migration safety)
-- ============================================================

-- embedding_metadata: singleton row tracking which embedding model
-- produced all vectors in the vec0 tables. On startup, if this
-- row's model_id doesn't match the configured EmbeddingProvider.modelId,
-- the app refuses to start and directs the user to run migration.
-- Never silently mix vectors from two different model spaces.
CREATE TABLE embedding_metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
    model_id TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SETTINGS TABLES (two separate tables, distinct roles)
-- ============================================================

-- user_settings: fixed, typed, core system state that the adaptive-
-- threshold and retention systems read/write directly. One row per
-- user. Columns are explicit and strongly typed (never add generic
-- key-value pairs here).
CREATE TABLE user_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    similarity_threshold REAL DEFAULT 0.6,
    switch_confirmed_count INTEGER DEFAULT 0,
    switch_rejected_count INTEGER DEFAULT 0,
    total_confirmations INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- settings: generic key-value store for anything NOT covered by a
-- dedicated column in user_settings — user preferences, CLI config
-- overrides, feature flags. Never duplicate a user_settings column here.
CREATE TABLE settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, setting_key)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_goal ON memories(goal_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_parent ON memories(parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_session ON goals(session_id);
CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_level ON goals(level);
```

### sqlite-vec Query Pattern

Used in `context-detect.ts` and anywhere similarity search is needed:

```sql
-- Find top-K memories most similar to a query embedding
SELECT mv.memory_id, mv.distance, m.content, m.type, m.importance
FROM memory_vectors mv
JOIN memories m ON m.id = mv.memory_id
WHERE mv.embedding MATCH ?1  -- ?1 = query embedding as Float32Array
  AND m.session_id = ?2      -- scope to current session (optional)
ORDER BY mv.distance ASC
LIMIT ?3;                    -- ?3 = K (e.g., 5)

-- Same pattern for goals:
SELECT gv.goal_id, gv.distance, g.description, g.status, g.level
FROM goal_vectors gv
JOIN goals g ON g.id = gv.goal_id
WHERE gv.embedding MATCH ?1
  AND g.session_id = ?2
ORDER BY gv.distance ASC
LIMIT ?3;
```

**Do not** reimplement cosine similarity in JS for search. The sqlite-vec
extension handles this natively and is orders of magnitude faster for large
datasets. The `cosineSimilarity()` function in `similarity.ts` is only kept
for edge cases where pre-computed vectors need comparison outside of SQLite.

**Critical constraint**: `content` (memories) and `description` (goals) text must
always be persisted alongside any embedding. This is the only way to re-embed
when the embedding provider changes — without the source text, vectors from the
old model space are useless and must be deleted.

## Implementation Phases

### Phase 1: Foundation (Core + CLI skeleton)
**Goal**: Bootable CLI with session management and local SQLite

**Files to create**:
- `package.json` (root workspace)
- `tsconfig.json` (base)
- `.gitignore`
- `packages/core/package.json`
- `packages/core/tsconfig.json`
- `packages/core/src/types.ts`
- `packages/core/src/embedding/types.ts` — `EmbeddingProvider` interface (modelId, dimensions, embed)
- `packages/core/src/embedding/cloudflare-provider.ts` — Cloudflare Worker impl
- `packages/core/src/schema.sql` — with sqlite-vec virtual tables + embedding_metadata
- `packages/core/src/database.ts` — loads sqlite-vec extension, validates embedding_metadata on open
- `packages/core/src/migration.ts` — re-embed all memories/goals (used by both migrate command and config embedding)
- `packages/core/src/sessions.ts`
- `packages/core/src/memory.ts`
- `packages/core/src/index.ts`
- `packages/cli/package.json`
- `packages/cli/tsconfig.json`
- `packages/cli/src/index.ts`
- `packages/cli/src/commands/session.ts`
- `packages/cli/src/commands/config.ts` — including `config embedding` subcommand
- `packages/cli/src/commands/migrate.ts` — `migrate embeddings` command
- `packages/cli/src/utils/config.ts`
- `packages/cli/src/utils/auth.ts` — OS keychain (keytar) + 0600 fallback for API tokens

**Verify**: `absolute session start` creates a session in SQLite, `absolute session list` shows it, AND a fresh database initializes `embedding_metadata` automatically without requiring migration.

### Phase 2: Memory Engine
**Goal**: Full memory CRUD with hierarchical storage

**Files to create/update**:
- `packages/core/src/goals.ts`
- `packages/core/src/cross-session.ts`
- `packages/core/src/retention.ts`
- Update `packages/core/src/memory.ts` with progressive loading
- Update `packages/core/src/index.ts` with all exports

**Verify**: Store and retrieve memories with proper hierarchy (subject → action → sub_action → prompt_answer).

### Phase 3: Context Detection + System Prompt
**Goal**: SYNC context detection via EmbeddingProvider + sqlite-vec, system prompt injection

**Files to create**:
- `packages/core/src/context-detect.ts` — uses EmbeddingProvider + sqlite-vec KNN (not manual cosine)
- `packages/core/src/progressive-load.ts`
- `packages/core/src/adaptive-threshold.ts`
- `packages/core/src/system-prompt.ts`
- `workers/embedding/` (Cloudflare Worker for embeddings, wrapped by cloudflare-provider.ts)

**Verify**: Context detection works — similar prompts return "continue", different topics return "ask" or "switch". Timeout fallback works when Worker is unreachable. Startup guard rejects mismatched embedding provider.

### Phase 4: TUI (Chat Interface)
**Goal**: Working chat TUI with Ink

**Files to create**:
- `packages/tui/package.json`
- `packages/tui/tsconfig.json`
- `packages/tui/src/index.tsx`
- `packages/tui/src/app.tsx`
- `packages/tui/src/screens/chat.tsx`
- `packages/tui/src/components/message.tsx`
- `packages/tui/src/components/input.tsx`
- `packages/tui/src/components/status-bar.tsx`
- `packages/tui/src/hooks/useChat.ts`
- `packages/tui/src/hooks/useSession.ts`
- `packages/tui/src/hooks/useMemory.ts`
- `packages/tui/src/styles/theme.ts`

**Verify**: `absolute` launches TUI, user can type messages, see responses.

### Phase 5: LLM Providers
**Goal**: Connect to all 4 providers (Anthropic, OpenAI, Groq, MiMo), streaming responses

**Architecture**: All providers implement the same `LLMProvider` interface. Anthropic and OpenAI use their native SDKs. Groq and MiMo share `openai-compatible-client.ts` with different baseURLs. Each provider declares a `freeTier: boolean` flag for TUI display.

**Provider details**:

| Provider | SDK | Base URL | Auth | Free Tier |
|----------|-----|----------|------|-----------|
| Anthropic | `@anthropic-ai/sdk` | native | API key | No |
| OpenAI | `openai` | native | API key | No |
| Groq | openai-compatible | `https://api.groq.com/openai/v1` | API key | Yes |
| MiMo | openai-compatible | `https://token-plan-sgp.xiaomimimo.com/v1` | API key | Yes |

**MiMo configuration**:
- Model ID default: `mimo-v2.5` (confirm exact free-tier model id from Xiaomi's Token Plan docs before hardcoding)
- Region configurable: `cn` / `sgp` (default) / `ams` — maps to base URL
- Auth stored via keytar/0600-file (same as other providers)
- **Never reference or use the `mimo-free-api` reverse-proxy project** — that's a ToS violation and unstable

**Files to create**:
- `packages/providers/package.json`
- `packages/providers/tsconfig.json`
- `packages/providers/src/index.ts` — ProviderManager, registers all 4, `freeTier` flag in list output
- `packages/providers/src/types.ts` — `LLMProvider` interface with `freeTier: boolean`
- `packages/providers/src/openai.ts` — OpenAI (native SDK)
- `packages/providers/src/anthropic.ts` — Anthropic (native SDK)
- `packages/providers/src/openai-compatible-client.ts` — shared base for Groq/MiMo (baseURL + API key)
- `packages/providers/src/groq.ts` — Groq (openai-compatible, free tier)
- `packages/providers/src/mimo.ts` — MiMo (openai-compatible, free tier, region config)

**Verify**: `absolute provider list` shows all 4 providers with free tier flags. `absolute provider test` confirms connection. Chat works with real LLM.

### Phase 6: Memory + Chat Integration
**Goal**: Memory system fully integrated into chat flow

**Files to update**:
- `packages/tui/src/hooks/useChat.ts` — add SYNC context detection (via EmbeddingProvider + sqlite-vec) before LLM call, with timeout fallback
- `packages/tui/src/hooks/useMemory.ts` — add ASYNC memory storage (writes to both memories table and memory_vectors vec0 table)
- `packages/tui/src/hooks/useChat.ts` — inject memory context into system prompt
- `packages/tui/src/components/memory-badge.tsx` — show memory indicator

**Verify**: Start a session, discuss a topic, end session, start new session — AI remembers previous context.

### Phase 7: Polish + Advanced Features
**Goal**: Session browser, memory viewer, settings UI, export/import, local embedding provider

**Files to create/update**:
- `packages/tui/src/screens/sessions.tsx`
- `packages/tui/src/screens/memories.tsx`
- `packages/tui/src/screens/settings.tsx` — includes `/embedded-config` slash command
- `packages/tui/src/components/sidebar.tsx`
- `packages/cli/src/commands/memory.ts`
- `packages/cli/src/commands/config.ts` — `config embedding` subcommand
- `packages/cli/src/commands/migrate.ts` — `migrate embeddings` command
- `packages/cli/src/commands/provider.ts`
- `packages/cli/src/commands/doctor.ts` — includes embedding provider validation
- `packages/core/src/embedding/local-provider.ts` — `@xenova/transformers` implementation

**Verify**: Full CLI with all commands, TUI with session/memory browsing, embedding provider switching with migration.

## Key Design Decisions

1. **Memory is transparent**: The AI doesn't call memory tools. The CLI handles everything — inject context before LLM call, extract and store after response. This is why the MCP approach failed.

2. **Progressive loading**: Only load headers (~500 bytes) at session start. Drill down only when the AI needs more context.

3. **Two-tier processing**: SYNC ops (embedding, similarity) block response with a hard timeout. ASYNC ops (keyword extraction, summarization) run after response is sent. A hung network call must never block the CLI from responding — if the embedding provider exceeds the timeout, fall back to "continue without context check."

4. **Adaptive threshold**: The system learns user behavior — more topic switches = higher threshold (less sensitive), more denials = lower threshold (more sensitive).

5. **Local-first**: Everything runs locally. Cloudflare Worker is only for embeddings (temporary — will move to local transformers.js).

6. **Model-agnostic**: Works with any LLM provider. Memory system doesn't depend on which model is used.

7. **EmbeddingProvider interface**: All embedding calls go through `EmbeddingProvider.embed(text): Promise<Float32Array>`. The Cloudflare Worker implementation (`cloudflare-provider.ts`) is the only file that knows about the HTTP endpoint. Switching to local transformers.js later requires changing only this one file — no other code depends on Cloudflare specifics. **Never store API tokens in SQLite tables or git-tracked files** — use OS keychain (keytar) with 0600-permission file fallback, stored outside the project directory.

8. **sqlite-vec for vector search**: Embeddings are stored in `vec0` virtual tables (`memory_vectors`, `goal_vectors`), not as raw BLOBs on the core tables. All similarity search uses `WHERE embedding MATCH ... ORDER BY distance` via sqlite-vec — no manual cosine similarity loops in JS. The `embedding BLOB` columns from the original D1 schema are removed; vector data lives exclusively in the virtual tables.

9. **Settings tables have distinct, non-overlapping roles**:
   - **`user_settings`**: Fixed, typed, core system state. One row per user. Columns are explicit and strongly typed (similarity thresholds, switch counts, etc.). Never add generic key-value pairs here.
   - **`settings`**: Generic key-value store for anything NOT covered by a dedicated `user_settings` column — user preferences, CLI config overrides, feature flags. Never duplicate a `user_settings` column here.
   - No third overlapping table. Future additions go into one of these two based on whether they need a typed column or a flexible KV pair.

10. **Embedding provider versioning**: The `embedding_metadata` singleton table tracks which model produced all vectors in the vec0 tables. On startup, `database.ts` checks three cases:
    - **No row** (fresh database): This is initialization, not a mismatch. INSERT the currently configured `EmbeddingProvider.modelId` and `dimensions` as the row and proceed normally.
    - **Row exists, matches configured provider**: Proceed normally.
    - **Row exists, does NOT match**: Refuse to start and print: "Embedding provider changed from X to Y. Run `absolute migrate embeddings` before continuing." Never silently mix vectors from two different model spaces.
    The migration (`migration.ts`) reads `content`/`description` text from every memory/goal, re-embeds with the new provider, drops and recreates vec0 tables at the new dimension, resets `user_settings.similarity_threshold` to 0.6 and zeroes switch counters (the adaptive threshold learned under the old embedding space is invalid), and updates `embedding_metadata`. Source text (`content`/`description`) must always be persisted alongside embeddings — it's the only way to re-embed without data loss.

11. **Embedding provider configuration**: The `absolute config embedding` CLI command and `/embedded-config` TUI slash command share a single implementation (not duplicated). Flow: show current state → prompt local vs. cloudflare → if cloudflare: prompt token (stored via keytar/0600 file) → if local: check cache, warn ~90MB download → compare modelId to embedding_metadata → if different: show confirmation with exact memory/goal counts → run migration → on cancel: revert to previous provider. Direct config file edits still trigger the startup guard from decision #10.

## Verification Strategy

After each phase:
1. Run the CLI and verify the specific feature works
2. Check SQLite database for correct data storage
3. Test error handling (no API key, bad config, etc.)
4. Verify no blocking of the main UI thread during async operations

## Notes

- The existing code at `/media/saad/usb/memory-system-code/` is the reference. We're rebuilding it as a native module, not an MCP server.
- The embedding Worker stays as-is temporarily. Later we'll integrate `@xenova/transformers` for local embeddings.
- The TUI design will be custom (not copying opencode's UI), but the command structure is inspired by it.
- **MiMo uses Xiaomi's official Token Plan API** (Singapore endpoint by default). The `mimo-free-api` reverse-proxy project (web-scraping xiaomimimo.com's frontend) is a ToS violation and must never be used or referenced in this codebase.
