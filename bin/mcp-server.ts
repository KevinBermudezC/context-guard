#!/usr/bin/env node
/**
 * ContextGuard MCP Server (Phase 2)
 * Universal Model Context Protocol server exposing ContextGuard's context
 * admission and token optimization engine as MCP tools.
 *
 * Compatible with: Claude Desktop, Cursor, Windsurf, Antigravity (AGY), Zed.
 * Transport: stdio (JSON-RPC 2.0)
 * SDK: @modelcontextprotocol/server v2 (2026-07-28 spec)
 *
 * Tools:
 *   read_file_safe   — Protected file read with size guard + AST skeleton fallback
 *   inspect_outline  — Instant structural outline of any source file (<5ms, $0.00)
 *   grep_distilled   — Pattern search returning structural context around matches
 */
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import { processWithContextGuard } from '../src/index.js';
import { CONFIG } from '../src/config.js';
import { classifyFile } from '../src/file-classifier.js';
import { extractCodeSkeleton, isSupportedExtension } from '../src/skeletonizer.js';
import { spawnSync } from 'node:child_process';

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVER_NAME = 'context-guard';
const SERVER_VERSION = '1.2.0';

// Native Claude Code / multimodal formats — allow full passthrough
const NATIVE_MEDIA_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif',
  '.pdf', '.ipynb'
]);

// Ignored directories for pure Node recursive scan fallback
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.turbo', '.cache',
  'coverage', '.vscode', '.idea'
]);

/**
 * Pure Node.js fallback scanner when ripgrep (rg) is not installed on the system.
 */
function safeNodeGrep(
  searchDir: string,
  pattern: string,
  isRegex: boolean,
  includeGlob?: string,
  maxFiles = 20
): Array<{ filePath: string; matches: string[] }> {
  const results: Array<{ filePath: string; matches: string[] }> = [];

  let matcher: (line: string) => boolean;
  if (isRegex) {
    try {
      const re = new RegExp(pattern);
      matcher = (l: string) => re.test(l);
    } catch {
      return [];
    }
  } else {
    matcher = (l: string) => l.includes(pattern);
  }

  // Simple extension or filename filter
  const filterExt = includeGlob?.startsWith('*.') ? includeGlob.slice(1).toLowerCase() : null;

  function walk(currentDir: string) {
    if (results.length >= maxFiles) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (filterExt && !entry.name.toLowerCase().endsWith(filterExt)) {
          continue;
        }

        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          const matchingLines: string[] = [];

          for (let i = 0; i < lines.length; i++) {
            if (matcher(lines[i])) {
              const start = Math.max(0, i - 1);
              const end = Math.min(lines.length - 1, i + 1);
              for (let c = start; c <= end; c++) {
                matchingLines.push(`${c + 1}:${lines[c]}`);
              }
              if (matchingLines.length >= 10) break;
            }
          }

          if (matchingLines.length > 0) {
            results.push({ filePath: fullPath, matches: matchingLines });
          }
        } catch {
          // ignore binary or unreadable files
        }
      }
    }
  }

  walk(searchDir);
  return results;
}

// ─── Server Setup ─────────────────────────────────────────────────────────────

const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

// ─── MCP Resources (Static/Live System Inspection) ───────────────────────────

server.registerResource(
  'config',
  'contextguard://config',
  {
    title: 'ContextGuard Active Configuration',
    description: 'Current thresholds, active worker provider, and buffer safety settings in effect.',
    mimeType: 'application/json'
  },
  async (uri) => {
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify({
          version: SERVER_VERSION,
          maxLinesThreshold: CONFIG.maxLines,
          maxBytesThreshold: CONFIG.maxBytes,
          workerProvider: CONFIG.provider,
          supportedSfcFrameworks: ['svelte', 'vue', 'angular', 'astro'],
          nativeMediaBypass: Array.from(NATIVE_MEDIA_EXTS)
        }, null, 2),
        mimeType: 'application/json'
      }]
    };
  }
);

server.registerResource(
  'stats',
  'contextguard://stats',
  {
    title: 'ContextGuard Live FinOps Ledger',
    description: 'Real-time telemetry of tokens prevented, input volume saved, and dollar ROI estimates across models.',
    mimeType: 'application/json'
  },
  async (uri) => {
    const stats = (await import('../src/token-metrics.js')).getAggregatedStats();
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(stats, null, 2),
        mimeType: 'application/json'
      }]
    };
  }
);

// ─── MCP Prompts (Optimized System Prompt Templates) ─────────────────────────

server.registerPrompt(
  'investigate_codebase_safely',
  {
    title: 'Investigate Codebase Safely',
    description: 'Standard system instruction guiding the AI agent to avoid full-file dumps by prioritizing inspect_outline and targeted read_file_safe ranges.'
  },
  async () => {
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'Follow ContextGuard FinOps & token preservation rules:',
            '1. Do not perform unrestricted open reads of files over 300 lines.',
            '2. Call "inspect_outline" first to discover method and type signatures with their exact line tags [L#].',
            '3. Read only targeted slices with "read_file_safe(file_path, start_line, end_line)".',
            '4. When searching for symbols, use "grep_distilled" to examine matching signatures instead of dumping entire source files.'
          ].join('\n')
        }
      }]
    };
  }
);

// ─── Tool: read_file_safe ─────────────────────────────────────────────────────

server.registerTool(
  'read_file_safe',
  {
    title: 'Read File (ContextGuard Protected)',
    description: [
      'Reads a source file through the ContextGuard admission layer.',
      '• If the file is small (≤300 lines / ≤25 KB): returns full content directly.',
      '• If the file is large: returns an AST structural skeleton with line-tagged signatures.',
      '• If the file is a binary (wasm/zip/sqlite/dll), lockfile, or minified bundle: returns an informative block message with CLI alternatives.',
      '• If start_line / end_line are provided: returns the exact slice without applying the guard.',
      'This tool replaces raw "Read file" calls and prevents context window flooding from large files.'
    ].join('\n'),
    inputSchema: {
      file_path: z.string().describe('Absolute or relative path to the file to read.'),
      start_line: z.number().int().positive().optional().describe('First line to read (1-indexed). Bypasses size guard if set.'),
      end_line: z.number().int().positive().optional().describe('Last line to read (1-indexed, inclusive). Bypasses size guard if set.'),
      query: z.string().optional().describe('Optional semantic question. If provided, the file is passed to a worker model (Gemini Flash / Ollama) for summarization instead of AST extraction.')
    }
  },
  async ({ file_path, start_line, end_line, query }) => {
    try {
      const resolved = path.resolve(process.cwd(), file_path);

      // File existence check
      if (!fs.existsSync(resolved)) {
        return {
          content: [{
            type: 'text',
            text: `⚠️ [CONTEXTGUARD] File not found: ${file_path}`
          }]
        };
      }

      if (fs.statSync(resolved).isDirectory()) {
        return {
          content: [{
            type: 'text',
            text: `⚠️ [CONTEXTGUARD] Path is a directory: ${file_path}. Use a file path.`
          }]
        };
      }

      const ext = path.extname(resolved).toLowerCase();

      // Native multimodal / notebook formats — passthrough directly
      if (NATIVE_MEDIA_EXTS.has(ext)) {
        const raw = fs.readFileSync(resolved);
        const isText = ext === '.ipynb' || ext === '.svg';
        return {
          content: [{
            type: 'text',
            text: isText
              ? raw.toString('utf-8')
              : `[Native binary format: ${ext}. Use multimodal vision tool or platform viewer to inspect.]`
          }]
        };
      }

      // Run through ContextGuard engine
      const result = await processWithContextGuard({
        filePath: file_path,
        startLine: start_line,
        endLine: end_line,
        query: query ?? ''
      });

      // Format the response with status metadata header
      const statusBadge: Record<string, string> = {
        PASSTHROUGH_FULL: '✅ PASSTHROUGH',
        PASSTHROUGH_SLICE: '✅ SLICE',
        SHUNTED_LOCAL_AST: '🛡️ AST SKELETON',
        SHUNTED_WORKER_MODEL: '🤖 WORKER SUMMARY',
        SHUNT_FALLBACK: '⚠️ FALLBACK',
        BLOCKED_BINARY: '🛑 BLOCKED (BINARY)',
        BLOCKED_LOCKFILE: '🛑 BLOCKED (LOCKFILE)',
        BLOCKED_MINIFIED: '🛑 BLOCKED (MINIFIED)',
        ERROR: '❌ ERROR'
      };

      const badge = statusBadge[result.status] ?? result.status;
      const meta = result.totalLines
        ? `${result.totalLines} lines · ${((result.sizeBytes ?? 0) / 1024).toFixed(1)} KB`
        : '';

      const header = meta
        ? `<!-- [CONTEXTGUARD ${badge}] ${meta} -->\n`
        : `<!-- [CONTEXTGUARD ${badge}] -->\n`;

      const isBlocked = ['BLOCKED_BINARY', 'BLOCKED_LOCKFILE', 'BLOCKED_MINIFIED', 'ERROR'].includes(result.status);

      return {
        content: [{
          type: 'text',
          text: isBlocked
            ? `${badge}\n\n${result.content || result.error || result.reason}`
            : header + result.content
        }],
        isError: isBlocked
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `❌ [CONTEXTGUARD ERROR] ${err.message}` }],
        isError: true
      };
    }
  }
);

// ─── Tool: inspect_outline ────────────────────────────────────────────────────

server.registerTool(
  'inspect_outline',
  {
    title: 'Inspect File Outline',
    description: [
      'Returns a structural outline (classes, interfaces, functions, types, signals) of a source file.',
      'This is a zero-cost, <5ms operation using the Tier 0 local AST skeletonizer.',
      'Supports: TypeScript, JavaScript, Python, Go, Rust, Java, C#, Svelte 5, Vue 3, Angular, Astro.',
      'Use this to navigate large files before calling read_file_safe with targeted line ranges.',
      'Returns null if the file format is not supported for structural extraction.'
    ].join('\n'),
    inputSchema: {
      file_path: z.string().describe('Absolute or relative path to the source file.')
    }
  },
  async ({ file_path }) => {
    try {
      const resolved = path.resolve(process.cwd(), file_path);

      if (!fs.existsSync(resolved)) {
        return {
          content: [{ type: 'text', text: `⚠️ File not found: ${file_path}` }],
          isError: true
        };
      }

      const ext = path.extname(resolved);
      const langKey = isSupportedExtension(ext);

      if (!langKey) {
        return {
          content: [{
            type: 'text',
            text: `ℹ️ [CONTEXTGUARD] File format "${ext}" is not supported for structural outline extraction.\nSupported: .ts, .tsx, .js, .jsx, .py, .go, .rs, .java, .cs, .svelte, .vue, .astro`
          }]
        };
      }

      const raw = fs.readFileSync(resolved, 'utf-8');
      const stat = fs.statSync(resolved);
      const totalLines = raw.split('\n').length;
      const skeleton = extractCodeSkeleton(raw, ext);

      if (!skeleton) {
        return {
          content: [{
            type: 'text',
            text: `ℹ️ [CONTEXTGUARD] No structural declarations found in "${path.basename(file_path)}" (${totalLines} lines).`
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: [
            `<!-- [CONTEXTGUARD OUTLINE] ${path.basename(file_path)} · ${totalLines} lines · ${(stat.size / 1024).toFixed(1)} KB -->`,
            `<!-- Use read_file_safe(file_path, start_line=N, end_line=M) to read any section. -->`,
            '',
            skeleton
          ].join('\n')
        }]
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `❌ [CONTEXTGUARD ERROR] ${err.message}` }],
        isError: true
      };
    }
  }
);

// ─── Tool: grep_distilled ─────────────────────────────────────────────────────

server.registerTool(
  'grep_distilled',
  {
    title: 'Grep (Distilled)',
    description: [
      'Searches for a pattern in files and returns only the structural outline of matching files,',
      'not the full content. Prevents context flooding when searching across a large codebase.',
      'For each matching file, returns the filename, matching lines, and the structural skeleton.',
      'Uses ripgrep if available, with an automatic fallback to pure Node.js scanning.',
      'Results are capped at 20 files to keep context manageable.'
    ].join('\n'),
    inputSchema: {
      pattern: z.string().describe('Search pattern (string or regex if is_regex=true).'),
      directory: z.string().optional().describe('Directory to search in. Defaults to current working directory.'),
      include: z.string().optional().describe('Glob to filter files (e.g. "*.ts", "src/**/*.py"). Defaults to all text files.'),
      is_regex: z.boolean().optional().describe('Treat pattern as a regex. Default false (fixed string search).')
    }
  },
  async ({ pattern, directory, include, is_regex }) => {
    try {
      const searchDir = directory ? path.resolve(process.cwd(), directory) : process.cwd();

      if (!fs.existsSync(searchDir)) {
        return {
          content: [{ type: 'text', text: `⚠️ Directory not found: ${directory}` }],
          isError: true
        };
      }

      let matchingEntries: Array<{ filePath: string; matchLines: string }> = [];

      // 1. Attempt ripgrep using safe spawnSync (no shell injection)
      const rgArgs: string[] = [
        '--line-number',
        '--with-filename',
        '--no-heading',
        '--color=never',
        '--max-count=5',
        '-l'
      ];
      if (!is_regex) rgArgs.push('--fixed-strings');
      if (include) rgArgs.push('--glob', include);
      rgArgs.push('--', pattern, searchDir);

      const rgResult = spawnSync('rg', rgArgs, { encoding: 'utf-8', maxBuffer: 1024 * 512 });

      if (rgResult.error && (rgResult.error as any).code === 'ENOENT') {
        // ripgrep is not installed — use pure Node.js fallback!
        const nodeMatches = safeNodeGrep(searchDir, pattern, !!is_regex, include, 20);
        matchingEntries = nodeMatches.map(m => ({
          filePath: m.filePath,
          matchLines: m.matches.slice(0, 5).join('\n')
        }));
      } else if (rgResult.status === 0 && rgResult.stdout) {
        const filePaths = rgResult.stdout.trim().split('\n').filter(Boolean).slice(0, 20);
        for (const fp of filePaths) {
          const matchArgs = [
            '--line-number', '--no-heading', '--color=never',
            '--max-count=5', '--context=1'
          ];
          if (!is_regex) matchArgs.push('--fixed-strings');
          if (include) matchArgs.push('--glob', include);
          matchArgs.push('--', pattern, fp);

          const matchRes = spawnSync('rg', matchArgs, { encoding: 'utf-8', maxBuffer: 1024 * 64 });
          matchingEntries.push({
            filePath: fp,
            matchLines: (matchRes.stdout || '').trim() || '(matches found)'
          });
        }
      } else if (rgResult.status === 1) {
        // No matches found by ripgrep
        return {
          content: [{ type: 'text', text: `ℹ️ [CONTEXTGUARD GREP] No matches for "${pattern}" in ${searchDir}` }]
        };
      }

      if (matchingEntries.length === 0) {
        return {
          content: [{ type: 'text', text: `ℹ️ [CONTEXTGUARD GREP] No matches for "${pattern}" in ${searchDir}` }]
        };
      }

      // Format results with outlines
      const results: string[] = [
        `<!-- [CONTEXTGUARD GREP] Pattern: "${pattern}" | ${matchingEntries.length} matching files -->`,
        ''
      ];

      for (const entry of matchingEntries) {
        const ext = path.extname(entry.filePath);
        const relPath = path.relative(process.cwd(), entry.filePath);

        let skeleton: string | null = null;
        let totalLines = 0;
        let sizeBytes = 0;

        try {
          const raw = fs.readFileSync(entry.filePath, 'utf-8');
          skeleton = extractCodeSkeleton(raw, ext);
          totalLines = raw.split('\n').length;
          sizeBytes = fs.statSync(entry.filePath).size;
        } catch {}

        results.push(`### ${relPath} (${totalLines} lines, ${(sizeBytes / 1024).toFixed(1)} KB)`);
        results.push('**Matches:**');
        results.push('```');
        results.push(entry.matchLines);
        results.push('```');
        if (skeleton) {
          results.push('**Structural outline:**');
          results.push('```');
          results.push(skeleton);
          results.push('```');
        }
        results.push('');
      }

      if (matchingEntries.length === 20) {
        results.push('> ⚠️ Results capped at 20 files. Narrow your search with a more specific pattern or --include glob.');
      }

      return {
        content: [{ type: 'text', text: results.join('\n') }]
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `❌ [CONTEXTGUARD ERROR] ${err.message}` }],
        isError: true
      };
    }
  }
);

// ─── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr — never to stdout (would corrupt JSON-RPC channel)
  process.stderr.write(`[ContextGuard MCP] Server v${SERVER_VERSION} running on stdio\n`);
}

main().catch((err) => {
  process.stderr.write(`[ContextGuard MCP] Fatal error: ${err.message}\n`);
  process.exit(1);
});
