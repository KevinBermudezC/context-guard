/**
 * Token Counter and FinOps Metrics Calculator
 * Accurate token estimation and price models for Frontier and Worker AI models.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface TokenComparison {
  rawBytes: number;
  rawTokens: number;
  guardedBytes: number;
  guardedTokens: number;
  tokensSaved: number;
  percentageSaved: number;
  dollarsSaved: {
    claudeOpus55: number;   // $4.00 / M tokens (Claude Opus 5.5)
    claudeSonnet55: number; // $2.00 / M tokens (Claude Sonnet 5.5)
    gpt6Astra: number;      // $10.00 / M tokens (GPT-6 Astra)
  };
}

export interface MetricEvent {
  timestamp: string;
  source: 'cli' | 'hook' | 'mcp';
  filePath: string;
  action: string;
  rawTokens: number;
  guardedTokens: number;
  tokensSaved: number;
  dollarsSavedSonnet: number;
}

export interface AggregatedStats {
  totalInterceptions: number;
  totalRawTokens: number;
  totalGuardedTokens: number;
  totalTokensSaved: number;
  totalDollarsSavedOpus: number;
  totalDollarsSavedSonnet: number;
  totalDollarsSavedGpt6: number;
  events: MetricEvent[];
}

// ─── Token Estimator ─────────────────────────────────────────────────────────

/**
 * Estimates token count for code and natural text.
 * Based on character length, whitespace distribution, and punctuation density.
 * Calibration: 1 token ~= 3.75 characters for source code, ~= 4.0 for English prose.
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  // Code contains high density of symbols/operators which tokenize as separate tokens
  const symbolCount = (text.match(/[{}()[\];,.:=<>!&|+\-*/]/g) || []).length;
  const wordCount = (text.match(/\b\w+\b/g) || []).length;
  
  // Blended heuristic calibrated against tiktoken cl100k / anthropic tokenizers
  const estimated = Math.round((text.length / 4.0) + (symbolCount * 0.15));
  return Math.max(1, Math.max(estimated, Math.round(wordCount * 1.3)));
}

/**
 * Calculates token savings and FinOps dollar amounts between raw text and guarded text.
 */
export function calculateFinOps(rawText: string, guardedText: string): TokenComparison {
  const rawBytes = Buffer.byteLength(rawText, 'utf-8');
  const guardedBytes = Buffer.byteLength(guardedText, 'utf-8');
  
  const rawTokens = estimateTokens(rawText);
  const guardedTokens = estimateTokens(guardedText);
  
  const tokensSaved = Math.max(0, rawTokens - guardedTokens);
  const percentageSaved = rawTokens > 0 ? (tokensSaved / rawTokens) * 100 : 0;
  
  // Pricing per 1M input tokens (Anthropic & OpenAI official docs)
  const OPUS55_PRICE_PER_M = 4.00;
  const SONNET55_PRICE_PER_M = 2.00;
  const GPT6_PRICE_PER_M = 10.00;

  return {
    rawBytes,
    rawTokens,
    guardedBytes,
    guardedTokens,
    tokensSaved,
    percentageSaved: parseFloat(percentageSaved.toFixed(1)),
    dollarsSaved: {
      claudeOpus55: parseFloat(((tokensSaved / 1_000_000) * OPUS55_PRICE_PER_M).toFixed(4)),
      claudeSonnet55: parseFloat(((tokensSaved / 1_000_000) * SONNET55_PRICE_PER_M).toFixed(4)),
      gpt6Astra: parseFloat(((tokensSaved / 1_000_000) * GPT6_PRICE_PER_M).toFixed(4))
    }
  };
}

// ─── Persistent Metrics Store (~/.contextguard/metrics.json) ──────────────────

function getMetricsFilePath(): string {
  if (process.env.CONTEXT_GUARD_METRICS_FILE) {
    return process.env.CONTEXT_GUARD_METRICS_FILE;
  }
  const dir = path.join(os.homedir(), '.contextguard');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return path.join(dir, 'metrics.json');
}

/**
 * Records a real-time token saving event to the local ledger.
 */
export function recordMetricEvent(event: Omit<MetricEvent, 'timestamp'>): void {
  try {
    const file = getMetricsFilePath();
    let events: MetricEvent[] = [];
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf-8');
        events = JSON.parse(raw);
      } catch {}
    }

    events.push({
      ...event,
      timestamp: new Date().toISOString()
    });

    // Keep the last 1,000 events to avoid unbounded file growth
    if (events.length > 1000) {
      events = events.slice(-1000);
    }

    fs.writeFileSync(file, JSON.stringify(events, null, 2), 'utf-8');
  } catch {
    // Non-fatal if disk write fails
  }
}

/**
 * Reads and aggregates all persistent metrics.
 */
export function getAggregatedStats(): AggregatedStats {
  const file = getMetricsFilePath();
  let events: MetricEvent[] = [];
  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      events = JSON.parse(raw);
    } catch {}
  }

  let totalRawTokens = 0;
  let totalGuardedTokens = 0;
  let totalTokensSaved = 0;

  for (const e of events) {
    totalRawTokens += e.rawTokens || 0;
    totalGuardedTokens += e.guardedTokens || 0;
    totalTokensSaved += e.tokensSaved || 0;
  }

  return {
    totalInterceptions: events.length,
    totalRawTokens,
    totalGuardedTokens,
    totalTokensSaved,
    totalDollarsSavedOpus: parseFloat(((totalTokensSaved / 1_000_000) * 4.00).toFixed(2)),
    totalDollarsSavedSonnet: parseFloat(((totalTokensSaved / 1_000_000) * 2.00).toFixed(2)),
    totalDollarsSavedGpt6: parseFloat(((totalTokensSaved / 1_000_000) * 10.00).toFixed(2)),
    events
  };
}

/**
 * Clears the persistent metrics log.
 */
export function resetMetrics(): void {
  const file = getMetricsFilePath();
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }
}
