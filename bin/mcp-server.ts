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
import { classifyFile } from '../src/file-classifier.js';
import { extractCodeSkeleton, isSupportedExtension } from '../src/skeletonizer.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVER_NAME = 'context-guard';
const SERVER_VERSION = '1.2.0';

// Native Claude Code / multimodal formats — allow full passthrough
const NATIVE_MEDIA_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif',
  '.pdf', '.ipynb'
]);

// ─── Server Setup ─────────────────────────────────────────────────────────────

const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

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
      'Pattern supports ripgrep syntax (fixed strings by default, pass is_regex=true for regex).',
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

      // Build ripgrep command
      const rgArgs: string[] = [
        '--line-number',
        '--with-filename',
        '--no-heading',
        '--color=never',
        '--max-count=5',      // max 5 matches per file
        '-l'                   // list matching files first
      ];

      if (!is_regex) rgArgs.push('--fixed-strings');
      if (include) rgArgs.push('--glob', include);
      rgArgs.push('--', pattern, searchDir);

      let matchingFiles: string[] = [];
      try {
        const output = execSync(`rg ${rgArgs.map(a => JSON.stringify(a)).join(' ')}`, {
          encoding: 'utf-8',
          maxBuffer: 1024 * 512
        });
        matchingFiles = output.trim().split('\n').filter(Boolean).slice(0, 20);
      } catch (rgErr: any) {
        // rg exits with 1 if no matches
        if (rgErr.status === 1) {
          return {
            content: [{ type: 'text', text: `ℹ️ [CONTEXTGUARD GREP] No matches for "${pattern}" in ${searchDir}` }]
          };
        }
        // rg not installed — fall back to a Node.js glob scan
        return {
          content: [{ type: 'text', text: `⚠️ ripgrep (rg) is not available. Install it with: brew install ripgrep\nCannot perform distilled grep without rg.` }],
          isError: true
        };
      }

      if (matchingFiles.length === 0) {
        return {
          content: [{ type: 'text', text: `ℹ️ [CONTEXTGUARD GREP] No matches for "${pattern}"` }]
        };
      }

      // For each matching file: get matching lines + structural outline
      const results: string[] = [
        `<!-- [CONTEXTGUARD GREP] Pattern: "${pattern}" | ${matchingFiles.length} matching files -->`,
        ''
      ];

      for (const filePath of matchingFiles) {
        const ext = path.extname(filePath);
        const relPath = path.relative(process.cwd(), filePath);

        // Get matching lines with context
        let matchLines = '';
        try {
          const matchArgs = [
            '--line-number', '--no-heading', '--color=never',
            '--max-count=5', '--context=1'
          ];
          if (!is_regex) matchArgs.push('--fixed-strings');
          if (include) matchArgs.push('--glob', include);
          matchArgs.push('--', pattern, filePath);
          matchLines = execSync(`rg ${matchArgs.map(a => JSON.stringify(a)).join(' ')}`, {
            encoding: 'utf-8',
            maxBuffer: 1024 * 64
          }).trim();
        } catch {
          matchLines = '(error reading match lines)';
        }

        // Get structural outline
        const raw = fs.readFileSync(filePath, 'utf-8');
        const skeleton = extractCodeSkeleton(raw, ext);
        const stat = fs.statSync(filePath);
        const totalLines = raw.split('\n').length;

        results.push(`### ${relPath} (${totalLines} lines, ${(stat.size / 1024).toFixed(1)} KB)`);
        results.push('**Matches:**');
        results.push('```');
        results.push(matchLines);
        results.push('```');
        if (skeleton) {
          results.push('**Structural outline:**');
          results.push('```');
          results.push(skeleton);
          results.push('```');
        }
        results.push('');
      }

      if (matchingFiles.length === 20) {
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
