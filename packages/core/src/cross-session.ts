import type Database from 'better-sqlite3';
import type { Memory } from './types.js';

export interface LinkedMemory {
  memory: Memory;
  linkType: 'sibling' | 'cousin' | 'thread';
  distance: number;
}

export interface MemoryThread {
  subject: Memory;
  actions: Memory[];
  subActions: Memory[];
}

export function findLinkedMemories(
  db: Database.Database,
  memoryId: string
): LinkedMemory[] {
  const memory = db
    .prepare('SELECT * FROM memories WHERE id = ?')
    .get(memoryId) as Memory | undefined;

  if (!memory) return [];

  const results: LinkedMemory[] = [];

  if (memory.parent_id) {
    const siblings = db
      .prepare(
        'SELECT * FROM memories WHERE parent_id = ? AND id != ? ORDER BY created_at ASC'
      )
      .all(memory.parent_id, memoryId) as Memory[];

    for (const sib of siblings) {
      results.push({ memory: sib, linkType: 'sibling', distance: 1 });
    }

    const parent = db
      .prepare('SELECT * FROM memories WHERE id = ?')
      .get(memory.parent_id) as Memory | undefined;

    if (parent?.parent_id) {
      const cousins = db
        .prepare(
          `SELECT * FROM memories WHERE parent_id IN (
            SELECT id FROM memories WHERE parent_id = ? AND id != ?
          ) AND id != ? ORDER BY created_at ASC`
        )
        .all(parent.parent_id, parent.id, memoryId) as Memory[];

      for (const cousin of cousins) {
        results.push({ memory: cousin, linkType: 'cousin', distance: 2 });
      }
    }
  }

  const children = db
    .prepare(
      'SELECT * FROM memories WHERE parent_id = ? ORDER BY created_at ASC'
    )
    .all(memoryId) as Memory[];

  for (const child of children) {
    results.push({ memory: child, linkType: 'sibling', distance: 1 });
  }

  return results;
}

export function createMemoryThread(
  db: Database.Database,
  subjectId: string
): MemoryThread | null {
  const subject = db
    .prepare("SELECT * FROM memories WHERE id = ? AND type = 'subject'")
    .get(subjectId) as Memory | undefined;

  if (!subject) return null;

  const actions = db
    .prepare(
      "SELECT * FROM memories WHERE parent_id = ? AND type = 'action' ORDER BY created_at ASC"
    )
    .all(subjectId) as Memory[];

  const actionIds = actions.map((a) => a.id);
  let subActions: Memory[] = [];

  if (actionIds.length > 0) {
    const placeholders = actionIds.map(() => '?').join(',');
    subActions = db
      .prepare(
        `SELECT * FROM memories WHERE parent_id IN (${placeholders}) AND type = 'sub_action' ORDER BY created_at ASC`
      )
      .all(...actionIds) as Memory[];
  }

  return { subject, actions, subActions };
}

export function linkAcrossSessions(
  db: Database.Database,
  sessionId: string
): { linked: number; threads: number } {
  const memories = db
    .prepare(
      "SELECT * FROM memories WHERE session_id = ? AND type = 'subject' ORDER BY created_at ASC"
    )
    .all(sessionId) as Memory[];

  let linked = 0;
  let threads = 0;

  for (const mem of memories) {
    const keywords = extractKeywords(mem.content);
    if (keywords.length === 0) continue;

    const conditions = keywords.map(() => "content LIKE ?").join(' OR ');
    const params = keywords.map((k) => `%${k}%`);

    const related = db
      .prepare(
        `SELECT * FROM memories
         WHERE session_id != ? AND type = 'subject'
         AND (${conditions})
         ORDER BY created_at DESC LIMIT 5`
      )
      .all(sessionId, ...params) as Memory[];

    if (related.length > 0) {
      threads++;
      linked += related.length;
    }
  }

  return { linked, threads };
}

export function getMemoryContext(
  db: Database.Database,
  memoryId: string,
  depth: number = 2
): Memory | { memory: Memory; children: Memory[]; depth: number } | null {
  const memory = db
    .prepare('SELECT * FROM memories WHERE id = ?')
    .get(memoryId) as Memory | undefined;

  if (!memory) return null;

  if (depth <= 0) return memory;

  const children = db
    .prepare(
      'SELECT * FROM memories WHERE parent_id = ? ORDER BY importance DESC, created_at ASC'
    )
    .all(memoryId) as Memory[];

  return { memory, children, depth };
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
    'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'each',
    'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such',
    'than', 'too', 'very', 'just', 'about', 'also', 'now', 'here', 'there',
    'when', 'where', 'why', 'how', 'what', 'which', 'who', 'whom', 'this',
    'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
    'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 10);
}
