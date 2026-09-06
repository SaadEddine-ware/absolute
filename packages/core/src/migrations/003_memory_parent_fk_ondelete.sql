-- Migration 003: memories.parent_id → ON DELETE CASCADE
--
-- Problem: memories.parent_id has no ON DELETE clause. Deleting a memory
-- with children (sub-actions under an action, etc.) throws "FOREIGN KEY
-- constraint failed". Hierarchy is Subject → Action → Sub-action →
-- Prompt/Answer; an orphaned child with no parent is meaningless, so the
-- parent's delete cascades to its descendants.
--
-- Same rename-recreate-copy-drop pattern as migration 002. memories
-- self-references via parent_id, and sessions.root_subject_id references
-- memories, so renaming just `memories` would rewire that FK to the
-- renamed table. Recreate all three tables (goals, sessions too) exactly
-- as migration 002 left them. The migration runner already disables
-- foreign_keys around all migrations.
--
-- Only the parent_id constraint changes; memories.goal_id keeps the
-- ON DELETE SET NULL from migration 002, sessions.root_subject_id keeps
-- SET NULL. Migration 002 also silently dropped the named indexes from
-- 001 (only PRIMARY KEY autoindexes survived) — restore them here.

ALTER TABLE memories RENAME TO memories_old;
ALTER TABLE goals RENAME TO goals_old;
ALTER TABLE sessions RENAME TO sessions_old;

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
    FOREIGN KEY (session_id) REFERENCES sessions(id)
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
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

INSERT INTO sessions SELECT * FROM sessions_old;
INSERT INTO goals SELECT * FROM goals_old;
INSERT INTO memories SELECT * FROM memories_old;

DROP TABLE memories_old;
DROP TABLE goals_old;
DROP TABLE sessions_old;

-- Restore the indexes migration 002 dropped when it recreated the tables.
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_goal ON memories(goal_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_parent ON memories(parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_session ON goals(session_id);
CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_level ON goals(level);