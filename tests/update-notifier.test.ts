/**
 * Tests for the update notifier system
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isNewerVersion,
  getCachedLatestVersion,
  saveUpdateCache,
  shouldCheckRegistry,
  getUpdateNotice
} from '../src/update-notifier.js';

describe('Update Notifier System', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-update-test-'));
    process.env.CONTEXT_GUARD_DIR = tempDir;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('should accurately compare semver versions', () => {
    assert.strictEqual(isNewerVersion('1.4.1', '1.4.0'), true);
    assert.strictEqual(isNewerVersion('1.5.0', '1.4.9'), true);
    assert.strictEqual(isNewerVersion('2.0.0', '1.9.9'), true);
    assert.strictEqual(isNewerVersion('1.4.0', '1.4.0'), false);
    assert.strictEqual(isNewerVersion('1.3.2', '1.4.0'), false);
  });

  it('should read and write cache properly', () => {
    assert.strictEqual(getCachedLatestVersion(), null);
    assert.strictEqual(shouldCheckRegistry(), true);

    saveUpdateCache('1.4.5');
    assert.strictEqual(getCachedLatestVersion(), '1.4.5');
    assert.strictEqual(shouldCheckRegistry(), false);
  });

  it('should return a clean, unboxed notification message when a newer version is available', () => {
    saveUpdateCache('1.5.0');
    const notice = getUpdateNotice('1.4.0');
    assert.ok(notice);
    assert.strictEqual(notice.latestVersion, '1.5.0');
    assert.ok(notice.message.includes('ContextGuard update available'));
    assert.ok(notice.message.includes('v1.4.0'));
    assert.ok(notice.message.includes('v1.5.0'));
    assert.ok(notice.message.includes('npm i -g @kevinbermudezc/context-guard@latest'));
    // Ensure no broken ASCII box-drawing characters
    assert.strictEqual(notice.message.includes('╭'), false);
    assert.strictEqual(notice.message.includes('╰'), false);
    assert.strictEqual(notice.message.includes('│'), false);
  });

  it('should return null when the current version is equal or newer', () => {
    saveUpdateCache('1.4.0');
    const notice = getUpdateNotice('1.4.0');
    assert.strictEqual(notice, null);
  });
});
