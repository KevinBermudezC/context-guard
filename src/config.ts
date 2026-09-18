import type { ContextGuardConfig, WorkerProvider } from './types.js';

export const CONFIG: ContextGuardConfig = {
  maxLines: parseInt(process.env.CONTEXT_GUARD_MAX_LINES || '300', 10),
  maxBytes: parseInt(process.env.CONTEXT_GUARD_MAX_BYTES || `${25 * 1024}`, 10), // 25 KB
  provider: (process.env.CONTEXT_GUARD_PROVIDER || 'gemini') as WorkerProvider,
  
  // Gemini Configuration
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  
  // Ollama Configuration
  ollamaUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',

  // OpenAI-compatible Configuration
  openaiBaseUrl: process.env.OPENAI_BASE_URL || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
};
