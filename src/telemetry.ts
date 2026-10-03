/**
 * Anonymous Opt-Out Telemetry System for ContextGuard
 * 
 * Provides privacy-preserving analytics on active developer installations,
 * client distribution (Claude Code, Cursor, MCP), and global tokens saved.
 * 
 * Privacy Principles:
 * - Zero PII: No IP addresses stored, no file paths, no code snippets.
 * - Anonymous Machine ID: Pure random UUIDv4 stored in ~/.contextguard/anonymous-id.
 * - Non-blocking: Sub-1000ms timeout with fire-and-forget async fetch; never impedes startup.
 * - Respects DO_NOT_TRACK=1, CONTEXT_GUARD_TELEMETRY=0, and `context-guard telemetry disable`.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export interface TelemetryPayload {
  anonymousId: string;
  version: string;
  source: 'cli' | 'mcp' | 'hook';
  event: 'heartbeat' | 'file_intercepted' | 'outline_inspected';
  os: string;
  arch: string;
  tokensSaved?: number;
}

const DEFAULT_ENDPOINT = 'https://telemetry.contextguard.dev/api/v1/event';

function getContextGuardDir(): string {
  const dir = process.env.CONTEXT_GUARD_DIR || path.join(os.homedir(), '.contextguard');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return dir;
}

/**
 * Checks if the developer has opted out of anonymous telemetry.
 */
export function isTelemetryEnabled(): boolean {
  if (process.env.CONTEXT_GUARD_TELEMETRY === '0' || process.env.CONTEXT_GUARD_TELEMETRY === 'false') {
    return false;
  }
  if (process.env.DO_NOT_TRACK === '1') {
    return false;
  }
  const disabledFile = path.join(getContextGuardDir(), 'telemetry-disabled');
  if (fs.existsSync(disabledFile)) {
    return false;
  }
  return true;
}

/**
 * Disables anonymous telemetry locally.
 */
export function disableTelemetry(): void {
  const disabledFile = path.join(getContextGuardDir(), 'telemetry-disabled');
  try {
    fs.writeFileSync(disabledFile, '1', 'utf-8');
  } catch {}
}

/**
 * Enables anonymous telemetry locally.
 */
export function enableTelemetry(): void {
  const disabledFile = path.join(getContextGuardDir(), 'telemetry-disabled');
  if (fs.existsSync(disabledFile)) {
    try {
      fs.unlinkSync(disabledFile);
    } catch {}
  }
}

/**
 * Retrieves or generates an anonymous, cryptographically random machine ID (UUIDv4).
 * Absolutely no hardware serials, MAC addresses, or usernames are collected.
 */
export function getAnonymousId(): string {
  const idFile = path.join(getContextGuardDir(), 'anonymous-id');
  if (fs.existsSync(idFile)) {
    try {
      const existing = fs.readFileSync(idFile, 'utf-8').trim();
      if (existing && existing.length >= 16) {
        return existing;
      }
    } catch {}
  }

  const newId = crypto.randomUUID();
  try {
    fs.writeFileSync(idFile, newId, 'utf-8');
  } catch {}
  return newId;
}

/**
 * Sends a lightweight, non-blocking anonymous telemetry ping.
 * Completely fire-and-forget; silent failure on network timeout or offline state.
 */
export function sendTelemetryPing(
  source: 'cli' | 'mcp' | 'hook',
  event: 'heartbeat' | 'file_intercepted' | 'outline_inspected',
  version: string,
  tokensSaved?: number
): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  const endpoint = process.env.CONTEXT_GUARD_TELEMETRY_ENDPOINT || DEFAULT_ENDPOINT;
  const payload: TelemetryPayload = {
    anonymousId: getAnonymousId(),
    version,
    source,
    event,
    os: os.platform(),
    arch: os.arch(),
    ...(tokensSaved ? { tokensSaved } : {})
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);

  // Fire-and-forget fetch, ensuring no rejection unhandled or process hang
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal
  })
    .catch(() => {})
    .finally(() => clearTimeout(timeout));
}
