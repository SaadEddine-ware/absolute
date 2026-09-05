export interface Memory {
  id: string;
  parent_id: string | null;
  type: 'subject' | 'action' | 'sub_action' | 'prompt_answer';
  content: string;
  keys: string;
  goal_id: string | null;
  importance: number;
  tokens_est: number | null;
  session_id: string;
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  parent_goal_id: string | null;
  description: string;
  status: 'active' | 'completed' | 'paused';
  keys: string;
  level: 'goal' | 'sub_goal' | 'task';
  session_id: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  title: string | null;
  root_subject_id: string | null;
  summary: string | null;
  tokens_used: number;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  similarity_threshold: number;
  switch_confirmed_count: number;
  switch_rejected_count: number;
  total_confirmations: number;
  created_at: string;
  updated_at: string;
}

export interface EmbeddingMetadata {
  id: 1;
  model_id: string;
  dimensions: number;
  created_at: string;
}

export interface CreateMemoryRequest {
  parent_id?: string;
  type: Memory['type'];
  content: string;
  keys?: Record<string, unknown>;
  goal_id?: string;
  importance?: number;
  tokens_est?: number;
  session_id: string;
}

export interface UpdateMemoryRequest {
  content?: string;
  keys?: Record<string, unknown>;
  importance?: number;
  goal_id?: string | null;
}

export interface CreateGoalRequest {
  parent_goal_id?: string;
  description: string;
  status?: Goal['status'];
  keys?: Record<string, unknown>;
  level: Goal['level'];
  session_id: string;
}

export interface UpdateGoalRequest {
  description?: string;
  status?: Goal['status'];
  keys?: Record<string, unknown>;
}

export interface CreateSessionRequest {
  title?: string;
  summary?: string;
}

export interface UpdateSessionRequest {
  title?: string;
  summary?: string;
}

export interface SessionContext {
  headers: MemoryHeader[];
  goals: GoalHeader[];
  total_tokens_est: number;
}

export interface MemoryHeader {
  id: string;
  type: Memory['type'];
  content: string;
  importance: number;
  tokens_est: number;
  child_count: number;
}

export interface GoalHeader {
  id: string;
  level: Goal['level'];
  description: string;
  status: Goal['status'];
  child_count: number;
}
