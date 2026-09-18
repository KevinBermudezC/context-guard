import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { classifyFile, isBinaryBuffer } from '../src/file-classifier.js';

describe('File Classifier (SPEC-002)', () => {
  it('should detect binary image files by extension', () => {
    const res = classifyFile('assets/logo.png');
    assert.strictEqual(res.category, 'binary');
    assert.ok(res.reason?.includes('.png'));
  });

  it('should detect PDF documents by extension and advise pdftotext', () => {
    const res = classifyFile('docs/manual.pdf');
    assert.strictEqual(res.category, 'binary');
    assert.ok(res.recommendedAction?.includes('pdftotext'));
  });

  it('should detect lockfiles and suggest CLI commands', () => {
    const pnpmRes = classifyFile('pnpm-lock.yaml');
    assert.strictEqual(pnpmRes.category, 'lockfile');
    assert.ok(pnpmRes.recommendedAction?.includes('pnpm why'));

    const npmRes = classifyFile('package-lock.json');
    assert.strictEqual(npmRes.category, 'lockfile');
    assert.ok(npmRes.recommendedAction?.includes('npm ls'));
  });

  it('should detect minified files and recommend source inspection', () => {
    const res = classifyFile('dist/bundle.min.js');
    assert.strictEqual(res.category, 'minified');
    assert.ok(res.recommendedAction?.includes('src/'));
  });

  it('should detect binary contents with null bytes via buffer scanner', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-bin-'));
    const tempFile = path.join(tempDir, 'unknown_data');
    
    // Write buffer with null bytes
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x00, 0x7f, 0x80]);
    fs.writeFileSync(tempFile, buf);

    const res = classifyFile(tempFile);
    assert.strictEqual(res.category, 'binary');

    fs.rmSync(tempDir, { recursive: true });
  });

  it('should classify normal code files as source_code', () => {
    const res = classifyFile('src/index.ts');
    assert.strictEqual(res.category, 'source_code');
  });
});
