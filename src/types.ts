export type WorkerProvider = 'gemini' | 'ollama' | 'openai' | 'skeleton';

export interface ContextGuardConfig {
  maxLines: number;
  maxBytes: number;
  provider: WorkerProvider;
  geminiApiKey?: string;
  geminiModel?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
}

export interface ProcessFileOptions {
  filePath: string;
  query?: string;
  startLine?: number;
  endLine?: number;
  forceWorker?: boolean;
}

export type ProcessFileStatus = 
  | 'PASSTHROUGH_FULL'
  | 'PASSTHROUGH_SLICE'
  | 'SHUNTED_LOCAL_AST'
  | 'SHUNTED_WORKER_MODEL'
  | 'SHUNT_FALLBACK'
  | 'BLOCKED_BINARY'
  | 'BLOCKED_LOCKFILE'
  | 'BLOCKED_MINIFIED'
  | 'ERROR';

export interface ProcessFileResult {
  status: ProcessFileStatus;
  content: string;
  totalLines?: number;
  sizeBytes?: number;
  reason?: string;
  provider?: string;
  warning?: string;
  error?: string;
}

export interface ClaudeToolInput {
  file_path?: string;
  path?: string;
  AbsolutePath?: string;
  offset?: number;
  limit?: number;
  StartLine?: number;
  EndLine?: number;
  command?: string;
  [key: string]: unknown;
}

export interface ClaudeToolPayload {
  tool_name?: string;
  name?: string;
  tool_input?: ClaudeToolInput;
  input?: ClaudeToolInput;
}
