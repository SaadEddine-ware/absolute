-- Migration 002: Fix FOREIGN KEY constraints on memories, goals, and sessions
--
-- Problem: Old databases were created with FK constraints that crash
-- on normal delete operations (memories.goal_id, goals.parent_goal_id).
-- SQLite cannot ALTER FOREIGN KEY constraints; tables must be recreated.
--
-- Circular FK chain: memories → goals → sessions → memories.
-- Renaming any one breaks the others' FK references.
-- Solution: create all three new tables first (empty), then copy data,
-- then drop old tables. FKs in new tables resolve to other new tables.
--
-- Behavior:
--   memories.goal_id → ON DELETE SET NULL (memory survives goal deletion)
--   goals.parent_goal_id → ON DELETE CASCADE (sub-goals deleted with parent)
--   sessions.root_subject_id → ON DELETE SET NULL (session survives memory deletion)

-- Rename old tables
ALTER TABLE memories RENAME TO memories_old;
ALTER TABLE goals RENAME TO goals_old;
ALTER TABLE sessions RENAME TO sessions_old;

-- Create all new tables (empty, FKs resolve to new table names)
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
    FOREIGN KEY (parent_id) REFERENCES memories(id),
    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Copy data from old tables to new tables
INSERT INTO sessions SELECT * FROM sessions_old;
INSERT INTO goals SELECT * FROM goals_old;
INSERT INTO memories SELECT * FROM memories_old;

-- Drop old tables
DROP TABLE memories_old;
DROP TABLE goals_old;
DROP TABLE sessions_old;
