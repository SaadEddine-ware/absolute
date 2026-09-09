import { useCallback, useEffect, useRef, useState } from 'react';
import {
  openDatabase,
  createSession,
  getSessions,
  type AbsoluteDatabase,
  type Session,
} from '@absolute/core';
import { loadConfig, getDbPath } from '../lib/config.js';
import { createAnyProvider } from '../lib/embedding.js';

export type SessionStatus = 'opening' | 'ready' | 'error';

export interface UseSessionResult {
  status: SessionStatus;
  db: AbsoluteDatabase | null;
  session: Session | null;
  sessions: Session[];
  error?: string;
  startNew: () => Promise<Session | null>;
  switchSession: (id: string) => Promise<void>;
}

export function useSession(): UseSessionResult {
  const [status, setStatus] = useState<SessionStatus>('opening');
  const [db, setDb] = useState<AbsoluteDatabase | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const dbRef = useRef<AbsoluteDatabase | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = loadConfig();
        const handle = await openDatabase({
          dbPath: getDbPath(),
          embeddingProvider: createAnyProvider(config),
        });
        if (cancelled) {
          handle.db.close();
          return;
        }
        dbRef.current = handle;
        const existing = getSessions(handle.db, 10);
        const current = existing[0] ?? createSession(handle.db, { title: 'TUI session' });
        setDb(handle);
        setSession(current);
        setSessions(existing);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startNew = useCallback(async (): Promise<Session | null> => {
    if (!dbRef.current) return null;
    const created = createSession(dbRef.current.db, { title: 'TUI session' });
    setSession(created);
    setSessions(getSessions(dbRef.current.db, 10));
    return created;
  }, []);

  const switchSession = useCallback(async (id: string): Promise<void> => {
    if (!dbRef.current) return;
    const target = getSessions(dbRef.current.db, 100).find((s) => s.id === id);
    if (target) setSession(target);
  }, []);

  return { status, db, session, sessions, error, startNew, switchSession };
}