-- Migration 005: vector cleanup triggers
--
-- FK CASCADE (002-004) deletes memories/goals rows at the DB level, but
-- the vec0 virtual tables (memory_vectors / goal_vectors) have no FK and
-- are not deleted by a cascade. Any delete path — deleteMemory/deleteGoal,
-- deleteSession (session cascade), or a raw SQL delete — would otherwise
-- leave orphan vector rows.
--
-- App code also cleans vectors explicitly before deleting, but that only
-- covers the callers it knows about. These triggers guarantee vector
-- cleanup for EVERY delete path (including future ones), so
-- memory_vectors.goal_id never references a row that no longer exists.
--
-- Search queries JOIN memory_vectors/goal_vectors against memories/goals
-- (INNER JOIN), so orphans can never surface as results — but keeping the
-- tables clean is correct hygiene instead of relying on that filter.
--
-- Process note: like indexes, these triggers must be recreated after any
-- migration that recreates the memories/goals tables.

CREATE TRIGGER trg_memory_vectors_cleanup
AFTER DELETE ON memories
FOR EACH ROW BEGIN
  DELETE FROM memory_vectors WHERE memory_id = OLD.id;
END;

CREATE TRIGGER trg_goal_vectors_cleanup
AFTER DELETE ON goals
FOR EACH ROW BEGIN
  DELETE FROM goal_vectors WHERE goal_id = OLD.id;
END;