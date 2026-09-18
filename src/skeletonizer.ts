/**
 * Tier 0 Structural Skeletonizer
 * Extracts structural declarations, signatures, imports, and types with line numbers.
 * Supports TypeScript, JavaScript, Python, Go, Rust, Java, C#, and
 * Frontend Single File Components (Svelte, Vue, Angular, Astro).
 * Cost: $0.00 | Execution: < 5ms
 */

import { isImportLine, collapseImportWall } from './import-collapser.js';

const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  // TypeScript, JavaScript & Angular
  ts: [
    /^(export\s+)?(default\s+)?(class|interface|type|enum)\s+([A-Za-z0-9_]+)/,
    /^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/,
    /^(export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(async\s*)?\(/,
    /^(export\s+)?((public|private|protected|static|async|readonly|\*)\s+)*([A-Za-z0-9_]+)\s*\([^)]*\)\s*[:{]/,
    // Angular Decorators & Signals
    /^@(Component|Injectable|Directive|Pipe|NgModule)\s*\(/,
    /^@(Input|Output)\s*\(\s*\)\s+([A-Za-z0-9_]+)/,
    /^(public|private|protected|readonly|\s+)*(readonly\s+)?([A-Za-z0-9_]+)\s*=\s*(input|output|model|computed|signal)(\.[A-Za-z0-9_]+)?\s*[\(<]/,
    /^(ngOnInit|ngOnChanges|ngOnDestroy|ngAfterViewInit)\s*\(/
  ],
  // Svelte Component Logic
  svelte: [
    /^(export\s+)?let\s+([A-Za-z0-9_]+)/,
    /^(let|const)\s+([A-Za-z0-9_{}\s,]+)\s*=\s*\$(props|state|derived|effect)\s*\(/,
    /^\$:\s+/,
    /^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/,
    /^(export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(async\s*)?\(/
  ],
  // Vue Component Logic
  vue: [
    /^(const|let)\s+([A-Za-z0-9_{}\s,]+)\s*=\s*(defineProps|defineEmits|defineModel)\s*[\(<]/,
    /^(const|let)\s+([A-Za-z0-9_]+)\s*=\s*(ref|computed|reactive)\s*[\(<]/,
    /^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/,
    /^(export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(async\s*)?\(/
  ],
  // Astro Component Frontmatter
  astro: [
    /^(export\s+)?interface\s+Props/,
    /^(const|let)\s+([A-Za-z0-9_{}\s,]+)\s*=\s*Astro\.props/,
    /^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/,
    /^(export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(async\s*)?\(/
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
    svelte: 'svelte',
    vue: 'vue',
    astro: 'astro',
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

  // Separate import lines and scan for style blocks
  const importLines: string[] = [];
  const bodyItems: { lineNum: number; text: string }[] = [];

  let insideStyleBlock = false;
  let styleStartLine = 0;
  let styleLineCount = 0;

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // 1. Detect and collapse <style> blocks (Svelte / Vue)
    if (trimmed.startsWith('<style') && !insideStyleBlock) {
      insideStyleBlock = true;
      styleStartLine = lineNum;
      styleLineCount = 1;
      return;
    }

    if (insideStyleBlock) {
      styleLineCount++;
      if (trimmed.includes('</style>')) {
        insideStyleBlock = false;
        const styleEndLine = lineNum;
        if (styleLineCount > 5) {
          bodyItems.push({
            lineNum: styleStartLine,
            text: `[L${styleStartLine}-L${styleEndLine}] 🎨 ${styleLineCount} líneas de CSS colapsadas. Corre Read(offset=${styleStartLine}, limit=${styleLineCount}) si necesitas estilos.`
          });
        }
      }
      return;
    }

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
      return;
    }

    // 2. Check for imports
    if (isImportLine(line, ext)) {
      importLines.push(line);
      return;
    }

    // 3. Match Structural Patterns
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        const clean = trimmed.replace(/\{\s*$/, '').trim();
        bodyItems.push({ lineNum, text: `[L${lineNum}] ${clean}` });
        break;
      }
    }
  });

  // 4. Process and collapse import statements
  if (importLines.length > 0) {
    const collapsed = collapseImportWall(importLines, ext, 5);
    if (collapsed.hasCollapsed) {
      skeleton.push(collapsed.lines[0]);
    } else {
      // If <= 5 imports, keep them as individual lines
      importLines.forEach((impLine) => {
        const originalIndex = lines.findIndex((l) => l.trim() === impLine.trim());
        const lNum = originalIndex !== -1 ? originalIndex + 1 : 1;
        skeleton.push(`[L${lNum}] ${impLine.trim()}`);
      });
    }
  }

  // 5. Append body structural declarations
  bodyItems.forEach((item) => {
    skeleton.push(item.text);
  });

  return skeleton.length > 0 ? skeleton.join('\n') : null;
}
