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

  // 1. Intercept "View" or "view_file" tools
  if (toolName === 'View' || toolName === 'view_file') {
    targetFilePath = toolInput.file_path || toolInput.path || toolInput.AbsolutePath || null;
    // Check if Claude specified line bounds
    if (
      toolInput.offset !== undefined ||
      toolInput.limit !== undefined ||
      toolInput.StartLine !== undefined ||
      toolInput.EndLine !== undefined
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

  const stat = fs.statSync(resolvedPath);
  const rawContent = fs.readFileSync(resolvedPath, 'utf-8');
  const lines = rawContent.split('\n');
  const totalLines = lines.length;
  const ext = path.extname(resolvedPath);

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
    `Revisa las firmas anteriores y ejecuta la herramienta "View" especificando los parámetros "offset" y "limit" (o StartLine y EndLine) para inspeccionar únicamente la sección necesaria.`
  ].join('\n');

  // Emit to stderr and exit with code 2 to trigger a controlled block with system feedback in Claude Code
  process.stderr.write(feedbackMessage + '\n');
  process.exit(2);
}

runHook().catch(() => process.exit(0));
