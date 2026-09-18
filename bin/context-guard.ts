#!/usr/bin/env node

import path from 'node:path';
import { processWithContextGuard } from '../src/index.js';

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
ContextGuard CLI v1.0.0
Intelligent context admission control & token optimization

Usage:
  context-guard <file-path> [options]

Options:
  --query, -q <text>      Semantic search / intent filter for worker model
  --start <num>           Start line number (1-indexed slice passthrough)
  --end <num>             End line number (1-indexed slice passthrough)
  --force-worker          Force routing through worker model
  --json                  Output result in JSON format
  --help, -h              Show this help menu
    `);
    process.exit(0);
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
      console.error(`[Error] ${result.error}`);
      process.exit(1);
    }
    console.log(result.content);
  }
}

runCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
