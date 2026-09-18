import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const HOOK_PATH = path.resolve(process.cwd(), 'dist/bin/claude-hook.js');

function runHookWithStdin(payload: unknown): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [HOOK_PATH], {
      env: { ...process.env, CONTEXT_GUARD_MAX_LINES: '100' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code: number | null) => {
      resolve({ exitCode: code ?? 0, stderr, stdout });
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

describe('Claude Code Hook PreToolUse End-to-End', () => {
  it('should block un-scoped Read of a file over threshold with Exit Code 2', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-hook-'));
    const tempFile = path.join(tempDir, 'huge.ts');
    
    // Create 150 lines of code
    const lines = ['export class OrderService {'];
    for (let i = 0; i < 150; i++) {
      lines.push(`  // dummy line ${i}`);
    }
    lines.push('  public pay() { return true; }');
    lines.push('}');
    fs.writeFileSync(tempFile, lines.join('\n'));

    const res = await runHookWithStdin({
      tool_name: 'Read',
      tool_input: { file_path: tempFile }
    });

    assert.strictEqual(res.exitCode, 2, 'Must exit with 2 to hard block Claude Code on Read');
    assert.ok(res.stderr.includes('CONTEXTGUARD: LECTURA REGULADA'), 'Must emit warning in stderr');
    assert.ok(res.stderr.includes('OrderService'), 'Must include skeleton in stderr');

    fs.rmSync(tempDir, { recursive: true });
  });

  it('should allow (exit 0) when Read has offset and limit', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-hook-'));
    const tempFile = path.join(tempDir, 'huge.ts');
    fs.writeFileSync(tempFile, Array.from({ length: 200 }, () => 'code').join('\n'));

    const res = await runHookWithStdin({
      tool_name: 'Read',
      tool_input: {
        file_path: tempFile,
        offset: 10,
        limit: 20
      }
    });

    assert.strictEqual(res.exitCode, 0, 'Must exit with 0 to allow Claude Code execution');
    assert.strictEqual(res.stderr, '');

    fs.rmSync(tempDir, { recursive: true });
  });

  it('should block un-scoped View of a file over threshold with Exit Code 2', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-hook-'));
    const tempFile = path.join(tempDir, 'huge.ts');
    
    // Create 150 lines of code
    const lines = ['export class OrderService {'];
    for (let i = 0; i < 150; i++) {
      lines.push(`  // dummy line ${i}`);
    }
    lines.push('  public pay() { return true; }');
    lines.push('}');
    fs.writeFileSync(tempFile, lines.join('\n'));

    const res = await runHookWithStdin({
      tool_name: 'View',
      tool_input: { file_path: tempFile }
    });

    assert.strictEqual(res.exitCode, 2, 'Must exit with 2 to hard block Claude Code on View');
    assert.ok(res.stderr.includes('CONTEXTGUARD: LECTURA REGULADA'), 'Must emit warning in stderr');
    assert.ok(res.stderr.includes('OrderService'), 'Must include skeleton in stderr');

    fs.rmSync(tempDir, { recursive: true });
  });

  it('should allow (exit 0) when View has offset and limit', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-hook-'));
    const tempFile = path.join(tempDir, 'huge.ts');
    fs.writeFileSync(tempFile, Array.from({ length: 200 }, () => 'code').join('\n'));

    const res = await runHookWithStdin({
      tool_name: 'View',
      tool_input: {
        file_path: tempFile,
        offset: 10,
        limit: 20
      }
    });

    assert.strictEqual(res.exitCode, 0, 'Must exit with 0 to allow Claude Code execution');
    assert.strictEqual(res.stderr, '');

    fs.rmSync(tempDir, { recursive: true });
  });

  it('should allow reading native multimodal and notebook files (images, PDFs, ipynb) with Exit Code 0', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-hook-'));
    const imgFile = path.join(tempDir, 'screenshot.png');
    fs.writeFileSync(imgFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));

    const resImg = await runHookWithStdin({
      tool_name: 'Read',
      tool_input: { file_path: imgFile }
    });
    assert.strictEqual(resImg.exitCode, 0, 'Must allow image file for multimodal vision');
    assert.strictEqual(resImg.stderr, '');

    const pdfFile = path.join(tempDir, 'document.pdf');
    fs.writeFileSync(pdfFile, '%PDF-1.4 ...');
    const resPdf = await runHookWithStdin({
      tool_name: 'Read',
      tool_input: { file_path: pdfFile, pages: '1-3' }
    });
    assert.strictEqual(resPdf.exitCode, 0, 'Must allow scoped PDF read');
    assert.strictEqual(resPdf.stderr, '');

    fs.rmSync(tempDir, { recursive: true });
  });

  it('should block non-multimodal binary files like wasm, archives, or compiled binaries with Exit Code 2', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-hook-'));
    const wasmFile = path.join(tempDir, 'module.wasm');
    fs.writeFileSync(wasmFile, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01]));

    const res = await runHookWithStdin({
      tool_name: 'Read',
      tool_input: { file_path: wasmFile }
    });

    assert.strictEqual(res.exitCode, 2, 'Must block non-multimodal binary file with exit code 2');
    assert.ok(res.stderr.includes('ACCESO DENEGADO - BINARY'), 'Must emit binary warning');

    fs.rmSync(tempDir, { recursive: true });
  });

  it('should block reading lockfiles with Exit Code 2 and suggest CLI introspection', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-hook-'));
    const lockFile = path.join(tempDir, 'pnpm-lock.yaml');
    fs.writeFileSync(lockFile, 'lockfileVersion: 5.4\npackages:\n  foo: 1.0.0');

    const res = await runHookWithStdin({
      tool_name: 'Read',
      tool_input: { file_path: lockFile }
    });

    assert.strictEqual(res.exitCode, 2, 'Must block lockfile with exit code 2');
    assert.ok(res.stderr.includes('lockfile de dependencias'), 'Must advise using pnpm why');

    fs.rmSync(tempDir, { recursive: true });
  });
});
