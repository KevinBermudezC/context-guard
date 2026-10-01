/**
 * Token Metrics and FinOps Unit Tests
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { estimateTokens, calculateFinOps, getAggregatedStats, resetMetrics, recordMetricEvent } from '../src/token-metrics.js';

describe('Token Metrics & FinOps (Fase 5 Preview)', () => {
  it('should estimate tokens accurately for code and text', () => {
    const empty = estimateTokens('');
    assert.strictEqual(empty, 0);

    const smallCode = 'export const add = (a: number, b: number): number => a + b;';
    const tokens = estimateTokens(smallCode);
    assert.ok(tokens > 10 && tokens < 25, `Expected reasonable token count, got ${tokens}`);
  });

  it('should calculate savings percentage and dollar amounts', () => {
    const rawContent = 'line\n'.repeat(400); // 400 lines
    const skeletonContent = 'line\n'.repeat(20); // 20 lines

    const fin = calculateFinOps(rawContent, skeletonContent);
    assert.ok(fin.tokensSaved > 0, 'Must have saved tokens');
    assert.ok(fin.percentageSaved > 80, `Expected >80% savings, got ${fin.percentageSaved}%`);
    assert.ok(fin.dollarsSaved.claudeSonnet55 >= 0);
    assert.ok(fin.dollarsSaved.claudeOpus55 >= 0);
    assert.ok(fin.dollarsSaved.gpt6Astra >= 0);
  });

  it('should record metric events and aggregate stats', () => {
    const testMetricsFile = path.join(os.tmpdir(), `cg-metrics-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    process.env.CONTEXT_GUARD_METRICS_FILE = testMetricsFile;
    try {
      resetMetrics();

    recordMetricEvent({
      source: 'cli',
      filePath: 'test.ts',
      action: 'SHUNTED_LOCAL_AST',
      rawTokens: 1000,
      guardedTokens: 100,
      tokensSaved: 900,
      dollarsSavedSonnet: 0.0027
    });

    const stats = getAggregatedStats();
    assert.strictEqual(stats.totalInterceptions, 1);
    assert.strictEqual(stats.totalTokensSaved, 900);
    assert.ok(stats.events.length === 1);
    } finally {
      delete process.env.CONTEXT_GUARD_METRICS_FILE;
      if (fs.existsSync(testMetricsFile)) {
        try { fs.unlinkSync(testMetricsFile); } catch {}
      }
    }
  });
});
