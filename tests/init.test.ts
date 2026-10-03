/**
 * Tests for context-guard init workspace command
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI_BIN = path.resolve(process.cwd(), 'dist/bin/context-guard.js');

describe('context-guard init (Phase 3)', () => {
  let tmpWorkspace: string;

  beforeEach(() => {
    tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-init-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpWorkspace)) {
      try { fs.rmSync(tmpWorkspace, { recursive: true, force: true }); } catch {}
    }
  });

  it('should initialize Antigravity rules, skill and mcp config when targeting antigravity', () => {
    const res = spawnSync('node', [CLI_BIN, 'init', 'antigravity'], {
      cwd: tmpWorkspace,
      encoding: 'utf-8'
    });

    assert.strictEqual(res.status, 0);
    assert.ok(res.stdout.includes('Google Antigravity'));

    const rulePath = path.join(tmpWorkspace, '.agents/rules/context-guard.md');
    const skillPath = path.join(tmpWorkspace, '.agents/skills/context-guard/SKILL.md');
    const mcpPath = path.join(tmpWorkspace, '.agents/mcp.json');

    assert.ok(fs.existsSync(rulePath), 'Antigravity rule must exist');
    assert.ok(fs.existsSync(skillPath), 'Antigravity skill must exist');
    assert.ok(fs.existsSync(mcpPath), 'Antigravity MCP config must exist');

    const mcpJson = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    assert.ok(mcpJson.mcpServers['context-guard']);
  });

  it('should initialize Cursor rules and mcp config when targeting cursor', () => {
    const res = spawnSync('node', [CLI_BIN, 'init', 'cursor'], {
      cwd: tmpWorkspace,
      encoding: 'utf-8'
    });

    assert.strictEqual(res.status, 0);
    assert.ok(res.stdout.includes('Cursor'));

    const rulePath = path.join(tmpWorkspace, '.cursor/rules/context-guard.mdc');
    const mcpPath = path.join(tmpWorkspace, '.cursor/mcp.json');

    assert.ok(fs.existsSync(rulePath), 'Cursor rule must exist');
    assert.ok(fs.existsSync(mcpPath), 'Cursor MCP config must exist');
  });

  it('should configure all adapters when run with no arguments or "all"', () => {
    const res = spawnSync('node', [CLI_BIN, 'init'], {
      cwd: tmpWorkspace,
      encoding: 'utf-8'
    });

    assert.strictEqual(res.status, 0);
    assert.ok(fs.existsSync(path.join(tmpWorkspace, '.agents/rules/context-guard.md')));
    assert.ok(fs.existsSync(path.join(tmpWorkspace, '.cursor/rules/context-guard.mdc')));
    assert.ok(fs.existsSync(path.join(tmpWorkspace, '.claude/settings.json')));
  });
});
