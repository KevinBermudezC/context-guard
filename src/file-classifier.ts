import path from 'node:path';
import fs from 'node:fs';

export type FileCategory = 'binary' | 'lockfile' | 'minified' | 'source_code';

export interface FileClassification {
  category: FileCategory;
  reason?: string;
  recommendedAction?: string;
}

const BINARY_EXTENSIONS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.avif',
  // Documents & Media
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.mp3', '.mp4', '.mov', '.avi',
  // Fonts & Binaries
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.wasm', '.dylib', '.so', '.dll', '.exe', '.bin', '.obj', '.o',
  // Archives & Databases
  '.zip', '.tar', '.gz', '.7z', '.rar', '.bz2', '.sqlite', '.sqlite3', '.db'
]);

const LOCKFILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'cargo.lock',
  'composer.lock',
  'gemfile.lock',
  'poetry.lock',
  'bun.lockb',
  'bun.lock'
]);

/**
 * Inspects magic bytes (first 512 bytes) to detect binary contents
 */
export function isBinaryBuffer(buffer: Buffer): boolean {
  const checkLen = Math.min(buffer.length, 512);
  if (checkLen === 0) return false;

  let nonPrintableCount = 0;
  for (let i = 0; i < checkLen; i++) {
    const byte = buffer[i];
    // Check for null bytes (typical of binary data)
    if (byte === 0) {
      return true;
    }
    // Byte values below 32 (except common whitespace: \t, \n, \r) or above 126
    if ((byte < 7 || (byte > 13 && byte < 32)) && byte !== 27) {
      nonPrintableCount++;
    }
  }

  // If > 25% of bytes are non-printable control characters, consider it binary
  return nonPrintableCount / checkLen > 0.25;
}

/**
 * Classifies a file to determine if it should be shunted, blocked, or parsed
 */
export function classifyFile(filePath: string): FileClassification {
  const fileName = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  // 1. Check for Lockfiles
  if (LOCKFILES.has(fileName)) {
    return {
      category: 'lockfile',
      reason: `El archivo "${path.basename(filePath)}" es un lockfile de dependencias.`,
      recommendedAction: `No leas el lockfile crudo. Usa comandos de introspección como "pnpm why <paquete>" o "npm ls <paquete>".`
    };
  }

  // 2. Check for Minified / Sourcemaps
  if (fileName.endsWith('.min.js') || fileName.endsWith('.min.css') || fileName.endsWith('.bundle.js') || fileName.endsWith('.map')) {
    return {
      category: 'minified',
      reason: `El archivo "${path.basename(filePath)}" está minificado o es un sourcemap.`,
      recommendedAction: `Inspecciona los archivos originales de código fuente en "src/" en lugar del bundle empaquetado.`
    };
  }

  // 3. Check for Binary Extensions
  if (BINARY_EXTENSIONS.has(ext)) {
    const isDoc = ext === '.pdf' || ext.startsWith('.doc') || ext.startsWith('.xls');
    return {
      category: 'binary',
      reason: `El archivo "${path.basename(filePath)}" es un recurso binario (${ext}).`,
      recommendedAction: isDoc 
        ? `Usa herramientas como "pdftotext" o lectores de documentos para extraer texto plano.`
        : `Los archivos multimedia y binarios no deben volcarse como texto. Usa herramientas de visión multimodal o comandos de sistema.`
    };
  }

  // 4. Inspect buffer if file exists
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
    fs.closeSync(fd);

    if (isBinaryBuffer(buffer.subarray(0, bytesRead))) {
      return {
        category: 'binary',
        reason: `El archivo "${path.basename(filePath)}" contiene bytes binarios o caracteres nulos.`,
        recommendedAction: `No intentes leer archivos binarios como texto plano.`
      };
    }
  } catch {
    // If unable to open or read header, proceed with fallback
  }

  return {
    category: 'source_code'
  };
}
