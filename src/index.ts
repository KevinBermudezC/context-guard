import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';
import { extractCodeSkeleton } from './skeletonizer.js';
import { callWorkerModel } from './worker-model.js';
import { classifyFile } from './file-classifier.js';
import type { ProcessFileOptions, ProcessFileResult } from './types.js';

export * from './types.js';
export * from './config.js';
export * from './skeletonizer.js';
export * from './worker-model.js';
export * from './file-classifier.js';
export * from './import-collapser.js';

/**
 * Main engine of ContextGuard
 * Evaluates file size and either passes it through or shunts it to an AST/Worker summary.
 */
export async function processWithContextGuard(options: ProcessFileOptions): Promise<ProcessFileResult> {
  const { filePath, query = '', startLine, endLine, forceWorker = false } = options;

  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    return {
      status: 'ERROR',
      error: `File not found or is a directory: ${filePath}`,
      content: ''
    };
  }

  // 1. Check for Binaries, Lockfiles, and Minified files
  const classification = classifyFile(resolved);
  if (classification.category === 'binary') {
    return {
      status: 'BLOCKED_BINARY',
      reason: classification.reason,
      content: `<!-- CONTEXTGUARD: ${classification.reason} -->\n<!-- ${classification.recommendedAction} -->`
    };
  }
  if (classification.category === 'lockfile') {
    return {
      status: 'BLOCKED_LOCKFILE',
      reason: classification.reason,
      content: `<!-- CONTEXTGUARD: ${classification.reason} -->\n<!-- ${classification.recommendedAction} -->`
    };
  }
  if (classification.category === 'minified') {
    return {
      status: 'BLOCKED_MINIFIED',
      reason: classification.reason,
      content: `<!-- CONTEXTGUARD: ${classification.reason} -->\n<!-- ${classification.recommendedAction} -->`
    };
  }

  const stat = fs.statSync(resolved);
  const rawContent = fs.readFileSync(resolved, 'utf-8');
  const lines = rawContent.split('\n');
  const totalLines = lines.length;
  const ext = path.extname(resolved).toLowerCase();

  // 1. Scoped line requests bypass ContextGuard (Passthrough)
  if (startLine !== undefined || endLine !== undefined) {
    const s = Math.max(1, startLine || 1) - 1;
    const e = Math.min(totalLines, endLine || totalLines);
    const sliced = lines.slice(s, e).join('\n');
    return {
      status: 'PASSTHROUGH_SLICE',
      reason: `Scoped slice requested (lines ${s + 1} to ${e})`,
      content: sliced,
      totalLines,
      sizeBytes: stat.size
    };
  }

  // 2. Small files pass through directly
  const isSmall = totalLines <= CONFIG.maxLines && stat.size <= CONFIG.maxBytes;
  if (isSmall && !forceWorker) {
    return {
      status: 'PASSTHROUGH_FULL',
      reason: `File within limits (${totalLines} lines, ${(stat.size / 1024).toFixed(1)} KB)`,
      content: rawContent,
      totalLines,
      sizeBytes: stat.size
    };
  }

  // 3. Shunt Tier 0: Structural AST / Skeleton (0 tokens, < 5ms)
  if (!query && !forceWorker && CONFIG.provider !== 'gemini' && CONFIG.provider !== 'ollama' && CONFIG.provider !== 'openai') {
    const skeleton = extractCodeSkeleton(rawContent, ext);
    if (skeleton) {
      return {
        status: 'SHUNTED_LOCAL_AST',
        totalLines,
        sizeBytes: stat.size,
        content: `<!-- CONTEXTGUARD: Large file (${totalLines} lines, ${(stat.size / 1024).toFixed(1)} KB). Extracted structural skeleton. -->\n` +
                 `<!-- Request specific line ranges (e.g. L120-L150) to inspect implementation. -->\n\n` +
                 skeleton
      };
    }
  }

  // 4. Shunt Tier 0 Fallback to AST if provider fails or if local AST requested
  const localSkeleton = extractCodeSkeleton(rawContent, ext);
  if (!query && localSkeleton && CONFIG.provider === 'skeleton') {
    return {
      status: 'SHUNTED_LOCAL_AST',
      totalLines,
      sizeBytes: stat.size,
      content: `<!-- CONTEXTGUARD: Structural skeleton (Tier 0 AST) -->\n\n` + localSkeleton
    };
  }

  // 5. Shunt Tier 1: Worker Model
  try {
    const summary = await callWorkerModel(rawContent, query, ext);
    return {
      status: 'SHUNTED_WORKER_MODEL',
      provider: CONFIG.provider,
      totalLines,
      sizeBytes: stat.size,
      content: `<!-- CONTEXTGUARD: File of ${totalLines} lines summarized by Worker Model (${CONFIG.provider}) -->\n` +
               `<!-- Request specific line ranges using offset/limit to read full blocks. -->\n\n` +
               summary
    };
  } catch (err: any) {
    // If worker model fails, fallback to local skeleton or first 50 lines
    if (localSkeleton) {
      return {
        status: 'SHUNTED_LOCAL_AST',
        warning: `Worker failed (${err.message}). Fell back to local AST skeleton.`,
        totalLines,
        sizeBytes: stat.size,
        content: localSkeleton
      };
    }

    return {
      status: 'SHUNT_FALLBACK',
      warning: `Worker failed: ${err.message}. Showing head of file.`,
      content: lines.slice(0, 50).join('\n') + `\n\n... [${totalLines - 50} lines truncated by ContextGuard] ...`
    };
  }
}
