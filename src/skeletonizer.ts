/**
 * Tier 0 Structural Skeletonizer
 * Extracts structural declarations, signatures, imports, and types with line numbers.
 * Cost: $0.00 | Execution: < 5ms
 */

const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  // TypeScript & JavaScript
  ts: [
    /^(export\s+)?(default\s+)?(class|interface|type|enum)\s+([A-Za-z0-9_]+)/,
    /^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/,
    /^(export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(async\s*)?\(/,
    /^(export\s+)?((public|private|protected|static|async|\*)\s+)*([A-Za-z0-9_]+)\s*\([^)]*\)\s*[:{]/
  ],
  // Python
  py: [
    /^(async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/,
    /^class\s+([A-Za-z0-9_]+)(\s*\([^)]*\))?:/
  ],
  // Go
  go: [
    /^func\s+(\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/,
    /^type\s+([A-Za-z0-9_]+)\s+(struct|interface)/
  ],
  // Rust
  rs: [
    /^(pub\s+)?(async\s+)?fn\s+([A-Za-z0-9_]+)/,
    /^(pub\s+)?(struct|enum|trait|type)\s+([A-Za-z0-9_]+)/,
    /^impl(\s+<[^>]+>)?\s+([A-Za-z0-9_]+)/
  ],
  // Java / C#
  java: [
    /^(public|private|protected|static|final|native|synchronized|abstract|\s+)+[\w\<\>\[\]]+\s+([A-Za-z0-9_]+)\s*\([^\)]*\)\s*(\{)?/,
    /^(public|private|protected|static|abstract|\s+)+(class|interface|enum|record)\s+([A-Za-z0-9_]+)/
  ]
};

export function isSupportedExtension(ext: string): string | null {
  const normalized = ext.toLowerCase().replace(/^\./, '');
  const mapping: Record<string, string> = {
    ts: 'ts', tsx: 'ts', js: 'ts', jsx: 'ts', mjs: 'ts', cjs: 'ts',
    py: 'py',
    go: 'go',
    rs: 'rs',
    java: 'java', cs: 'java'
  };
  return mapping[normalized] || null;
}

export function extractCodeSkeleton(content: string, ext: string): string | null {
  const langKey = isSupportedExtension(ext);
  if (!langKey) return null;

  const patterns = LANGUAGE_PATTERNS[langKey] || [];
  const lines = content.split('\n');
  const skeleton: string[] = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
      return;
    }

    // Keep top-level import/from statements
    if (trimmed.startsWith('import ') || trimmed.startsWith('from ') || (langKey === 'go' && trimmed.startsWith('import ('))) {
      skeleton.push(`[L${lineNum}] ${trimmed}`);
      return;
    }

    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        // Strip trailing curly braces or semicolons for brevity
        const clean = trimmed.replace(/\{\s*$/, '').trim();
        skeleton.push(`[L${lineNum}] ${clean}`);
        break;
      }
    }
  });

  return skeleton.length > 0 ? skeleton.join('\n') : null;
}
