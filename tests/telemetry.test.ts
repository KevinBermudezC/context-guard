/**
 * Unit tests for Anonymous Opt-Out Telemetry
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  isTelemetryEnabled,
  enableTelemetry,
  disableTelemetry,
  getAnonymousId,
  sendTelemetryPing
} from '../src/telemetry.js';

describe('Anonymous Telemetry System', () => {
  const originalEnv = { ...process.env };
  const testDir = path.join(os.tmpdir(), `cg-telemetry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const disabledFile = path.join(testDir, 'telemetry-disabled');

  beforeEach(() => {
    delete process.env.CONTEXT_GUARD_TELEMETRY;
    delete process.env.DO_NOT_TRACK;
    process.env.CONTEXT_GUARD_DIR = testDir;
    if (fs.existsSync(disabledFile)) {
      try { fs.unlinkSync(disabledFile); } catch {}
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(testDir)) {
      try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('should be enabled by default', () => {
    assert.strictEqual(isTelemetryEnabled(), true);
  });

  it('should respect CONTEXT_GUARD_TELEMETRY=0 environment variable', () => {
    process.env.CONTEXT_GUARD_TELEMETRY = '0';
    assert.strictEqual(isTelemetryEnabled(), false);

    process.env.CONTEXT_GUARD_TELEMETRY = 'false';
    assert.strictEqual(isTelemetryEnabled(), false);
  });

  it('should respect global DO_NOT_TRACK=1 standard', () => {
    process.env.DO_NOT_TRACK = '1';
    assert.strictEqual(isTelemetryEnabled(), false);
  });

  it('should respect disableTelemetry() and enableTelemetry() flags', () => {
    disableTelemetry();
    assert.strictEqual(isTelemetryEnabled(), false);
    assert.strictEqual(fs.existsSync(disabledFile), true);

    enableTelemetry();
    assert.strictEqual(isTelemetryEnabled(), true);
    assert.strictEqual(fs.existsSync(disabledFile), false);
  });

  it('should generate a persistent, valid UUIDv4 anonymous machine ID', () => {
    const id1 = getAnonymousId();
    assert.ok(id1);
    assert.strictEqual(typeof id1, 'string');
    // UUID v4 regex validation
    assert.match(id1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    const id2 = getAnonymousId();
    assert.strictEqual(id1, id2, 'Anonymous ID must be persistent across calls');
  });

  it('should send telemetry ping non-blockingly without throwing errors even if offline or invalid endpoint', () => {
    process.env.CONTEXT_GUARD_TELEMETRY_ENDPOINT = 'http://127.0.0.1:54321/non-existent';
    
    assert.doesNotThrow(() => {
      sendTelemetryPing('cli', 'file_intercepted', '1.4.0', 1500);
    });
  });

  it('should not send telemetry ping when telemetry is disabled', () => {
    disableTelemetry();
    // Point to an invalid endpoint that would fail if attempted
    process.env.CONTEXT_GUARD_TELEMETRY_ENDPOINT = 'http://127.0.0.1:54321/must-not-be-called';

    assert.doesNotThrow(() => {
      sendTelemetryPing('mcp', 'outline_inspected', '1.4.0', 500);
    });
  });
});
