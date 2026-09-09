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
- **SYNC** (blocks response, with hard timeout): embedding computation via `EmbeddingProvider` interface + sqlite-vec KNN search. Target <100ms local, <500ms network (`DEFAULT_TIMEOUT_MS = 500` in context-detect.ts). If the embedding call exceeds the timeout, the system falls back to "continue without context check" — a hung network call must never block the CLI from responding.
- **ASYNC** (fire-and-forget): keyword extraction, importance scoring, summarization — runs after response sent. *(Planned, Phase 6 — the current CLI has no chat flow yet.)*

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js (ESM) |
| Language | TypeScript |
| CLI Framework | Commander.js |
| Local Storage | better-sqlite3 + sqlite-vec 0.1.x (vector KNN), versioned SQL migrations |
| Embeddings | `EmbeddingProvider` interface → **Cloudflare** (Workers AI `@cf/baai/bge-base-en-v1.5`, 768 dims, via Worker) **or Local** (@huggingface/transformers, bge-base-en-v1.5 default). Both implemented; switchable with migration. Simultaneous/hybrid use is out of scope. |
| LLM Providers | *(Planned, Phase 5)* native `openai` + `@anthropic-ai/sdk`, plus shared `openai-compatible-client.ts` for Groq and MiMo free tier. NOT yet implemented. |
| Package Manager | npm workspaces |
| Build | tsup (fast TypeScript bundler) |

## Project Structure (actual state)

```
F:\absolute\
├── package.json                    # Root workspace config (deps: sqlite-vec; optional: rollup win32/x64 msvc)
├── tsconfig.json                   # Base TypeScript config
├── .gitignore
│
├── packages/
│   ├── core/                       # Neural Memory Engine (complete, Phases 1-3)
│   │   ├── package.json            # deps: better-sqlite3, sqlite-vec, uuid; OPTIONAL: @huggingface/transformers
│   │   ├── tsconfig.json
│   │   ├── test/
│   │   │   └── phase3.test.mjs     # Phase 3 verify node:test harness (npm test)
│   │   ├── src/
│   │   │   ├── index.ts            # Public API exports
│   │   │   ├── database.ts         # better-sqlite3 open + sqlite-vec load + migration runner + startup guard
│   │   │   ├── migrations/         # Versioned SQL migrations (001-005), NOT a static schema.sql
│   │   │   │   ├── 001_initial.sql
│   │   │   │   ├── 002_goal_fk_ondelete.sql
│   │   │   │   ├── 003_memory_parent_fk_ondelete.sql
│   │   │   │   ├── 004_session_fk_ondelete.sql
│   │   │   │   └── 005_vector_cleanup_triggers.sql
│   │   │   ├── memory.ts           # CRUD for memories table
│   │   │   ├── goals.ts            # Goal tracking hierarchy
│   │   │   ├── sessions.ts         # Session management
│   │   │   ├── context-detect.ts   # [SYNC] Embedding + sqlite-vec KNN similarity + decision
│   │   │   ├── progressive-load.ts # Progressive loading (headers → details)
│   │   │   ├── adaptive-threshold.ts # Adaptive threshold (EMA) + getDecision
│   │   │   ├── cross-session.ts    # Cross-session memory linking
│   │   │   ├── retention.ts        # Memory retention/cleanup
│   │   │   ├── system-prompt.ts    # System prompt builder with memory context
│   │   │   ├── worker-management.ts# worker status / verify-match / migration impact helpers
│   │   │   ├── migration.ts        # Re-embed all memories/goals (provider switch)
│   │   │   ├── types.ts            # TypeScript interfaces (incl. EmbeddingMetadata)
│   │   │   └── embedding/
│   │   │       ├── types.ts        # EmbeddingProvider interface (modelId, dimensions, embed)
│   │   │       ├── cloudflare-provider.ts # Cloudflare Worker implementation (HTTP + Bearer)
│   │   │       ├── local-provider.ts      # @huggingface/transformers implementation (dynamic import)
│   │   │       └── huggingface-transformers.d.ts # ambient `declare module` so tsc never needs the real package
│   │   └── dist/                   # Compiled output (gitignored)
│   │
│   ├── cli/                        # CLI entry point (functioning; no TUI/LLM yet)
│   │   ├── package.json            # deps: @absolute/core, commander; OPTIONAL: keytar
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # Main entry, Commander setup
│   │       ├── commands/
│   │       │   ├── session.ts      # absolute session [start|list|continue|delete]
│   │       │   ├── config.ts       # absolute config [list|get|set|path]
│   │       │   ├── migrate.ts      # absolute migrate embeddings
│   │       │   └── worker.ts       # absolute worker [status|set cloud|set local] (embedding provider switch)
│   │       └── utils/
│   │           ├── config.ts       # Config file management (~/.config/absolute/config.json, DB path)
│   │           ├── auth.ts         # Credential storage (OS keychain via keytar, fallback 0600 file)
│   │           ├── prompt.ts       # Interactive confirm / password prompts
│   │           └── embedding.ts    # createAnyProvider(config) — picks Cloudflare/Local from config
│   │
│   └── tui/                        # Ink-based Terminal UI (complete, Phase 4)
│       ├── package.json            # deps: @absolute/core, ink, ink-text-input, react
│       ├── tsconfig.json
│       ├── tsup.config.ts          # bundles src/index.tsx
│       └── src/
│           ├── index.tsx           # runTui() + re-exports
│           ├── app.tsx             # root Ink component, wiring/slash-commands
│           ├── types.ts            # ChatMessage / ChatContext / MessageResponder
│           ├── screens/chat.tsx    # main chat screen
│           ├── components/         # message, input, status-bar
│           ├── hooks/              # useChat, useSession, useMemory
│           ├── lib/                # config + embedding (mirrors cli utils)
│           └── styles/theme.ts     # custom theme tokens
│
│   └── providers/                  # LLMProvider abstraction (complete, Phase 5)
│       ├── package.json            # deps: @anthropic-ai/sdk, openai (external)
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       ├── test/providers.test.mjs # registry/resolve/test-path unit tests
│       └── src/
│           ├── index.ts            # ProviderManager (registers all 4) + re-exports
│           ├── types.ts            # LLMProvider interface (complete/stream/freeTier)
│           ├── credentials.ts      # keytar→0600-file credential storage (shared)
│           ├── openai.ts           # OpenAI (native SDK, dynamic import)
│           ├── anthropic.ts        # Anthropic (native SDK, dynamic import)
│           ├── openai-compatible-client.ts # shared SSE client for Groq/MiMo
│           ├── groq.ts             # Groq (free tier)
│           └── mimo.ts             # MiMo (free tier, region-configurable)
│
├── workers/
│   └── embedding/                  # Cloudflare Embedding Worker (live)
│       ├── src/index.ts            # GET /api/health, POST /api/embed, Bearer auth, CORS
│       ├── wrangler.jsonc
│       ├── tsconfig.json
│       └── package.json            # (memory-api Worker is NOT built — optional/future)
│
└── bin/
    └── absolute                    # Shell wrapper (PLANNED — bin/ exists but is empty today)
```

## Core Memory Integration Flow

### 1. Session Start
```
absolute session start
  → Create new session in local SQLite
  → Load subject headers from recent sessions (progressive: headers only)
  → Build system prompt with memory context
  → Start TUI with chat interface        (TUI wired in Phase 4; LLM/memory wiring is Phase 5/6)
```

### 2. During Conversation (Per Prompt)
```
User sends: "Now build the REST API"     (PLANNED — Phase 6 wires this into chat)
  │
  ├── [SYNC, hard timeout 500ms]
  │   ├── EmbeddingProvider.embed("Now build the REST API")
  │   │   → Cloudflare provider: HTTP call to Worker / Local provider: transformers.js
  │   │   → If timeout: skip context check, proceed with "continue"
  │   ├── sqlite-vec KNN: find top-K most similar memories/goals
  │   ├── Cosine similarity with active goal embedding
  │   ├── Compare to adaptive threshold (default 0.6)
  │   └── Decision: continue / ask / switch (getDecision: >0.8 continue, ≤threshold switch, else ask)
  │
  ├── [LLM] AI responds using loaded context
  │
  └── [ASYNC fire-and-forget, after response sent]
      ├── Extract keywords from AI response (local regex, no LLM call)
      ├── Score importance based on type + position
      ├── Store memory in SQLite + sqlite-vec vector row
      └── Update goal progress
```

> Status: the embedding + KNN + decision logic in `context-detect.ts` and the migration/switch machinery are **implemented** (Phases 1-3) and covered by `packages/core/test/phase3.test.mjs`. Everything inside the chat loop itself (embed call in-flight, LLM call, async storage) is **Phase 6** and not yet built.

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

## Commands (actual, implemented)

```bash
# Session management
absolute session start                    # New session
absolute session list                     # List all sessions
absolute session continue <id>            # Resume session
absolute session delete <id>              # Delete session

# Configuration
absolute config list                      # List all config (JSON)
absolute config get <key>                 # Get config value (dot notation)
absolute config set <key> <value>         # Set config value (dot notation, JSON-aware)
absolute config path                      # Show config file path

# Embedding provider management
absolute worker status                    # Show embedding mode + vector health / mismatch detection
absolute worker set cloud <url>           # Configure Cloudflare Worker (probes, then migrates if changed)
absolute worker set local                 # Configure local embeddings (transformers.js)
absolute migrate embeddings               # Re-embed all memories/goals with the configured provider

# Chat / TUI
absolute                                  # Launch TUI chat (stdin must be a TTY; Phase 4)

# LLM provider management (Phase 5)
absolute provider list                    # Show all providers + free tier + configured status
absolute provider set <id> [key]          # Store API key + set active provider
absolute provider test <id>               # Test a provider connection (tiny prompt)

# Planned (not yet implemented)
absolute memory search|list|recall|stats|cleanup
absolute doctor                           # health check
absolute export [session-id] / absolute import <file>
```

## Configuration File

Location: `~/.config/absolute/config.json` (managed by `packages/cli/src/utils/config.ts`).
Database path: `~/.local/share/absolute/absolute.db`.

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "memory": {
    "embeddingProvider": "cloudflare",        // "cloudflare" | "local"
    "embeddingWorkerUrl": "https://embedding.<your-subdomain>.workers.dev",
    "embeddingModelId": "bge-base-en-v1.5",
    "embeddingDimensions": 768,
    "embeddingCacheDir": "~/.cache/absolute/embeddings",  // local mode only
    "similarityThreshold": 0.6,
    "maxTokensPerSession": 4000,
    "retentionDays": 30
  },
  "theme": "default"
}
```

Set by `absolute worker set cloud|local` (which writes `embeddingProvider`, `embeddingModelId`, `embeddingDimensions`, and the Worker URL / cache dir as appropriate). The generic `config set <key> <value>` handles everything else.

## SQLite Schema (Local)

Uses `better-sqlite3` with the `sqlite-vec` extension loaded at connection open
(`loadSqliteVec(db)`) for native vector similarity search (KNN). The extension provides a `vec0` virtual
table that handles distance internally.

Schema lives as **versioned migrations** in `packages/core/src/migrations/` (001 → 005), NOT a single
static file. `database.ts` (`runMigrations`) applies pending files in order inside a transaction, records
each in the `schema_migrations` table, and disables `foreign_keys` around the whole pass (migrations
recreate tables, which SQLite only allows with FKs off).

| Migration | What it does |
|-----------|--------------|
| 001 | Initial schema: core tables (memories/goals/sessions), vec0 tables (FLOAT[768]) with embedding_metadata, user_settings + settings, indexes, schema_migrations tracking |
| 002 | Fix FK crashes on delete: `memories.goal_id → SET NULL`, `goals.parent_goal_id → CASCADE`, `sessions.root_subject_id → SET NULL`. Recreates all three tables (rename-recreate-copy-drop). **Silently dropped the 001 indexes — see 003.** |
| 003 | `memories.parent_id → CASCADE` (hierarchy). Recreates tables again and **restores all indexes** — process note: recreating a table drops its indexes, so every migration that recreates tables must restore the full index set. |
| 004 | `memories.session_id → CASCADE`, `goals.session_id → CASCADE` — deleting a session now deletes its memories/goals (FK sweep result). Recreates tables + restores indexes. |
| 005 | Vector cleanup triggers: `AFTER DELETE ON memories` → delete `memory_vectors` row; `AFTER DELETE ON goals` → delete `goal_vectors` row. Guarantees no orphan vectors for ANY delete path (cascade or raw SQL). Process note: triggers, like indexes, must be recreated after future table-recreating migrations. |

Cumulative schema (as of 005):

```sql
-- CORE TABLES
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
    FOREIGN KEY (parent_id) REFERENCES memories(id) ON DELETE CASCADE,
    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

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
    FOREIGN KEY (parent_goal_id) REFERENCES goals(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    root_subject_id TEXT,
    summary TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (root_subject_id) REFERENCES memories(id) ON DELETE SET NULL
);

-- VECTOR STORAGE (sqlite-vec)  — FLOAT[768] matches bge-base-en-v1.5 (768 dims)
CREATE VIRTUAL TABLE memory_vectors USING vec0(memory_id TEXT PRIMARY KEY, embedding FLOAT[768]);
CREATE VIRTUAL TABLE goal_vectors USING vec0(goal_id TEXT PRIMARY KEY, embedding FLOAT[768]);

-- EMBEDDING METADATA (migration safety)
CREATE TABLE embedding_metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    model_id TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- SETTINGS TABLES (two separate tables, distinct roles)
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

CREATE TABLE settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, setting_key)
);

-- INDEXES (must be restored after any table-recreating migration)
CREATE INDEX idx_memories_session ON memories(session_id);
CREATE INDEX idx_memories_goal ON memories(goal_id);
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_parent ON memories(parent_id);
CREATE INDEX idx_goals_session ON goals(session_id);
CREATE INDEX idx_goals_parent ON goals(parent_goal_id);
CREATE INDEX idx_goals_status ON goals(status);
CREATE INDEX idx_goals_level ON goals(level);

-- VECTOR CLEANUP TRIGGERS (must be recreated after any table-recreating migration)
CREATE TRIGGER trg_memory_vectors_cleanup AFTER DELETE ON memories FOR EACH ROW
  BEGIN DELETE FROM memory_vectors WHERE memory_id = OLD.id; END;
CREATE TRIGGER trg_goal_vectors_cleanup AFTER DELETE ON goals FOR EACH ROW
  BEGIN DELETE FROM goal_vectors WHERE goal_id = OLD.id; END;
```

### sqlite-vec Query Pattern

Used in `context-detect.ts` (`searchSimilarMemories`, `searchSimilarGoals`). The vec0 plan
**requires a `k = ?` constraint** on KNN queries; plain `LIMIT` fails with
"A LIMIT or 'k = ?' constraint is required on vec0 knn queries", and **numbered parameters
(`?1`/`?2`) break sqlite-vec's param rewriting** ("Too many parameter values were provided").
Use plain positional `?`. `k` is clamped to 1..50 via `clampTopK`.

```sql
-- Find top-K memories most similar to a query embedding (session-scoped)
SELECT mv.memory_id, mv.distance, m.content, m.type, m.importance, m.tokens_est
FROM memory_vectors mv
JOIN memories m ON m.id = mv.memory_id
WHERE mv.embedding MATCH ?
  AND k = ?           -- k in 1..50 (required by vec0, positional placeholders only)
  AND m.session_id = ?   -- scope to current session (omitted for unscoped search)
ORDER BY mv.distance ASC;

-- Same pattern for goals (searchSimilarGoals):
SELECT gv.goal_id, gv.distance, g.description, g.status, g.level
FROM goal_vectors gv
JOIN goals g ON g.id = gv.goal_id
WHERE gv.embedding MATCH ? AND k = ? AND g.session_id = ?
ORDER BY gv.distance ASC;
```

**Do not** reimplement cosine similarity in JS for search. The sqlite-vec
extension handles this natively. The `cosineSimilarity()` function in
`context-detect.ts` is only used for the active-goal decision comparison outside of SQLite.

**Critical constraint**: `content` (memories) and `description` (goals) text must
always be persisted alongside any embedding. This is the only way to re-embed
when the embedding provider changes — without the source text, vectors from the
old model space are useless and must be deleted.

## Implementation Phases

### Phase 1: Foundation (Core + CLI skeleton) — COMPLETE
**Goal**: Bootable CLI with session management and local SQLite

Shipped:
- npm workspaces (core + cli), tsup build, tsconfig base.
- `openDatabase` (better-sqlite3 + WAL + `foreign_keys ON` + sqlite-vec load),
  migration runner, startup embedding guard, session CRUD.
- CLI commands: session (start/list/continue/delete), config (list/get/set/path), migrate embeddings.
- Changed shape during implementation: the embedding provider surface was split out into its own
  `absolute worker status|set cloud|local` command family (worker.ts) later, in the sync with Phase 3;
  the install-blocker saga made `@huggingface/transformers` an optionalDependency and pinned the
  `@rollup/rollup-win32-x64-msvc` optionalDependency so `npm install` cannot fail on Linux/Windows.

**Verify**: `absolute session start` creates a session in SQLite, `absolute session list` shows it, AND a fresh database initializes `embedding_metadata` automatically without requiring migration. — PASSED.

### Phase 2: Memory Engine — COMPLETE
**Goal**: Full memory CRUD with hierarchical storage

Shipped:
- memory.ts, goals.ts, sessions.ts CRUD with hierarchical types
  (subject → action → sub_action → prompt_answer; goal → sub_goal → task).
- The FK sweep: deleting goals/sessions/parents failed on FK constraints, which **changed the schema
  approach from a static schema to versioned migrations**; 002-004 fix FK actions
  (`ON DELETE CASCADE/SET NULL`) via table recreation, 005 adds vector-cleanup triggers
  (guaranteed zero orphan vectors on every delete path, verified by sweep).

**Verify**: Store and retrieve memories with proper hierarchy. — PASSED.

### Phase 3: Context Detection + System Prompt — COMPLETE
**Goal**: SYNC context detection via EmbeddingProvider + sqlite-vec, system prompt injection

Shipped:
- `context-detect.ts` (embedWithTimeout + KNN + goal comparison + getDecision),
  `progressive-load.ts`, `adaptive-threshold.ts` (EMA), `system-prompt.ts`,
  `worker-management.ts` (worker status / verify-match / migration helpers), `migration.ts`.
- Cloudflare + Local embedding providers (worker-management surfaced as `absolute worker status|set`).
- Durable verification harness `packages/core/test/phase3.test.mjs` (node:test, `npm test`).
- Real bugs found while verifying (all fixed): vec0 requires `k = ?` (positional) not `LIMIT`;
  decision guard wrongly turned cos=0 into `continue`; `getGoalVector` byte-reinterpretation bug;
  `searchSimilarGoals` missing the documented session filter; startup guard ignoring dimension mismatch.

**Verify**: Context detection works — similar prompts return "continue", different topics return "ask" or "switch". Timeout fallback works when Worker is unreachable. Startup guard rejects mismatched embedding provider. — PASSED (5/5).

### Phase 4: TUI (Chat Interface) — COMPLETE
**Goal**: Working chat TUI with Ink

Shipped:
- `packages/tui` workspace (ink ^5, react ^18, ink-text-input ^6, tsup dts).
- Chat screen (`screens/chat.tsx`) with terminal-height windowed message list,
  prefixed input (`TextInput`), status bar, and header.
- `useSession`: async-opens the local SQLite database (mirrors cli config/provider
  logic so tui never depends on cli), creates or resumes the most recent session,
  exposes `startNew` / `switchSession`.
- `useMemory`: Phase-4 scope — surfaces memory header count + estimated token
  budget (via the core `loadSessionContext` progressive-load path) for the status
  bar, with a `refresh()` seam for Phase 6 write-back.
- `useChat`: message store with a pluggable `MessageResponder` seam. Ships with
  `createStubResponder()` — a deterministic echo that acknowledges session id
  and char count (no real LLM yet; Phase 5 fills this seam).
- `/help`, `/new`, `/clear`, `/quit` slash commands; ctrl-c / ctrl-d clean exit
  via `useApp().exit()`.
- `absolute` (no subcommand) now launches the TUI. Non-TTY exits cleanly with a
  message rather than a React stack dump.
- The tui package types are re-exported for downstream consumers.

**Verify**: `absolute` launches TUI, user can type messages, see responses. — PASSED (stub responder).

### Phase 5: LLM Providers — COMPLETE
**Goal**: Connect to all 4 providers (Anthropic, OpenAI, Groq, MiMo), streaming responses

Shipped:
- `packages/providers` workspace. `LLMProvider` interface (`complete` full-text,
  `stream` deltas, `isConfigured`, `saveKey`, `freeTier`).
- `ProviderManager` registers all four: openai, anthropic, groq, mimo —
  the openai/mlm-free-tier endpoints are thin HTTP, so Groq and MiMo share a
  raw-fetch `OpenAICompatibleProvider` (no `openai` SDK needed for them). The
  native SDKs (`openai`, `@anthropic-ai/sdk`) are dynamically imported and
  marked external so they're only loaded when that provider is actually used.
- Credentials stored via the same keytar→0600-file strategy as the embedding
  worker (`credentials.ts` inside providers, shared by CLI and TUI).
- CLI: `absolute provider list` (free-tier flags + configured status),
  `absolute provider set <id> [key]` (stores key, sets active), `absolute
  provider test <id>` (sends a tiny prompt, measures latency).
- TUI: `useChat` resolves the configured provider (falls back to the stub if
  none is set or configured, so chat never hard-fails); the status bar shows the
  active provider id.
- Unit tests `packages/providers/test/providers.test.mjs` (registry, resolve,
  unknown/unconfigured test paths).

**Verify**: `absolute provider list` shows all 4 providers with free tier flags. `absolute provider test` confirms connection. Chat works with real LLM. — PASSED (list + test wiring verified; live LLM call needs a real API key).

### Phase 6: Memory + Chat Integration — COMPLETE
**Goal**: Memory system fully integrated into chat flow

**Files created/updated**:
- `packages/core/src/context-detect.ts` — `CrossSessionResult` merged into `detectContext` via new `crossSessionTopK` option; new `searchSimilarMemoriesGlobal` (KNN across all sessions, optional exclude)
- `packages/core/src/system-prompt.ts` — `relevantMemories` + `contextNote` inputs, `RELEVANT MEMORIES` section + trailing note injected into system prompt
- `packages/core/src/cross-session.ts`, `src/index.ts` — `extractKeywords` exported; `searchSimilarMemoriesGlobal` + `extractKeywords` public exports
- `packages/tui/src/lib/memory-pipeline.ts` — `detectSessionContext` (SYNC, 500ms timeout, fallback base context), `storeExchangeMemory` (ASYNC store: `prompt_answer` memory + keywords + importance + embedding), `buildNextMessages`, `scoreImportance` (directives +3 / long +1 / short −1, clamp 1..10)
- `packages/tui/src/hooks/useChat.ts` — SYNC context detection before LLM call, memory-aware system prompt over `LLMMessage[]`, ASYNC store after completed non-error response, per-send AbortController
- `packages/tui/src/hooks/useMemory.ts` — ASYNC writer (`store(exchange)`) on shared db/version state
- `packages/tui/src/components/memory-badge.tsx` + `components/status-bar.tsx` + `screens/chat.tsx` — live memory indicator (`MEM n · ~tok`)
- `packages/tui/src/types.ts` — `MessageResponder.respond(messages: LLMMessage[], ctx, handlers)` contract change

**Verify**: Start a session, discuss a topic, end session, start new session — AI remembers previous context. — PASSED (headless smoke test: exchange stored ASYNC w/ keywords + importance, new session SYNC recall surfaced cross-session memory, injected into system prompt; core 11/11; all typechecks + builds green). Live chat verify deferred to real terminal with API key.

### Phase 7: Polish + Advanced Features — COMPLETE
**Goal**: Session browser, memory viewer, settings UI, export/import, provider polish

**Files to create/update**:
- `packages/tui/src/screens/sessions.tsx`, `memories.tsx`, `settings.tsx` (includes `/embedded-config` slash command)
- `packages/tui/src/components/sidebar.tsx`
- `packages/cli/src/commands/memory.ts`, `commands/provider.ts`, `commands/doctor.ts`, `commands/export.ts`, `commands/import.ts`
- `packages/cli/src/commands/config.ts` — [note: the embedding switch already lives in `worker set cloud|local`; `/embedded-config` will share the same core helpers from `worker-management.ts`]
- `packages/cli/src/commands/migrate.ts` — already exists; extend if needed
- `bin/absolute` — shell wrapper script
- `README.md`

**Verify**: Full CLI with all commands, TUI with session/memory browsing, embedding provider switching with migration.

### Phase 8: Goal Tracking + Hybrid Confirmation UI — NOT STARTED
**Goal**: Wire up the goal-tracking and hybrid-confirmation mechanism that context-detect.ts and adaptive-threshold.ts already compute but Phase 6 does not surface. This was the original defining idea of the project (see ARCHITECTURE.md's "Key Innovation: Goal-Tracked Context Switching") — Phase 6 shipped similarity-based memory recall only; this phase closes the gap deliberately, not by accident.

**Background**: `detectContext()` already returns a `decision` field ('continue' | 'ask' | 'switch'), but memory-pipeline.ts's `detectSessionContext()` currently discards it. No code path creates a `goal` row from live chat, so `renderGoalHeaders()` in the system prompt is always empty in practice, and the adaptive threshold's confirm/reject counters never get real data (they only update from a user's actual answer to an "are we still on X?" prompt, which doesn't exist yet).

**Files to update**:
- `packages/tui/src/lib/memory-pipeline.ts` — surface `result.decision` from `detectSessionContext`'s return value instead of discarding it
- `packages/tui/src/hooks/useChat.ts` — on `decision === 'switch'` with no active goal yet, auto-create a goal from the prompt (first-time, no confirmation needed). On `decision === 'ask'`, pause the send flow and surface a confirmation prompt to the user before proceeding.
- `packages/tui/src/components/confirm-prompt.tsx` (new) — inline TUI confirmation UI: "Still working on [goal]? (y/n)" that doesn't break the chat scroll/input flow.
- `packages/core/src/adaptive-threshold.ts` — wire the user's y/n answer to `switch_confirmed_count`/`switch_rejected_count` (the EMA update logic already exists from Phase 3; it just has never received real input).

**Design questions to resolve before implementation** (answer these in PLAN.md, not just in code comments):
1. What exactly triggers first-goal creation — the first message of a session, or an explicit signal in the prompt? Needs a concrete rule.
2. During an active LLM stream, can a confirmation prompt interrupt, or does it only ever appear before the next send() begins?
3. If the user ignores/dismisses the confirmation, what's the default (treat as reject, treat as confirm, or block further input)?

**Verify**: Have two clearly different conversations in one session back-to-back; the second one triggers an 'ask' or 'switch' decision and the TUI surfaces it correctly. Confirm/reject a few times and verify `user_settings.similarity_threshold` actually moves via the adaptive EMA (previously untestable end-to-end since nothing fed it real answers).

## Key Design Decisions

1. **Memory is transparent**: The AI doesn't call memory tools. The CLI handles everything — inject context before LLM call, extract and store after response. This is why the MCP approach failed.

2. **Progressive loading**: Only load headers (~500 bytes) at session start. Drill down only when the AI needs more context.

3. **Two-tier processing**: SYNC ops (embedding, similarity) block response with a hard timeout. ASYNC ops (keyword extraction, summarization) run after response is sent. A hung network call must never block the CLI from responding — if the embedding provider exceeds the timeout, fall back to "continue without context check".

4. **Adaptive threshold**: The system learns user behavior — more topic switches = higher threshold (less sensitive), more denials = lower threshold (more sensitive). EMA over a signal derived from the confirmation rate; clamped to 0.3..0.9, default 0.6.

5. **Local-first, but BOTH embedding providers are first-class**: Cloudflare (Workers AI) and local (transformers.js) are both implemented today. The active one is configured via `absolute worker set cloud|local` / `absolute worker status`, and switching through that path always runs the migration. **Simultaneous/hybrid use is explicitly out of scope** — vector spaces across models are incompatible, so this is switchable-with-migration only. The startup guard and `worker status` both enforce that no two model spaces are ever mixed.

6. **Model-agnostic**: Works with any LLM provider. Memory system doesn't depend on which model is used. (LLM layer is Phase 5.)

7. **EmbeddingProvider interface**: All embedding calls go through `EmbeddingProvider.embed(text): Promise<Float32Array>`, which is exactly three fields: `modelId`, `dimensions`, `embed` (`embedding/types.ts`). `cloudflare-provider.ts` knows the HTTP endpoint; `local-provider.ts` knows transformers.js. Nothing else depends on provider specifics. On startup and on every detection the provider's `dimensions` is checked against the DB. **Never store API tokens in SQLite tables or git-tracked files** — use OS keychain (keytar) with 0600-permission file fallback (`packages/cli/src/utils/auth.ts`), stored outside the project directory.

8. **sqlite-vec for vector search**: Embeddings are stored in `vec0` virtual tables (`memory_vectors`, `goal_vectors`), not as raw BLOBs on the core tables. All similarity search uses `WHERE embedding MATCH ? AND k = ? ORDER BY distance` (positional placeholders; `LIMIT`/numbered params are rejected by the vec0 planner). The `embedding BLOB` columns from the original D1 schema are removed; vector data lives exclusively in the virtual tables. Vector rows are kept consistent with the core tables by the 005 triggers, so no delete path can orphan them.

9. **Settings tables have distinct, non-overlapping roles**:
   - **`user_settings`**: Fixed, typed, core system state. One row per user. Columns are explicit and strongly typed (similarity thresholds, switch counts, etc.). Never add generic key-value pairs here.
   - **`settings`**: Generic key-value store for anything NOT covered by a dedicated `user_settings` column — user preferences, CLI config overrides, feature flags. Never duplicate a `user_settings` column here.
   - No third overlapping table. Future additions go into one of these two based on whether they need a typed column or a flexible KV pair.

10. **Embedding provider versioning**: The `embedding_metadata` singleton tracks which model + dimension produced all vectors in the vec0 tables. On startup (`validateEmbeddingMetadata` in database.ts) and on every context detection, three cases are checked:
    - **No row** (fresh database): initialization, not a mismatch. INSERT the configured `modelId` + `dimensions` and proceed.
    - **Row matches configured provider (model_id AND dimensions)**: Proceed.
    - **Row does NOT match (different model_id OR different dimensions)**: Refuse to start, print "Embedding provider mismatch: database was built with X (d dims) but the current provider is Y (d dims). Run `absolute migrate embeddings` before continuing.", and exit. Never silently mix vectors from two model spaces.
    The migration (`migration.ts`) reads `content`/`description` from every memory/goal, re-embeds with the new provider, drops+recreates vec0 tables at the new dimension **or** clears them if dimensions are unchanged, resets `user_settings.similarity_threshold` to 0.6 and zeroes switch counters (the adaptive threshold learned under the old embedding space is invalid), and updates `embedding_metadata`. The startup guard is bypassed (`skipEmbeddingValidation`) only by the maintenance flows (`migrate embeddings`, `worker set/status`) that are themselves performing the switch.

11. **Embedding provider switching**: Implemented as `absolute worker set cloud <url> | local` (and surfaced by `absolute worker status`). Flow: probe the target provider (Cloudflare: probe the Worker endpoint; local: optional `--verify` real-model probe) → compare modelId + dimensions against `embedding_metadata` → if unchanged, just persist the config → if changed, show exact memory/goal counts (+ whether vec0 tables will be recreated), confirm, run migration, then persist the config (on decline/cancel, nothing is changed and the config remains on the previous provider). The TUI's planned `/embedded-config` slash command (Phase 7) will reuse the same core helpers instead of duplicating.

## Verification Strategy

After each phase:
1. Run the CLI and verify the specific feature works
2. Check SQLite database for correct data storage
3. Test error handling (no API key, bad config, etc.)
4. Verify no blocking of the main UI thread during async operations

Automated regression: `npm test` in packages/core (build + node:test) covers Phase 3 context detection,
timeout fallback, startup guard, session-filtered goal search, the vec0 KNN path, and Phase 6 cross-session
recall / system-prompt injection / keyword extraction.

## Notes

- The existing code at `/media/saad/usb/memory-system-code/` is the reference. We're rebuilding it as a native module, not an MCP server.
- Local embeddings are implemented now (`packages/core/src/embedding/local-provider.ts`) via `@huggingface/transformers` (NOT `@xenova/transformers`, which is the old package name). It is an `optionalDependency`: `npm install @huggingface/transformers` is required before first local use, because the package's transitive `onnxruntime-node` has a fatal postinstall on Linux (microsoft/onnxruntime#24918 / #24770). The dynamic import + ambient `huggingface-transformers.d.ts` means build/typecheck never require it installed.
- The Cloudflare embedding Worker (`workers/embedding/`) is fully functional: `GET /api/health`, `POST /api/embed` (`{ text }` → `{ embedding (base64 float32), dimensions, model }`), optional `Bearer` token via `EMBEDDING_TOKEN`, CORS, model override via `EMBEDDING_MODEL` (default `@cf/baai/bge-base-en-v1.5`, 768 dims), requires the Workers AI binding.
- The TUI design will be custom (not copying opencode's UI), but the command structure is inspired by it.
- **MiMo uses Xiaomi's official Token Plan API** (Singapore endpoint by default). The `mimo-free-api` reverse-proxy project (web-scraping xiaomimimo.com's frontend) is a ToS violation and must never be used or referenced in this codebase.