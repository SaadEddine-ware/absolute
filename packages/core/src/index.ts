export type {
  Memory,
  Goal,
  Session,
  UserSettings,
  EmbeddingMetadata,
  CreateMemoryRequest,
  UpdateMemoryRequest,
  CreateGoalRequest,
  UpdateGoalRequest,
  CreateSessionRequest,
  UpdateSessionRequest,
  SessionContext,
  MemoryHeader,
  GoalHeader,
} from './types.js';

export type { EmbeddingProvider } from './embedding/types.js';
export { CloudflareProvider } from './embedding/cloudflare-provider.js';
export type { CloudflareProviderConfig } from './embedding/cloudflare-provider.js';

export { openDatabase, generateId, estimateTokens } from './database.js';
export type { AbsoluteDatabase, DatabaseConfig } from './database.js';

export {
  createSession,
  getSession,
  getSessions,
  updateSession,
  deleteSession,
} from './sessions.js';

export {
  createMemory,
  getMemory,
  getMemoriesBySession,
  getMemoriesByParent,
  updateMemory,
  deleteMemory,
  loadSessionHeaders,
  formatContextForLLM,
} from './memory.js';

export { migrateEmbeddings } from './migration.js';
export type { MigrationResult } from './migration.js';
