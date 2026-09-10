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
export type { CloudflareProviderConfig, ProviderProbe as CloudflareProbe } from './embedding/cloudflare-provider.js';
export { LocalProvider, LOCAL_MODELS } from './embedding/local-provider.js';
export type { LocalProviderConfig } from './embedding/local-provider.js';

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
  drillDownMemory,
  searchByKeywords,
  loadByImportance,
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
  getUserSettings,
  updateAdaptiveThreshold,
  recordSwitchFeedback,
  resetThreshold,
  getDecision,
  DEFAULT_THRESHOLD,
  MIN_THRESHOLD,
  MAX_THRESHOLD,
} from './adaptive-threshold.js';

export {
  buildSystemPrompt,
  type SystemPromptInput,
} from './system-prompt.js';

export {
  loadSessionContext,
  progressiveDrillDown,
  TOKEN_BUDGET,
} from './progressive-load.js';

export {
  detectContext,
  embedWithTimeout,
  checkVectorDimensions,
  getVec0Dimension,
  getEmbeddingMetadata,
  searchSimilarMemories,
  searchSimilarMemoriesGlobal,
  searchSimilarGoals,
  getGoalVector,
  storeMemoryVector,
  storeGoalVector,
  cosineSimilarity,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOP_K,
  type ContextDetectResult,
  type ContextDecision,
  type DetectOptions,
} from './context-detect.js';

export {
  getWorkerStatus,
  estimateMigrationImpact,
  validateCloudWorker,
  verifyProviderMatchesDb,
  type WorkerStatus,
  type WorkerMode,
  type MigrationImpact,
  type ProviderProbe,
} from './worker-management.js';
