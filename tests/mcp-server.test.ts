/**
 * MCP Server Integration Tests (Phase 2)
 * Tests the ContextGuard MCP server by spawning it as a child process
 * and sending JSON-RPC 2.0 messages over stdin/stdout.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_BIN = path.resolve(__dirname, '../../dist/bin/mcp-server.js');

// ─── JSON-RPC Helper ──────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function sendRequest(proc: ChildProcessWithoutNullStreams, request: JsonRpcRequest): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as JsonRpcResponse;
          if (parsed.id === request.id) {
            cleanup();
            resolve(parsed);
            return;
          }
        } catch {
          // partial or unrelated line — continue
        }
      }
      buffer = lines[lines.length - 1] ?? '';
    };

    const cleanup = () => {
      proc.stdout.removeListener('data', onData);
      proc.removeListener('error', onError);
    };

    proc.stdout.on('data', onData);
    proc.on('error', onError);
    proc.stdin.write(JSON.stringify(request) + '\n');
    setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for response to request id=${request.id}`));
    }, 5000);
  });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('ContextGuard MCP Server (Phase 2)', () => {
  let proc: ChildProcessWithoutNullStreams;
  let nextId = 1;

  const req = (method: string, params?: Record<string, unknown>): JsonRpcRequest => ({
    jsonrpc: '2.0',
    id: nextId++,
    method,
    params
  });

  before(() => {
    proc = spawn('node', [MCP_SERVER_BIN], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    proc.stderr.on('data', (d: Buffer) => {
      // Suppress server startup messages in test output
      void d;
    });
    // Give the server a moment to initialize
    return new Promise((r) => setTimeout(r, 300));
  });

  after(() => {
    proc.stdin.end();
    proc.kill();
  });

  // ── Initialization ──────────────────────────────────────────────────────────

  it('should respond to initialize handshake', async () => {
    const res = await sendRequest(proc, req('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '0.1.0' }
    }));
    assert.ok(!res.error, `Unexpected error: ${JSON.stringify(res.error)}`);
    const result = res.result as Record<string, unknown>;
    assert.ok(result.serverInfo, 'Must include serverInfo');
    const info = result.serverInfo as Record<string, string>;
    assert.strictEqual(info.name, 'context-guard');
    assert.strictEqual(info.version, '1.3.1');
  });

  it('should list exactly 3 registered tools', async () => {
    const res = await sendRequest(proc, req('tools/list'));
    assert.ok(!res.error, `Unexpected error: ${JSON.stringify(res.error)}`);
    const result = res.result as { tools: Array<{ name: string }> };
    const names = result.tools.map((t) => t.name);
    assert.ok(names.includes('read_file_safe'), 'read_file_safe must be registered');
    assert.ok(names.includes('inspect_outline'), 'inspect_outline must be registered');
    assert.ok(names.includes('grep_distilled'), 'grep_distilled must be registered');
    assert.strictEqual(names.length, 3, 'Must have exactly 3 tools');
  });

  // ── read_file_safe ──────────────────────────────────────────────────────────

  it('read_file_safe: should return full content for a small file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-mcp-'));
    const tmpFile = path.join(tmpDir, 'small.ts');
    fs.writeFileSync(tmpFile, 'export const foo = 42;\nexport const bar = "hello";\n');

    const res = await sendRequest(proc, req('tools/call', {
      name: 'read_file_safe',
      arguments: { file_path: tmpFile }
    }));

    assert.ok(!res.error, `Unexpected error: ${JSON.stringify(res.error)}`);
    const result = res.result as { content: Array<{ type: string; text: string }> };
    const text = result.content[0].text;
    assert.ok(text.includes('PASSTHROUGH'), 'Must include PASSTHROUGH badge for small file');
    assert.ok(text.includes('foo') || text.includes('bar'), 'Must include file content');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('read_file_safe: should return AST skeleton for a large TypeScript file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-mcp-'));
    const tmpFile = path.join(tmpDir, 'large.ts');
    // Generate a file larger than 300 lines
    const lines: string[] = [
      'import path from "node:path";',
      'import fs from "node:fs";',
      '',
      'export interface UserService {',
      '  getUser(id: string): Promise<User>;',
      '  createUser(data: CreateUserDto): Promise<User>;',
      '}',
      '',
      'export class UserServiceImpl implements UserService {',
      '  async getUser(id: string): Promise<User> { return null as any; }',
      '  async createUser(data: CreateUserDto): Promise<User> { return null as any; }',
      '}'
    ];
    // Pad to >300 lines
    while (lines.length < 310) lines.push(`  // line ${lines.length}`);
    fs.writeFileSync(tmpFile, lines.join('\n'));

    const res = await sendRequest(proc, req('tools/call', {
      name: 'read_file_safe',
      arguments: { file_path: tmpFile }
    }));

    assert.ok(!res.error, `Unexpected error: ${JSON.stringify(res.error)}`);
    const result = res.result as { content: Array<{ type: string; text: string }> };
    const text = result.content[0].text;
    assert.ok(
      text.includes('SKELETON') || text.includes('SHUNT') || text.includes('UserService'),
      'Must return skeleton or structural content for large file'
    );

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('read_file_safe: should block a .wasm binary with isError=true', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-mcp-'));
    const wasmFile = path.join(tmpDir, 'module.wasm');
    fs.writeFileSync(wasmFile, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));

    const res = await sendRequest(proc, req('tools/call', {
      name: 'read_file_safe',
      arguments: { file_path: wasmFile }
    }));

    assert.ok(!res.error, 'JSON-RPC should not error — tool should handle it gracefully');
    const result = res.result as { content: Array<{ type: string; text: string }>; isError?: boolean };
    assert.ok(result.isError === true, 'isError must be true for blocked binary');
    const text = result.content[0].text;
    assert.ok(text.includes('BLOCKED') || text.includes('binario'), 'Must include block reason');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('read_file_safe: should return a scoped slice when start_line/end_line given', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-mcp-'));
    const tmpFile = path.join(tmpDir, 'ranged.ts');
    const content = Array.from({ length: 50 }, (_, i) => `// line ${i + 1}`).join('\n');
    fs.writeFileSync(tmpFile, content);

    const res = await sendRequest(proc, req('tools/call', {
      name: 'read_file_safe',
      arguments: { file_path: tmpFile, start_line: 5, end_line: 10 }
    }));

    assert.ok(!res.error, `Unexpected error: ${JSON.stringify(res.error)}`);
    const result = res.result as { content: Array<{ type: string; text: string }> };
    const text = result.content[0].text;
    assert.ok(text.includes('line 5') || text.includes('SLICE'), 'Must contain sliced content');

    fs.rmSync(tmpDir, { recursive: true });
  });

  // ── inspect_outline ─────────────────────────────────────────────────────────

  it('inspect_outline: should return structural outline for a TypeScript file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-mcp-'));
    const tmpFile = path.join(tmpDir, 'service.ts');
    fs.writeFileSync(tmpFile, [
      'export interface AuthService {',
      '  login(email: string, password: string): Promise<string>;',
      '  logout(token: string): void;',
      '}',
      '',
      'export class AuthServiceImpl implements AuthService {',
      '  async login(email: string, password: string): Promise<string> { return "token"; }',
      '  logout(token: string): void {}',
      '}'
    ].join('\n'));

    const res = await sendRequest(proc, req('tools/call', {
      name: 'inspect_outline',
      arguments: { file_path: tmpFile }
    }));

    assert.ok(!res.error, `Unexpected error: ${JSON.stringify(res.error)}`);
    const result = res.result as { content: Array<{ type: string; text: string }> };
    const text = result.content[0].text;
    assert.ok(text.includes('AuthService') || text.includes('login'), 'Must include structural declarations');
    assert.ok(text.includes('OUTLINE'), 'Must include OUTLINE badge');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('grep_distilled: should find matches and extract structural outline via ripgrep or node fallback', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-mcp-'));
    const testFile = path.join(tmpDir, 'controller.ts');
    fs.writeFileSync(testFile, [
      'export class UserController {',
      '  async findUserById(id: string) {',
      '    const targetId = id;',
      '    return targetId;',
      '  }',
      '}'
    ].join('\n'));

    const res = await sendRequest(proc, req('tools/call', {
      name: 'grep_distilled',
      arguments: { pattern: 'targetId', directory: tmpDir }
    }));

    assert.ok(!res.error, `Unexpected error: ${JSON.stringify(res.error)}`);
    const result = res.result as { content: Array<{ type: string; text: string }> };
    const text = result.content[0].text;
    assert.ok(text.includes('controller.ts'), 'Must find controller.ts file');
    assert.ok(text.includes('targetId'), 'Must contain match line');

    fs.rmSync(tmpDir, { recursive: true });
  });

  // ── Resources & Prompts (MCP Best Practices) ────────────────────────────────

  it('resources: should list contextguard://config and read active configuration', async () => {
    const listRes = await sendRequest(proc, req('resources/list'));
    assert.ok(!listRes.error, `Unexpected error: ${JSON.stringify(listRes.error)}`);
    const listResult = listRes.result as { resources: Array<{ uri: string }> };
    assert.ok(listResult.resources.some((r) => r.uri === 'contextguard://config'), 'Must list config resource');

    const readRes = await sendRequest(proc, req('resources/read', { uri: 'contextguard://config' }));
    assert.ok(!readRes.error, `Unexpected error: ${JSON.stringify(readRes.error)}`);
    const readResult = readRes.result as { contents: Array<{ text: string }> };
    assert.ok(readResult.contents[0].text.includes('maxLinesThreshold'), 'Must return valid config JSON');
  });

  it('prompts: should list investigate_codebase_safely prompt', async () => {
    const res = await sendRequest(proc, req('prompts/list'));
    assert.ok(!res.error, `Unexpected error: ${JSON.stringify(res.error)}`);
    const result = res.result as { prompts: Array<{ name: string }> };
    assert.ok(result.prompts.some((p) => p.name === 'investigate_codebase_safely'), 'Must expose prompt template');
  });
});
