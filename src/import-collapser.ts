export interface CollapsedImportResult {
  hasCollapsed: boolean;
  lines: string[];
}

interface RawImport {
  lineNum: number;
  rawText: string;
  source: string;
  isExternal: boolean;
}

/**
 * Parses import source from JS/TS and Python statements
 */
function extractImportSource(line: string): { source: string; isExternal: boolean } | null {
  const trimmed = line.trim();

  // TypeScript / JavaScript: import ... from 'source' or import 'source'
  const tsMatch = trimmed.match(/from\s+['"]([^'"]+)['"]/);
  if (tsMatch) {
    const src = tsMatch[1];
    return { source: src, isExternal: !src.startsWith('.') };
  }
  const tsBareMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
  if (tsBareMatch) {
    const src = tsBareMatch[1];
    return { source: src, isExternal: !src.startsWith('.') };
  }

  // Python: from module import ... or import module
  const pyFromMatch = trimmed.match(/^from\s+([A-Za-z0-9_.]+)\s+import/);
  if (pyFromMatch) {
    const src = pyFromMatch[1];
    return { source: src, isExternal: !src.startsWith('.') };
  }
  const pyImportMatch = trimmed.match(/^import\s+([A-Za-z0-9_.]+)/);
  if (pyImportMatch) {
    const src = pyImportMatch[1];
    return { source: src, isExternal: !src.startsWith('.') };
  }

  return null;
}

/**
 * Checks if a line is an import statement
 */
export function isImportLine(line: string, ext: string): boolean {
  const trimmed = line.trim();
  const normalized = ext.toLowerCase().replace(/^\./, '');

  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'svelte', 'vue', 'astro'].includes(normalized)) {
    return trimmed.startsWith('import ') || trimmed.startsWith('import{') || /^const\s+.*\s*=\s*require\(/.test(trimmed);
  }

  if (normalized === 'py') {
    return trimmed.startsWith('import ') || trimmed.startsWith('from ');
  }

  if (normalized === 'go') {
    return trimmed.startsWith('import ') || trimmed.startsWith('import (');
  }

  return false;
}

/**
 * Processes a collection of lines, collapsing import walls exceeding threshold
 */
export function collapseImportWall(rawLines: string[], ext: string, maxThreshold: number = 5): CollapsedImportResult {
  const imports: RawImport[] = [];
  const otherLines: { lineNum: number; text: string }[] = [];

  rawLines.forEach((line, index) => {
    const lineNum = index + 1;
    if (isImportLine(line, ext)) {
      const parsed = extractImportSource(line) || { source: '', isExternal: true };
      imports.push({
        lineNum,
        rawText: line.trim(),
        source: parsed.source,
        isExternal: parsed.isExternal
      });
    } else {
      otherLines.push({ lineNum, text: line });
    }
  });

  // If imports are below or equal to threshold, keep them intact
  if (imports.length <= maxThreshold) {
    return {
      hasCollapsed: false,
      lines: rawLines
    };
  }

  // Extract unique external and local package names
  const externalPkgs = new Set<string>();
  const localModules = new Set<string>();

  imports.forEach((imp) => {
    if (!imp.source) return;
    if (imp.isExternal) {
      // For scoped packages like @angular/core, grab full package name
      const parts = imp.source.split('/');
      const pkg = imp.source.startsWith('@') ? `${parts[0]}/${parts[1] || ''}` : parts[0];
      externalPkgs.add(pkg);
    } else {
      const parts = imp.source.split('/');
      const mod = parts.slice(0, 2).join('/');
      localModules.add(mod);
    }
  });

  const startLine = imports[0].lineNum;
  const endLine = imports[imports.length - 1].lineNum;

  const extList = Array.from(externalPkgs).slice(0, 4).join(', ');
  const locList = Array.from(localModules).slice(0, 3).join(', ');

  const summaryParts: string[] = [];
  if (extList) summaryParts.push(`Dependencias: ${extList}${externalPkgs.size > 4 ? '...' : ''}`);
  if (locList) summaryParts.push(`Locales: ${locList}${localModules.size > 3 ? '...' : ''}`);

  const details = summaryParts.length > 0 ? ` (${summaryParts.join(' | ')})` : '';

  const collapsedBanner = [
    `[L${startLine}-L${endLine}] 📦 ${imports.length} imports colapsados${details}`,
    `👉 Tip: Si necesitas ver todas las dependencias, corre Read(offset=${startLine}, limit=${endLine - startLine + 1})`
  ].join('\n');

  return {
    hasCollapsed: true,
    lines: [collapsedBanner]
  };
}
