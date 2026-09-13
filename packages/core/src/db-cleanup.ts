import type Database from 'better-sqlite3';

// Global database cleanup handler. Ensures the SQLite database is closed
// before Node.js tears down, preventing better-sqlite3's native cleanup
// hooks from crashing (Assertion failed: (env) != nullptr) on Node.js 24+.

let dbRef: Database.Database | null = null;

export function registerDbForCleanup(db: Database.Database): void {
  dbRef = db;
}

export function unregisterDbCleanup(): void {
  dbRef = null;
}

export function closeDbNow(): void {
  if (dbRef) {
    try {
      dbRef.close();
    } catch {
      // best-effort during teardown
    }
    dbRef = null;
  }
}
