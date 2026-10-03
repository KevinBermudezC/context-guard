#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { processWithContextGuard } from '../src/index.js';
import { extractCodeSkeleton } from '../src/skeletonizer.js';
import { getAggregatedStats, resetMetrics, calculateFinOps } from '../src/token-metrics.js';
import {
  isTelemetryEnabled,
  enableTelemetry,
  disableTelemetry,
  getAnonymousId
} from '../src/telemetry.js';
import { VERSION } from '../src/version.js';

// ─── Minimal ANSI Formatting (Clean, Terminal-Agnostic) ───────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

// ─── Help Menu ────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
  ${c.cyan}🛡️  ${c.bold}ContextGuard CLI${c.reset} ${c.gray}v${VERSION}${c.reset}
  ${c.dim}Intelligent Context Admission Control & FinOps Optimization${c.reset}

  ${c.bold}USAGE${c.reset}
    ${c.green}context-guard${c.reset} <file-path> [options]
    ${c.green}context-guard stats${c.reset} [path] [options]
    ${c.green}context-guard telemetry${c.reset} <status|enable|disable>

  ${c.bold}COMMANDS${c.reset}
    ${c.cyan}init${c.reset} [agent]          Configura ContextGuard automáticamente (antigravity, cursor, claude, all)
    ${c.cyan}stats${c.reset} [dir]          Muestra la telemetría acumulada o audita un directorio
    ${c.cyan}stats --watch${c.reset}        Monitor interactivo de consumo y ahorro en tiempo real
    ${c.cyan}stats --reset${c.reset}        Reinicia el historial de métricas locales
    ${c.cyan}telemetry status${c.reset}     Muestra el estado de la telemetría anónima y el ID local
    ${c.cyan}telemetry enable${c.reset}     Habilita el envío de métricas anónimas
    ${c.cyan}telemetry disable${c.reset}    Deshabilita por completo la telemetría anónima

  ${c.bold}OPTIONS${c.reset}
    ${c.yellow}-q, --query <text>${c.reset}   Filtro semántico para el modelo worker (Gemini/Ollama)
    ${c.yellow}--start <num>${c.reset}        Línea inicial (1-indexed slice passthrough)
    ${c.yellow}--end <num>${c.reset}          Línea final (1-indexed slice passthrough)
    ${c.yellow}--force-worker${c.reset}       Fuerza el procesamiento mediante el modelo worker
    ${c.yellow}--json${c.reset}               Salida estructurada en JSON puro
    ${c.yellow}-v, --version${c.reset}        Muestra la versión de ContextGuard
    ${c.yellow}-h, --help${c.reset}           Muestra este menú de ayuda

  ${c.bold}EXAMPLES${c.reset}
    ${c.dim}# Inspecciona un archivo con protección automática (>300 líneas)${c.reset}
    context-guard src/large-service.ts

    ${c.dim}# Lee un rango acotado sin aplicar el guard${c.reset}
    context-guard src/large-service.ts --start 120 --end 160

    ${c.dim}# Consulta el ahorro histórico de tokens y dinero${c.reset}
    context-guard stats

    ${c.dim}# Audita el potencial de ahorro de un directorio completo${c.reset}
    context-guard stats src/

    ${c.dim}# Monitor en tiempo real mientras usas Claude Code o Cursor${c.reset}
    context-guard stats --watch
`);
}

// ─── Directory Auditor ────────────────────────────────────────────────────────

function auditDirectory(targetDir: string): void {
  const resolved = path.resolve(process.cwd(), targetDir);
  if (!fs.existsSync(resolved)) {
    console.error(`\n  ${c.red}✖ Error:${c.reset} El directorio no existe: ${targetDir}\n`);
    process.exit(1);
  }

  const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage']);
  const filesToAudit: string[] = [];

  function walk(current: string) {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch { return; }

    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (!IGNORED.has(ent.name) && !ent.name.startsWith('.')) {
          walk(path.join(current, ent.name));
        }
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.svelte', '.vue', '.astro'].includes(ext)) {
          filesToAudit.push(path.join(current, ent.name));
        }
      }
    }
  }

  walk(resolved);

  let totalRawTokens = 0;
  let totalGuardedTokens = 0;
  let largeFilesCount = 0;

  for (const f of filesToAudit) {
    try {
      const content = fs.readFileSync(f, 'utf-8');
      const lines = content.split('\n').length;
      if (lines > 300) {
        largeFilesCount++;
        const ext = path.extname(f);
        const skeleton = extractCodeSkeleton(content, ext) || '';
        const fin = calculateFinOps(content, skeleton);
        totalRawTokens += fin.rawTokens;
        totalGuardedTokens += fin.guardedTokens;
      }
    } catch {}
  }

  const tokensSaved = Math.max(0, totalRawTokens - totalGuardedTokens);
  const pctSaved = totalRawTokens > 0 ? ((tokensSaved / totalRawTokens) * 100).toFixed(1) : '0';
  const opusDollars = ((tokensSaved / 1_000_000) * 4.00).toFixed(2);
  const sonnetDollars = ((tokensSaved / 1_000_000) * 2.00).toFixed(2);
  const gpt6Dollars = ((tokensSaved / 1_000_000) * 10.00).toFixed(2);

  console.log(`
  ${c.cyan}🔍 ${c.bold}Auditoría FinOps:${c.reset} ${c.white}${path.relative(process.cwd(), resolved) || '.'}${c.reset}
  ${c.dim}${filesToAudit.length} archivos fuente analizados (${largeFilesCount} superan el umbral de 300 líneas)${c.reset}

  ${c.bold}Consumo de Tokens:${c.reset}
    ${c.gray}•${c.reset} Lectura Cruda:      ${c.yellow}~${totalRawTokens.toLocaleString()} tokens${c.reset}
    ${c.gray}•${c.reset} Con ContextGuard:   ${c.green}~${totalGuardedTokens.toLocaleString()} tokens${c.reset}
    ${c.gray}•${c.reset} ${c.bold}Ahorro Neto:${c.reset}         ${c.green}${c.bold}~${tokensSaved.toLocaleString()} tokens (${pctSaved}% reducción)${c.reset}

  ${c.bold}Ahorro Estimado en Dólares:${c.reset}
    ${c.gray}•${c.reset} Claude Opus 5.5:    ${c.green}$${opusDollars} USD${c.reset}
    ${c.gray}•${c.reset} Claude Sonnet 5.5:  ${c.green}$${sonnetDollars} USD${c.reset}
    ${c.gray}•${c.reset} GPT-6 Astra:        ${c.green}$${gpt6Dollars} USD${c.reset}
`);
}

// ─── Real-Time Live Watcher ───────────────────────────────────────────────────

function runRealtimeWatch(): void {
  const render = () => {
    console.clear();
    const stats = getAggregatedStats();
    const time = new Date().toLocaleTimeString();

    console.log(`
  ${c.cyan}🛡️  ${c.bold}ContextGuard Live Telemetry Monitor${c.reset} ${c.gray}[${time}]${c.reset}
  ${c.dim}Escuchando intercepciones activas de Claude Code, Cursor y MCP...${c.reset}

  ${c.bold}Balance de Tokens:${c.reset}
    ${c.gray}•${c.reset} Archivos regulados:       ${c.cyan}${stats.totalInterceptions}${c.reset}
    ${c.gray}•${c.reset} Tokens crudos evitados:   ${c.yellow}~${stats.totalRawTokens.toLocaleString()}${c.reset}
    ${c.gray}•${c.reset} Tokens AST inyectados:    ${c.white}~${stats.totalGuardedTokens.toLocaleString()}${c.reset}
    ${c.gray}•${c.reset} ${c.bold}Tokens netos ahorrados:${c.reset}   ${c.green}${c.bold}~${stats.totalTokensSaved.toLocaleString()}${c.reset}

  ${c.bold}Retorno de Inversión (ROI):${c.reset}
    ${c.gray}•${c.reset} Claude Opus 5.5:          ${c.green}$${stats.totalDollarsSavedOpus.toFixed(2)} USD${c.reset}
    ${c.gray}•${c.reset} Claude Sonnet 5.5:        ${c.green}$${stats.totalDollarsSavedSonnet.toFixed(2)} USD${c.reset}
    ${c.gray}•${c.reset} GPT-6 Astra:              ${c.green}$${stats.totalDollarsSavedGpt6.toFixed(2)} USD${c.reset}

  ${c.bold}Últimos Eventos:${c.reset}`);

    const recent = stats.events.slice(-6).reverse();
    if (recent.length === 0) {
      console.log(`    ${c.dim}(Sin eventos recientes. Usa Claude Code, Cursor o MCP para registrar tráfico)${c.reset}\n`);
    } else {
      const badges: Record<string, string> = {
        hook: `${c.magenta}[HOOK]${c.reset}`,
        mcp: `${c.cyan}[MCP]${c.reset} `,
        cli: `${c.blue}[CLI]${c.reset} `
      };
      for (const ev of recent) {
        const badge = badges[ev.source] || `${c.blue}[CLI]${c.reset} `;
        const fName = ev.filePath.length > 28 ? '...' + ev.filePath.slice(-25) : ev.filePath.padEnd(28);
        console.log(`    ${c.dim}${ev.timestamp.slice(11, 19)}${c.reset} ${badge} ${c.white}${fName}${c.reset} ${c.green}+${ev.tokensSaved.toLocaleString()} tokens${c.reset} ${c.gray}(~$${ev.dollarsSavedSonnet})${c.reset}`);
      }
      console.log('');
    }

    console.log(`  ${c.dim}Presiona Ctrl+C para salir.${c.reset}`);
  };

  render();
  const interval = setInterval(render, 1000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(`\n  ${c.green}✔ Monitor finalizado.${c.reset}\n`);
    process.exit(0);
  });
}

// ─── Stats Reporter ───────────────────────────────────────────────────────────

function printStats(args: string[]): void {
  if (args.includes('--reset')) {
    resetMetrics();
    console.log(`\n  ${c.green}✔ Historial de métricas reiniciado con éxito.${c.reset}\n`);
    return;
  }

  if (args.includes('--watch') || args.includes('-w')) {
    runRealtimeWatch();
    return;
  }

  // Check if a directory path was provided
  const targetPath = args.find(a => !a.startsWith('-') && a !== 'stats');
  if (targetPath && fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    auditDirectory(targetPath);
    return;
  }

  const stats = getAggregatedStats();

  if (args.includes('--json')) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(`
  ${c.cyan}🛡️  ${c.bold}ContextGuard — Resumen FinOps${c.reset}
  ${c.dim}Telemetría de intercepciones registradas en este equipo${c.reset}

  ${c.bold}Balance de Tokens:${c.reset}
    ${c.gray}•${c.reset} Archivos regulados:       ${c.cyan}${stats.totalInterceptions}${c.reset}
    ${c.gray}•${c.reset} Tokens crudos evitados:   ${c.yellow}~${stats.totalRawTokens.toLocaleString()}${c.reset}
    ${c.gray}•${c.reset} Tokens AST inyectados:    ${c.white}~${stats.totalGuardedTokens.toLocaleString()}${c.reset}
    ${c.gray}•${c.reset} ${c.bold}Tokens netos ahorrados:${c.reset}   ${c.green}${c.bold}~${stats.totalTokensSaved.toLocaleString()}${c.reset}

  ${c.bold}Ahorro Estimado en Dólares:${c.reset}
    ${c.gray}•${c.reset} Claude Opus 5.5:          ${c.green}$${stats.totalDollarsSavedOpus.toFixed(2)} USD${c.reset}
    ${c.gray}•${c.reset} Claude Sonnet 5.5:        ${c.green}$${stats.totalDollarsSavedSonnet.toFixed(2)} USD${c.reset}
    ${c.gray}•${c.reset} GPT-6 Astra:              ${c.green}$${stats.totalDollarsSavedGpt6.toFixed(2)} USD${c.reset}

  ${c.dim}💡 Corre "context-guard stats --watch" para ver el monitor en vivo.${c.reset}
  ${c.dim}💡 Corre "context-guard stats <directorio>" para auditar una carpeta.${c.reset}
`);
}

// ─── Workspace Initializer (Phase 3 Native Adapters) ──────────────────────────

function initWorkspace(agentArg?: string): void {
  const rootDir = process.cwd();
  const agent = (agentArg || 'all').toLowerCase();

  console.log(`
  ${c.cyan}🛡️  ${c.bold}ContextGuard Workspace Initializer${c.reset}
  ${c.dim}Configurando adaptadores y reglas nativas de ContextGuard...${c.reset}
`);

  const configured: string[] = [];

  // 1. Antigravity Adapter (.agents/rules/context-guard.md & .agents/skills/context-guard/SKILL.md)
  if (['all', 'antigravity', 'agy'].includes(agent)) {
    const agentsDir = path.join(rootDir, '.agents');
    const rulesDir = path.join(agentsDir, 'rules');
    const skillDir = path.join(agentsDir, 'skills', 'context-guard');
    
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.mkdirSync(skillDir, { recursive: true });

    const ruleContent = `# 🛡️ ContextGuard Project Rule for Google Antigravity (AGY)

You MUST follow these context admission control and token optimization rules:

## 1. Context Admission Control
- **Do NOT read large files (>300 lines) into context unrestricted.**
- When \`read_file_safe\` is available via MCP:
  - Use \`inspect_outline(file_path)\` to get a structural map of the file with line numbers \`[L#]\`.
  - Use \`read_file_safe(file_path)\` which automatically returns an AST skeleton for files >300 lines.
  - When inspecting implementations, read targeted line ranges:
    \`read_file_safe(file_path, start_line=..., end_line=...)\` or \`view_file(AbsolutePath=..., StartLine=..., EndLine=...)\`.

## 2. Lockfiles and Binaries
- **Never open lockfiles** (\`package-lock.json\`, \`pnpm-lock.yaml\`, \`yarn.lock\`, \`bun.lockb\`) or compiled/minified bundles (\`.min.js\`, \`.wasm\`, \`.pyc\`).
- Use command-line tools (\`pnpm why <pkg>\`, \`npm ls <pkg>\`, or read \`package.json\` directly) to check package dependencies.
`;

    const skillContent = `---
name: context-guard
description: >-
  Uses ContextGuard to inspect large files, outlines, and structural AST skeletons safely without blowing up the context window. Use whenever exploring unfamiliar files, large components (>300 lines), or auditing token consumption.
---

# 🛡️ ContextGuard Skill for Antigravity

ContextGuard provides intelligent context admission control, reducing token usage by up to 90% when reading large source files.

## Workflow:
1. Inspect file outline first: \`inspect_outline(file_path)\`
2. Read safe content: \`read_file_safe(file_path)\`
3. Read targeted ranges: \`read_file_safe(file_path, start_line=N, end_line=M)\`
4. Search symbols structurally: \`grep_distilled(pattern=...)\`
`;

    fs.writeFileSync(path.join(rulesDir, 'context-guard.md'), ruleContent, 'utf-8');
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent, 'utf-8');

    // Add or merge .agents/mcp.json
    const mcpFile = path.join(agentsDir, 'mcp.json');
    let mcpConfig: any = { mcpServers: {} };
    if (fs.existsSync(mcpFile)) {
      try { mcpConfig = JSON.parse(fs.readFileSync(mcpFile, 'utf-8')); } catch {}
    }
    mcpConfig.mcpServers = mcpConfig.mcpServers || {};
    mcpConfig.mcpServers['context-guard'] = {
      command: 'npx',
      args: ['-y', '-p', '@kevinbermudezc/context-guard@latest', 'context-guard-mcp']
    };
    fs.writeFileSync(mcpFile, JSON.stringify(mcpConfig, null, 2), 'utf-8');

    configured.push(`Google Antigravity (.agents/rules, .agents/skills, .agents/mcp.json)`);
  }

  // 2. Cursor Adapter (.cursor/rules/context-guard.mdc & .cursor/mcp.json)
  if (['all', 'cursor'].includes(agent)) {
    const cursorDir = path.join(rootDir, '.cursor');
    const rulesDir = path.join(cursorDir, 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });

    const cursorRuleContent = `---
description: ContextGuard FinOps and Context Window Admission Control
globs: *
alwaysApply: true
---

# 🛡️ ContextGuard Rule for Cursor (Composer & Chat)

You MUST follow these context admission control and token optimization rules:
1. Zero direct reads for files >300 lines without slice bounds.
2. Prioritize ContextGuard MCP tools:
   - \`read_file_safe(file_path)\`: Returns AST skeleton automatically for files >300 lines.
   - \`inspect_outline(file_path)\`: Instant zero-cost structural outline (<5ms).
   - Read targeted slices: \`read_file_safe(file_path, start_line, end_line)\`.
3. Never read lockfiles (\`package-lock.json\`, \`pnpm-lock.yaml\`) or minified bundles.
`;

    fs.writeFileSync(path.join(rulesDir, 'context-guard.mdc'), cursorRuleContent, 'utf-8');

    const cursorMcpFile = path.join(cursorDir, 'mcp.json');
    let cursorMcpConfig: any = { mcpServers: {} };
    if (fs.existsSync(cursorMcpFile)) {
      try { cursorMcpConfig = JSON.parse(fs.readFileSync(cursorMcpFile, 'utf-8')); } catch {}
    }
    cursorMcpConfig.mcpServers = cursorMcpConfig.mcpServers || {};
    cursorMcpConfig.mcpServers['context-guard'] = {
      command: 'npx',
      args: ['-y', '-p', '@kevinbermudezc/context-guard@latest', 'context-guard-mcp']
    };
    fs.writeFileSync(cursorMcpFile, JSON.stringify(cursorMcpConfig, null, 2), 'utf-8');

    configured.push(`Cursor (.cursor/rules/context-guard.mdc, .cursor/mcp.json)`);
  }

  // 3. Claude Code Adapter (.claude/settings.json PreToolUse hook)
  if (['all', 'claude'].includes(agent)) {
    const claudeDir = path.join(rootDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    const settingsFile = path.join(claudeDir, 'settings.json');
    let settings: any = {};
    if (fs.existsSync(settingsFile)) {
      try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8')); } catch {}
    }

    settings.hooks = settings.hooks || {};
    settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
    const hookCmd = 'npx -y -p @kevinbermudezc/context-guard context-guard-hook';

    const exists = settings.hooks.PreToolUse.some((h: any) => 
      h.command && h.command.includes('context-guard-hook')
    );

    if (!exists) {
      settings.hooks.PreToolUse.push({
        matcher: 'Read|View|view_file|readFile|read_file|Bash|bash',
        command: hookCmd
      });
    }

    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
    configured.push(`Claude Code (.claude/settings.json PreToolUse hook)`);
  }

  for (const item of configured) {
    console.log(`  ${c.green}✔ Adaptador configurado:${c.reset} ${item}`);
  }

  console.log(`
  ${c.bold}🚀 ¡Todo listo!${c.reset} Tus agentes ahora respetarán los límites de contexto y optimizarán tokens automáticamente.
`);
}

// ─── Single File Execution Card ───────────────────────────────────────────────

function printExecutionCard(filePath: string, result: any): void {
  const statusLabels: Record<string, string> = {
    PASSTHROUGH_FULL: `${c.green}PASSTHROUGH (Directo)${c.reset}`,
    PASSTHROUGH_SLICE: `${c.green}SLICE (Rango acotado)${c.reset}`,
    SHUNTED_LOCAL_AST: `${c.cyan}SHUNTED (Esqueleto AST Tier 0)${c.reset}`,
    SHUNTED_WORKER_MODEL: `${c.magenta}WORKER (Resumen ligero)${c.reset}`,
    BLOCKED_BINARY: `${c.red}BLOCKED (Archivo Binario)${c.reset}`,
    BLOCKED_LOCKFILE: `${c.red}BLOCKED (Lockfile)${c.reset}`,
    BLOCKED_MINIFIED: `${c.red}BLOCKED (Minificado)${c.reset}`,
    ERROR: `${c.red}ERROR${c.reset}`
  };

  const label = statusLabels[result.status] || result.status;
  const fileName = path.basename(filePath);
  const m = result.metrics;

  console.log(`
  ${c.cyan}🛡️  ${c.bold}${fileName}${c.reset} ${c.gray}•${c.reset} ${label} ${c.gray}•${c.reset} ${result.totalLines ? `${result.totalLines} líneas (~${((result.sizeBytes || 0) / 1024).toFixed(1)} KB)` : ''}`);

  if (m && m.tokensSaved > 0) {
    console.log(`  ${c.green}📉 Ahorro:${c.reset} ${c.bold}-${m.tokensSaved.toLocaleString()} tokens (-${m.percentageSaved}%)${c.reset} ${c.gray}(~$${m.dollarsSaved.claudeSonnet55} USD en Claude Sonnet 5.5)${c.reset}`);
  }
  console.log('');
}

// ─── CLI Entrypoint ───────────────────────────────────────────────────────────

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log(`ContextGuard v${VERSION}`);
    process.exit(0);
  }

  // Subcommand: init
  if (args[0] === 'init') {
    initWorkspace(args[1]);
    return;
  }

  // Subcommand: stats
  if (args[0] === 'stats') {
    printStats(args);
    return;
  }

  // Subcommand: telemetry
  if (args[0] === 'telemetry') {
    const action = args[1] || 'status';
    if (action === 'status') {
      const enabled = isTelemetryEnabled();
      const anonId = getAnonymousId();
      console.log(`
  ${c.cyan}🛡️  ${c.bold}ContextGuard Telemetry Status${c.reset}
  ${c.gray}──────────────────────────────────────────${c.reset}
  ${c.bold}Estado:${c.reset}            ${enabled ? `${c.green}● Habilitada (Opt-in/Default)${c.reset}` : `${c.red}○ Deshabilitada (Opt-out)${c.reset}`}
  ${c.bold}Anonymous ID:${c.reset}      ${c.dim}${anonId}${c.reset}
  ${c.bold}Privacidad:${c.reset}        ${c.gray}Zero PII (Sin IPs, sin rutas de archivo, sin código)${c.reset}
  
  ${c.dim}Para deshabilitar: context-guard telemetry disable (o DO_NOT_TRACK=1)${c.reset}
  ${c.dim}Para habilitar:    context-guard telemetry enable${c.reset}
`);
      return;
    }

    if (action === 'disable') {
      disableTelemetry();
      console.log(`\n  ${c.green}✔${c.reset} Telemetría anónima ${c.bold}deshabilitada${c.reset} correctamente.\n`);
      return;
    }

    if (action === 'enable') {
      enableTelemetry();
      console.log(`\n  ${c.green}✔${c.reset} Telemetría anónima ${c.bold}habilitada${c.reset} correctamente. Gracias por ayudar a mejorar ContextGuard.\n`);
      return;
    }

    console.error(`\n  ${c.red}✖ Acción desconocida:${c.reset} ${action}. Usa "status", "enable" o "disable".\n`);
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  let query = '';
  let startLine: number | undefined;
  let endLine: number | undefined;
  let forceWorker = false;
  let outputJson = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--query' || args[i] === '-q') query = args[++i];
    if (args[i] === '--start') startLine = parseInt(args[++i], 10);
    if (args[i] === '--end') endLine = parseInt(args[++i], 10);
    if (args[i] === '--force-worker') forceWorker = true;
    if (args[i] === '--json') outputJson = true;
  }

  const result = await processWithContextGuard({
    filePath,
    query,
    startLine,
    endLine,
    forceWorker
  });

  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.error) {
      console.error(`\n  ${c.red}✖ [ContextGuard Error]${c.reset} ${result.error}\n`);
      process.exit(1);
    }

    printExecutionCard(filePath, result);
    console.log(result.content);
  }
}

runCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
