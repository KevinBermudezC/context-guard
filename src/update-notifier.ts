/**
 * Fast, non-blocking update notifier for ContextGuard CLI.
 * 
 * Design Principles:
 * - Zero latency impact: checks local cache file first (< 1ms).
 * - Background refresh: only polls npm registry once every 24 hours.
 * - Clean terminal design: subtle, single-line or clean two-line layout without broken box-drawing ASCII/ANSI frames.
 * - Silent failure: never throws, never logs errors, never hangs if offline.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface UpdateCheckCache {
  lastChecked: number;
  latestVersion: string;
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@kevinbermudezc/context-guard/latest';

function getContextGuardDir(): string {
  const dir = process.env.CONTEXT_GUARD_DIR || path.join(os.homedir(), '.contextguard');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return dir;
}

function getCacheFilePath(): string {
  return path.join(getContextGuardDir(), 'update-check.json');
}

/**
 * Compares semantic versions (e.g., '1.4.1' > '1.4.0').
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((p) => parseInt(p, 10) || 0);
  const [lMaj, lMin, lPat] = parse(latest);
  const [cMaj, cMin, cPat] = parse(current);

  if (lMaj > cMaj) return true;
  if (lMaj < cMaj) return false;
  if (lMin > cMin) return true;
  if (lMin < cMin) return false;
  return lPat > cPat;
}

/**
 * Reads local cached update check result.
 */
export function getCachedLatestVersion(): string | null {
  try {
    const file = getCacheFilePath();
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf-8');
    const data: UpdateCheckCache = JSON.parse(raw);
    return data.latestVersion || null;
  } catch {
    return null;
  }
}

/**
 * Saves update check result to local cache.
 */
export function saveUpdateCache(latestVersion: string): void {
  try {
    const file = getCacheFilePath();
    const data: UpdateCheckCache = {
      lastChecked: Date.now(),
      latestVersion
    };
    fs.writeFileSync(file, JSON.stringify(data), 'utf-8');
  } catch {}
}

/**
 * Checks if the 24-hour cache has expired.
 */
export function shouldCheckRegistry(): boolean {
  try {
    const file = getCacheFilePath();
    if (!fs.existsSync(file)) return true;
    const raw = fs.readFileSync(file, 'utf-8');
    const data: UpdateCheckCache = JSON.parse(raw);
    return Date.now() - (data.lastChecked || 0) > CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

/**
 * Triggers an asynchronous, non-blocking check to the npm registry.
 * Completely fire-and-forget; never delays command termination or errors.
 */
export function refreshLatestVersionInBackground(): void {
  if (!shouldCheckRegistry()) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  fetch(NPM_REGISTRY_URL, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: controller.signal
  })
    .then((res) => {
      if (!res.ok) return null;
      return res.json() as Promise<{ version?: string }>;
    })
    .then((data) => {
      if (data && typeof data.version === 'string') {
        saveUpdateCache(data.version);
      }
    })
    .catch(() => {})
    .finally(() => clearTimeout(timeout));
}

/**
 * Checks if a newer version is known and formats a clean notification.
 * Returns null if current is up-to-date or if no check is available.
 */
export function getUpdateNotice(currentVersion: string): { latestVersion: string; message: string } | null {
  // Always trigger background refresh if cache is expired
  refreshLatestVersionInBackground();

  const cachedLatest = getCachedLatestVersion();
  if (!cachedLatest) {
    return null;
  }

  if (isNewerVersion(cachedLatest, currentVersion)) {
    const c = {
      yellow: '\x1b[33m',
      green: '\x1b[32m',
      cyan: '\x1b[36m',
      dim: '\x1b[2m',
      bold: '\x1b[1m',
      reset: '\x1b[0m'
    };

    const message = [
      `  ${c.yellow}▲${c.reset} ${c.bold}ContextGuard update available:${c.reset} ${c.dim}v${currentVersion}${c.reset} → ${c.green}${c.bold}v${cachedLatest}${c.reset}`,
      `  ${c.dim}Run:${c.reset} ${c.cyan}npm i -g @kevinbermudezc/context-guard@latest${c.reset}`
    ].join('\n');

    return {
      latestVersion: cachedLatest,
      message
    };
  }

  return null;
}
