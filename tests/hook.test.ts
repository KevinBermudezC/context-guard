import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { processWithContextGuard } from '../src/index.js';

describe('ContextGuard Engine Core', () => {
  it('should passthrough small files directly', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-test-'));
    const tempFile = path.join(tempDir, 'small.ts');
    fs.writeFileSync(tempFile, 'const x = 1;\nconsole.log(x);');

    const result = await processWithContextGuard({
      filePath: tempFile
    });

    assert.strictEqual(result.status, 'PASSTHROUGH_FULL');
    assert.strictEqual(result.content, 'const x = 1;\nconsole.log(x);');
    assert.strictEqual(result.totalLines, 2);

    fs.rmSync(tempDir, { recursive: true });
  });

  it('should passthrough sliced ranges when startLine/endLine are requested', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-test-'));
    const tempFile = path.join(tempDir, 'big.ts');
    const content = Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join('\n');
    fs.writeFileSync(tempFile, content);

    const result = await processWithContextGuard({
      filePath: tempFile,
      startLine: 10,
      endLine: 15
    });

    assert.strictEqual(result.status, 'PASSTHROUGH_SLICE');
    assert.strictEqual(result.totalLines, 400);
    assert.ok(result.content.includes('line 10'));
    assert.ok(result.content.includes('line 15'));
    assert.ok(!result.content.includes('line 16'));

    fs.rmSync(tempDir, { recursive: true });
  });

  it('should extract AST skeleton when file exceeds threshold without slice', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-test-'));
    const tempFile = path.join(tempDir, 'large.ts');
    
    // Create 350 lines with some exports
    const lines = [
      "import { foo } from './foo.js';",
      "export class BigService {"
    ];
    for (let i = 0; i < 350; i++) {
      lines.push(`  // comment line ${i}`);
    }
    lines.push("  public executeAction() { return true; }");
    lines.push("}");
    fs.writeFileSync(tempFile, lines.join('\n'));

    // Test with skeleton provider
    process.env.CONTEXT_GUARD_PROVIDER = 'skeleton';
    const result = await processWithContextGuard({
      filePath: tempFile
    });

    assert.strictEqual(result.status, 'SHUNTED_LOCAL_AST');
    assert.ok(result.content.includes('export class BigService'));
    assert.ok(result.content.includes('public executeAction()'));

    fs.rmSync(tempDir, { recursive: true });
  });
});
