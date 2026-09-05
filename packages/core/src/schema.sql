-- ============================================================
-- CORE TABLES
-- ============================================================

-- memories: hierarchical memory storage (subject -> action -> sub_action -> prompt_answer)
CREATE TABLE IF NOT EXISTS memories (
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

-- goals: goal tracking hierarchy (goal -> sub_goal -> task)
CREATE TABLE IF NOT EXISTS goals (
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
CREATE TABLE IF NOT EXISTS sessions (
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
CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(
    memory_id TEXT PRIMARY KEY,
    embedding FLOAT[768]
);

-- goal_vectors: KNN vector index for goal similarity search.
-- Same query pattern as memory_vectors.
CREATE VIRTUAL TABLE IF NOT EXISTS goal_vectors USING vec0(
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
CREATE TABLE IF NOT EXISTS embedding_metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),
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
CREATE TABLE IF NOT EXISTS user_settings (
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
-- dedicated column in user_settings -- user preferences, CLI config
-- overrides, feature flags. Never duplicate a user_settings column here.
CREATE TABLE IF NOT EXISTS settings (
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
