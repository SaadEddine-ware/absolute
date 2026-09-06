-- Migration 004: sessions → memories/goals ON DELETE CASCADE
--
-- Problem: memories.session_id and goals.session_id have no ON DELETE
-- clause, so deleting a session that contains memories or goals throws
-- "FOREIGN KEY constraint failed" (reproduced in the FK sweep). A session
-- is the root container — an orphaned memory or goal with no session is
-- meaningless, so the session's delete cascades to its memories and goals
-- (and transitively to their children).
--
-- Same rename-recreate-copy-drop pattern as 002/003: sessions reference
-- memories (root_subject_id) and memories reference sessions, so all three
-- tables are recreated together. Foreign actions preserved from 002/003:
--   memories.parent_id     → CASCADE
--   memories.goal_id       → SET NULL
--   memories.session_id    → CASCADE   (NEW)
--   goals.parent_goal_id   → CASCADE
--   goals.session_id       → CASCADE   (NEW)
--   sessions.root_subject_id → SET NULL
--
-- Process note: recreating a table drops its indexes, so every migration
-- that recreates tables restores the full index set in the same file
-- (this is what bit us in 002 — the indexes were never recreated).

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

INSERT INTO sessions SELECT * FROM sessions_old;
INSERT INTO goals SELECT * FROM goals_old;
INSERT INTO memories SELECT * FROM memories_old;

DROP TABLE memories_old;
DROP TABLE goals_old;
DROP TABLE sessions_old;

-- Restore indexes (dropped by table recreation; see process note).
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_goal ON memories(goal_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_parent ON memories(parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_session ON goals(session_id);
CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_level ON goals(level);