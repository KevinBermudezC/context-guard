/**
 * Antigravity Lifecycle Hook Compatibility Tests
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';

const HOOK_BIN = path.resolve(process.cwd(), 'dist/bin/claude-hook.js');

function runHookWithPayload(payload: any): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [HOOK_BIN], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

describe('Antigravity Lifecycle Hook Adapter', () => {
  it('should return decision="allow" for small files via toolCall payload', async () => {
    const payload = {
      toolCall: {
        name: 'view_file',
        args: {
          AbsolutePath: path.resolve(process.cwd(), 'package.json')
        }
      }
    };

    const res = await runHookWithPayload(payload);
    assert.strictEqual(res.code, 0);
    const parsed = JSON.parse(res.stdout.trim());
    assert.strictEqual(parsed.decision, 'allow');
  });

  it('should return decision="allow" when scoped lines (StartLine, EndLine) are requested', async () => {
    const payload = {
      toolCall: {
        name: 'view_file',
        args: {
          AbsolutePath: path.resolve(process.cwd(), 'bin/mcp-server.ts'),
          StartLine: 1,
          EndLine: 50
        }
      }
    };

    const res = await runHookWithPayload(payload);
    assert.strictEqual(res.code, 0);
    const parsed = JSON.parse(res.stdout.trim());
    assert.strictEqual(parsed.decision, 'allow');
  });

  it('should return decision="deny" with structural outline feedback when reading large files (>300 lines) un-scoped', async () => {
    const payload = {
      toolCall: {
        name: 'view_file',
        args: {
          AbsolutePath: path.resolve(process.cwd(), 'bin/mcp-server.ts')
        }
      }
    };

    const res = await runHookWithPayload(payload);
    assert.strictEqual(res.code, 0); // Antigravity expects exit 0 with JSON { decision: "deny", reason: "..." }
    const parsed = JSON.parse(res.stdout.trim());
    assert.strictEqual(parsed.decision, 'deny');
    assert.ok(parsed.reason.includes('LECTURA REGULADA'));
    assert.ok(parsed.reason.includes('ESQUELETO ESTRUCTURAL Y FIRMAS'));
  });

  it('should return decision="deny" when attempting to view lockfiles', async () => {
    const payload = {
      toolCall: {
        name: 'view_file',
        args: {
          AbsolutePath: path.resolve(process.cwd(), 'pnpm-lock.yaml')
        }
      }
    };

    const res = await runHookWithPayload(payload);
    assert.strictEqual(res.code, 0);
    const parsed = JSON.parse(res.stdout.trim());
    assert.strictEqual(parsed.decision, 'deny');
    assert.ok(parsed.reason.includes('ACCESO DENEGADO'));
  });
});
