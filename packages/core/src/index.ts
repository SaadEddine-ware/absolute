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
  SystemPromptConfig,
} from './types.js';

export type { EmbeddingProvider } from './embedding/types.js';
export { CloudflareProvider } from './embedding/cloudflare-provider.js';
export type { CloudflareProviderConfig } from './embedding/cloudflare-provider.js';
export { LocalProvider, LOCAL_MODELS } from './embedding/local-provider.js';
export type { LocalProviderConfig } from './embedding/local-provider.js';

export { openDatabase, generateId, estimateTokens } from './database.js';
export type { AbsoluteDatabase, DatabaseConfig } from './database.js';
export { registerDbForCleanup, unregisterDbCleanup, closeDbNow } from './db-cleanup.js';

export {
  createSession,
  getSession,
  getSessions,
  updateSession,
  deleteSession,
  updateSessionTokensUsed,
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
  drillDownMemory,
  searchByKeywords,
  loadByImportance,
  storeMemoryVector,
} from './memory.js';

export {
  createGoal,
  getGoal,
  getGoalsBySession,
  getGoalsByParent,
  getActiveGoals,
  updateGoal,
  deleteGoal,
  getGoalHierarchy,
  completeGoal,
  storeGoalVector,
} from './goals.js';

export {
  findLinkedMemories,
  createMemoryThread,
  linkAcrossSessions,
  getMemoryContext,
  extractKeywords,
} from './cross-session.js';

export {
  getRetentionSettings,
  updateRetentionSettings,
  getExpiredMemories,
  deleteExpiredMemories,
  getMemoryAge,
} from './retention.js';
export type { RetentionSettings } from './retention.js';

export { migrateEmbeddings } from './migration.js';
export type { MigrationResult } from './migration.js';

export {
  detectContext,
  embedWithTimeout,
  searchSimilarMemories,
  searchSimilarGoals,
} from './context-detect.js';
export type { ContextDecision, DetectContextResult, DetectContextOptions } from './context-detect.js';

export { loadSessionContext } from './progressive-load.js';
export type { LoadSessionContextOptions } from './progressive-load.js';

export { buildSystemPrompt } from './system-prompt.js';
export type { BuildSystemPromptInput } from './system-prompt.js';

export {
  getUserSettings,
  recordSwitchFeedback,
  resetThreshold,
} from './adaptive-threshold.js';

export {
  getEmbeddingMetadata,
  getWorkerStatus,
  estimateMigrationImpact,
  validateCloudWorker,
  verifyProviderMatchesDb,
} from './worker-management.js';
export type { WorkerMode, WorkerStatus, MigrationImpact, ConfiguredEmbedding, ValidateCloudResult } from './worker-management.js';
