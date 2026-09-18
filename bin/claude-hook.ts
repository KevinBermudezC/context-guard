#!/usr/bin/env node

/**
 * ============================================================================
 * ContextGuard PreToolUse Hook for Claude Code
 * Intercepts un-scoped large file reads and prevents context saturation.
 * Returns Exit Code 2 (Hard Block) with structured signatures to stderr.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/config.js';
import { extractCodeSkeleton } from '../src/skeletonizer.js';
import { classifyFile } from '../src/file-classifier.js';
import type { ClaudeToolPayload } from '../src/types.js';

async function runHook(): Promise<void> {
  const inputChunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    inputChunks.push(chunk);
  }

  if (inputChunks.length === 0) {
    process.exit(0);
  }

  let payload: ClaudeToolPayload;
  try {
    payload = JSON.parse(Buffer.concat(inputChunks).toString('utf-8'));
  } catch {
    process.exit(0); // If stdin is not valid JSON, allow
  }

  const toolName = payload.tool_name || payload.name;
  const toolInput = payload.tool_input || payload.input || {};

  let targetFilePath: string | null = null;
  let isScoped = false;

  // 1. Intercept "Read", "View" or other file reading tools in Claude Code
  const isReadTool = ['Read', 'View', 'view_file', 'readFile', 'read_file'].includes(toolName || '');
  if (isReadTool) {
    const rawPath = toolInput.file_path || toolInput.path || toolInput.filePath || toolInput.AbsolutePath;
    targetFilePath = typeof rawPath === 'string' ? rawPath : null;
    // Check if Claude specified line bounds or page ranges (e.g. for PDFs)
    if (
      toolInput.offset !== undefined ||
      toolInput.limit !== undefined ||
      toolInput.StartLine !== undefined ||
      toolInput.EndLine !== undefined ||
      toolInput.pages !== undefined
    ) {
      isScoped = true;
    }
  }

  // 2. Intercept Bash commands doing open reads (cat, less, more, head)
  if (toolName === 'Bash' || toolName === 'bash') {
    const cmd = (toolInput.command || '').trim();
    // Allow piped/filtered commands (e.g. cat file | grep foo, or head -n 20)
    if (cmd.includes('|') || cmd.includes('>') || cmd.startsWith('head -n') || cmd.startsWith('tail -n')) {
      process.exit(0);
    }
    const catMatch = cmd.match(/^(?:cat|less|more)\s+(["']?)([^"'\s]+)\1$/);
    if (catMatch) {
      targetFilePath = catMatch[2];
    }
  }

  // If not a reading tool or already scoped, allow execution immediately
  if (!targetFilePath || isScoped) {
    process.exit(0); // Exit 0 = ALLOW
  }

  const resolvedPath = path.resolve(process.cwd(), targetFilePath);
  if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
    process.exit(0);
  }

  const ext = path.extname(resolvedPath).toLowerCase();

  // 3. Allow Claude Code native multimodal formats & notebooks (.png, .jpg, .pdf, .ipynb)
  // Claude Code's Read tool natively renders images for multimodal vision, parses PDFs, and formats notebooks.
  const CLAUDE_NATIVE_MEDIA_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif',
    '.pdf',
    '.ipynb'
  ]);

  if (CLAUDE_NATIVE_MEDIA_EXTENSIONS.has(ext)) {
    process.exit(0); // Exit 0 = ALLOW Claude native vision & viewer
  }

  // 4. Check for Non-Multimodal Binaries, Lockfiles, and Minified files
  const classification = classifyFile(resolvedPath);
  if (classification.category !== 'source_code') {
    const feedback = [
      `🛑 [CONTEXTGUARD: ACCESO DENEGADO - ${classification.category.toUpperCase()}]`,
      classification.reason,
      ``,
      `👉 ${classification.recommendedAction}`
    ].join('\n');
    process.stderr.write(feedback + '\n');
    process.exit(2);
  }

  const stat = fs.statSync(resolvedPath);
  const rawContent = fs.readFileSync(resolvedPath, 'utf-8');
  const lines = rawContent.split('\n');
  const totalLines = lines.length;

  // If within safety thresholds, allow direct read
  if (totalLines <= CONFIG.maxLines && stat.size <= CONFIG.maxBytes) {
    process.exit(0); // Exit 0 = ALLOW
  }

  // ========================================================================
  // APPLY CONTEXTGUARD SHUNT (BLOCK AND EMIT SKELETON)
  // ========================================================================
  const skeleton = extractCodeSkeleton(rawContent, ext);
  const preview = skeleton || lines.slice(0, 40).join('\n') + `\n... [${totalLines - 40} lines truncated by ContextGuard]`;

  const feedbackMessage = [
    `🛡️ [CONTEXTGUARD: LECTURA REGULADA - PREVENCIÓN DE SATURACIÓN DE TOKENS]`,
    `El recurso "${path.basename(resolvedPath)}" contiene ${totalLines} líneas (~${(stat.size / 1024).toFixed(1)} KB).`,
    `Para optimizar tu contexto y prevenir degradación de razonamiento, no se ha cargado el archivo completo en la ventana principal.`,
    ``,
    `📋 ESQUELETO ESTRUCTURAL Y FIRMAS (Con índices de línea):`,
    `--------------------------------------------------------------------------------`,
    preview,
    `--------------------------------------------------------------------------------`,
    ``,
    `🎯 ACCIÓN RECOMENDADA:`,
    `Revisa las firmas anteriores y ejecuta la herramienta "Read" (o "View") especificando los parámetros "offset" y "limit" para inspeccionar únicamente la sección necesaria.`
  ].join('\n');

  // Emit to stderr and exit with code 2 to trigger a controlled block with system feedback in Claude Code
  process.stderr.write(feedbackMessage + '\n');
  process.exit(2);
}

runHook().catch(() => process.exit(0));
