#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { processWithContextGuard } from '../src/index.js';
import { extractCodeSkeleton } from '../src/skeletonizer.js';
import { getAggregatedStats, resetMetrics, calculateFinOps } from '../src/token-metrics.js';

// ─── ANSI Colors & Terminal Formatting (Zero-Dependencies) ────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  
  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  // Backgrounds
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m'
};

const VERSION = '1.3.0';

// ─── Help Menu ────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
  ${c.cyan}🛡️  ${c.bold}ContextGuard CLI${c.reset} ${c.gray}v${VERSION}${c.reset}
  ${c.dim}Intelligent Context Admission Control & FinOps Optimization${c.reset}

  ${c.bold}USAGE${c.reset}
    ${c.green}$ context-guard${c.reset} <file-path> [options]
    ${c.green}$ context-guard stats${c.reset} [path] [options]

  ${c.bold}COMMANDS${c.reset}
    ${c.cyan}stats${c.reset} [dir]          ${c.white}Muestra la telemetría acumulada o audita un directorio${c.reset}
    ${c.cyan}stats --watch${c.reset}        ${c.white}Monitor interactivo de consumo y ahorro en tiempo real${c.reset}
    ${c.cyan}stats --reset${c.reset}        ${c.white}Reinicia el historial de métricas locales${c.reset}

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
    ${c.cyan}context-guard${c.reset} src/large-service.ts

    ${c.dim}# Lee un rango acotado sin aplicar el guard${c.reset}
    ${c.cyan}context-guard${c.reset} src/large-service.ts --start 120 --end 160

    ${c.dim}# Consulta el ahorro histórico de tokens y dinero${c.reset}
    ${c.cyan}context-guard stats${c.reset}

    ${c.dim}# Audita el potencial de ahorro de un directorio completo${c.reset}
    ${c.cyan}context-guard stats${c.reset} src/

    ${c.dim}# Monitor en tiempo real mientras usas Claude Code o Cursor${c.reset}
    ${c.cyan}context-guard stats --watch${c.reset}
`);
}

// ─── Directory Auditor (Option B) ─────────────────────────────────────────────

function auditDirectory(targetDir: string): void {
  const resolved = path.resolve(process.cwd(), targetDir);
  if (!fs.existsSync(resolved)) {
    console.error(`${c.red}✖ Error:${c.reset} El directorio no existe: ${targetDir}`);
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
  const opusDollars = ((tokensSaved / 1_000_000) * 15.00).toFixed(2);
  const sonnetDollars = ((tokensSaved / 1_000_000) * 3.00).toFixed(2);

  console.log(`
  ${c.cyan}🔍 ${c.bold}Auditoría de Código y FinOps: ${c.white}${path.relative(process.cwd(), resolved) || '.'}${c.reset}
  ${c.gray}Analizados ${filesToAudit.length} archivos fuente (${largeFilesCount} archivos superan las 300 líneas)${c.reset}

  ${c.bold}┌─────────────────────────────────────────────────────────────────┐${c.reset}
  │  ${c.yellow}Escenario de Lectura Cruda:${c.reset}   ~${totalRawTokens.toLocaleString().padStart(8)} tokens                    │
  │  ${c.green}Con ContextGuard (AST):${c.reset}       ~${totalGuardedTokens.toLocaleString().padStart(8)} tokens                    │
  │                                                                 │
  │  ${c.bold}${c.green}📉 Ahorro potencial:${c.reset}          ${c.bold}~${tokensSaved.toLocaleString()}${c.reset} tokens (${c.bold}${pctSaved}%${c.reset} reducción)      │
  │                                                                 │
  │  ${c.bold}💰 Estimación de Ahorro en Dólares:${c.reset}                           │
  │     • Claude Opus 4/5:         ${c.green}$${opusDollars} USD${c.reset}                         │
  │     • Claude Sonnet 4:         ${c.green}$${sonnetDollars} USD${c.reset}                         │
  ${c.bold}└─────────────────────────────────────────────────────────────────┘${c.reset}
  `);
}

// ─── Real-Time Live Watcher (Real-time telemetry) ─────────────────────────────

function runRealtimeWatch(): void {
  // Clear screen
  process.stdout.write('\x1b[2J\x1b[0;0H');

  const render = () => {
    process.stdout.write('\x1b[0;0H'); // cursor to home
    const stats = getAggregatedStats();
    const time = new Date().toLocaleTimeString();

    console.log(`
  ${c.cyan}🛡️  ${c.bold}ContextGuard Live Telemetry Monitor${c.reset} ${c.gray}[${time}]${c.reset}
  ${c.dim}Escuchando intercepciones activas de Claude Code, Cursor y MCP...${c.reset}

  ${c.bold}┌── 📊 Métricas Globales Acumuladas ─────────────────────────────┐${c.reset}
  │  Archivos Regulados:        ${c.bold}${c.cyan}${stats.totalInterceptions.toString().padEnd(10)}${c.reset}                       │
  │  Tokens Crudos Evitados:    ${c.bold}${c.yellow}${stats.totalRawTokens.toLocaleString().padEnd(12)}${c.reset}                     │
  │  Tokens AST Inyectados:     ${c.bold}${c.white}${stats.totalGuardedTokens.toLocaleString().padEnd(12)}${c.reset}                     │
  │  ${c.green}${c.bold}Tokens Netos Ahorrados:${c.reset}    ${c.bold}${c.green}${stats.totalTokensSaved.toLocaleString().padEnd(12)}${c.reset}                     │
  │                                                                 │
  │  ${c.bold}💰 Retorno de Inversión (ROI Estimado):${c.reset}                       │
  │     • Claude Opus 4/5:      ${c.bold}${c.green}$${stats.totalDollarsSavedOpus.toFixed(2)} USD${c.reset}                        │
  │     • Claude Sonnet 4:      ${c.bold}${c.green}$${stats.totalDollarsSavedSonnet.toFixed(2)} USD${c.reset}                        │
  │     • GPT-4o / Astra:       ${c.bold}${c.green}$${stats.totalDollarsSavedGpt4o.toFixed(2)} USD${c.reset}                        │
  ${c.bold}└── 📋 Últimos Eventos Registrados ───────────────────────────────┘${c.reset}
`);

    const recent = stats.events.slice(-6).reverse();
    if (recent.length === 0) {
      console.log(`     ${c.dim}Aún no hay eventos registrados. Usa Claude Code o el CLI para ver tráfico.${c.reset}\n`);
    } else {
      for (const ev of recent) {
        const badge = ev.source === 'hook' ? `${c.magenta}[HOOK]${c.reset}` : `${c.blue}[CLI]${c.reset} `;
        const fName = ev.filePath.length > 28 ? '...' + ev.filePath.slice(-25) : ev.filePath.padEnd(28);
        console.log(`  ${c.dim}${ev.timestamp.slice(11, 19)}${c.reset} ${badge} ${c.white}${fName}${c.reset} 📉 ${c.green}+${ev.tokensSaved.toLocaleString()} tokens${c.reset} ${c.gray}(~$${ev.dollarsSavedSonnet})${c.reset}`);
      }
      console.log('');
    }

    console.log(`  ${c.gray}Presiona Ctrl+C para salir.${c.reset}`);
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
  ${c.cyan}🛡️  ${c.bold}ContextGuard — Resumen FinOps & Telemetría${c.reset}
  ${c.gray}Métricas calculadas en base a intercepciones en tu máquina${c.reset}

  ${c.bold}┌── 📈 Balance de Tokens ─────────────────────────────────────────┐${c.reset}
  │  Intercepciones totales:    ${c.bold}${c.cyan}${stats.totalInterceptions.toString().padEnd(10)}${c.reset}                       │
  │  Tokens crudos solicitados: ${c.bold}${c.yellow}${stats.totalRawTokens.toLocaleString().padEnd(12)}${c.reset}                     │
  │  Tokens procesados (AST):   ${c.bold}${c.white}${stats.totalGuardedTokens.toLocaleString().padEnd(12)}${c.reset}                     │
  │  ${c.green}${c.bold}Tokens netos ahorrados:${c.reset}    ${c.bold}${c.green}${stats.totalTokensSaved.toLocaleString().padEnd(12)}${c.reset}                     │
  │                                                                 │
  │  ${c.bold}💰 Ahorro Estimado en Dólares:${c.reset}                                │
  │     • Claude Opus 4/5:      ${c.bold}${c.green}$${stats.totalDollarsSavedOpus.toFixed(2)} USD${c.reset}                        │
  │     • Claude Sonnet 4:      ${c.bold}${c.green}$${stats.totalDollarsSavedSonnet.toFixed(2)} USD${c.reset}                        │
  │     • GPT-4o / Astra:       ${c.bold}${c.green}$${stats.totalDollarsSavedGpt4o.toFixed(2)} USD${c.reset}                        │
  ${c.bold}└─────────────────────────────────────────────────────────────────┘${c.reset}

  ${c.dim}👉 Corre "context-guard stats --watch" para ver el flujo en tiempo real.${c.reset}
  ${c.dim}👉 Corre "context-guard stats <directorio>" para auditar un proyecto.${c.reset}
`);
}

// ─── Single File Execution Card ───────────────────────────────────────────────

function printExecutionCard(filePath: string, result: any): void {
  const statusColor: Record<string, string> = {
    PASSTHROUGH_FULL: `${c.green}✅ PASSTHROUGH (Directo)${c.reset}`,
    PASSTHROUGH_SLICE: `${c.green}✅ SLICE (Rango acotado)${c.reset}`,
    SHUNTED_LOCAL_AST: `${c.cyan}🛡️ SHUNTED (Esqueleto AST Tier 0)${c.reset}`,
    SHUNTED_WORKER_MODEL: `${c.magenta}🤖 WORKER (Resumen ligero)${c.reset}`,
    BLOCKED_BINARY: `${c.red}🛑 BLOCKED (Archivo Binario)${c.reset}`,
    BLOCKED_LOCKFILE: `${c.red}🛑 BLOCKED (Lockfile masivo)${c.reset}`,
    BLOCKED_MINIFIED: `${c.red}🛑 BLOCKED (Código Minificado)${c.reset}`,
    ERROR: `${c.red}✖ ERROR${c.reset}`
  };

  const badge = statusColor[result.status] || result.status;
  const fileName = path.basename(filePath);
  const m = result.metrics;

  console.log(`
  ${c.bold}┌── 🛡️ ContextGuard ──────────────────────────────────────────────┐${c.reset}
  │  ${c.bold}Archivo:${c.reset}   ${c.white}${fileName.padEnd(46)}${c.reset}│
  │  ${c.bold}Estado:${c.reset}    ${badge.padEnd(55)}│
  │  ${c.bold}Líneas:${c.reset}    ${(result.totalLines ? `${result.totalLines} líneas (~${((result.sizeBytes || 0) / 1024).toFixed(1)} KB)` : 'N/A').padEnd(46)}│`);

  if (m && m.tokensSaved > 0) {
    console.log(`  │  ${c.bold}Ahorro:${c.reset}    ${c.green}${c.bold}-${m.tokensSaved.toLocaleString()} tokens (-${m.percentageSaved}%)${c.reset} ${c.gray}(~$${m.dollarsSaved.claudeSonnet} en Sonnet)${c.reset}   │`);
  }

  console.log(`  ${c.bold}└─────────────────────────────────────────────────────────────────┘${c.reset}
`);
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

  // Subcommand: stats
  if (args[0] === 'stats') {
    printStats(args);
    return;
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
      console.error(`${c.red}✖ [ContextGuard Error]${c.reset} ${result.error}`);
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
