# SPEC-002: Advanced File Patterns, Binary Protection & Smart Import Distillation

**Specification ID:** SPEC-002  
**Status:** Proposed / Draft  
**Target Release:** v1.1.0  
**Author:** Kevin Bermudez  
**Date:** September 2026  

---

## 1. Context & Motivation

In production monorepos, agents frequently encounter files that degrade context efficiency if treated as plain UTF-8 text:
1. **The "Import Wall":** Real-world enterprise files (React components, NestJS controllers, Spring/Python modules) frequently start with 50–100 lines of `import` declarations. If an AST skeleton outputs every single import, the skeleton itself consumes dozens of lines before revealing any functional signature.
2. **Binary and Media Files:** Dumping binary formats (PDFs, images, Wasm, SQLite, zip archives) into text-based LLM prompts produces garbage tokens (mojibake) that exhaust context windows and cause hallucination.
3. **Massive Generated Assets & Lockfiles:** Files like `pnpm-lock.yaml` (often 10,000+ lines) or minified bundles (`*.min.js`) should never be read raw; agents should use CLI tools (e.g. `pnpm why`) instead.

---

## 2. Technical Requirements

### 2.1 Smart Import Distillation & Collapsing
* **Threshold:** If total contiguous import lines $\le 5$, keep them in the skeleton.
* **Collapsing Rule:** If total import lines $> 5$:
  * Detect the line range: e.g., `[L1-L54]`.
  * Extract unique package/module names (distinguishing between third-party packages and relative imports).
  * Emit a single summarized header line:
    ```text
    [L1-L54] 📦 54 imports collapsed (Packages: @nestjs/common, rxjs, lodash | Local: ./service, ./dto)
    👉 Tip: If you need to inspect all imports, run Read(offset=1, limit=54)
    ```
  * Immediately proceed to declarations (classes, interfaces, functions).

### 2.2 Binary & Multimedia Guard
* **Extension Matching:**
  * Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.ico`, `.bmp`
  * Documents: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`
  * Binaries & Archives: `.wasm`, `.zip`, `.tar`, `.gz`, `.7z`, `.sqlite`, `.db`, `.dylib`, `.so`, `.bin`, `.woff`, `.woff2`, `.ttf`
* **Magic Byte Fallback:** For files without extensions, inspect the first 512 bytes. If null bytes (`\0`) are present, classify as binary.
* **Enforcement:** Return `Exit Code 2` (Hard Block) with specific instructions for tools (e.g. `pdftotext`, `file`, or multimodal vision).

### 2.3 Lockfile & Minified Code Turnstile
* Detect `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `Cargo.lock`.
* Return `Exit Code 2` instructing Claude to use package manager introspection commands (`pnpm why <pkg>`, `npm ls <pkg>`).
* Detect `*.min.js`, `*.min.css`, `*.bundle.js`, `*.map`. Block and recommend inspecting source files in `src/`.

### 2.4 Frontend Frameworks & Single File Components (Svelte, Angular, Vue, Astro)
* **Svelte (`.svelte`) & Vue (`.vue`):**
  * **`<style>` Tag Collapsing:** Automatically collapse `<style>` or `<style scoped>` blocks into a single summary line:
    ```text
    [L210-L380] 🎨 170 lines of scoped CSS collapsed. Run Read(offset=210, limit=170) if styles are needed.
    ```
  * **`<script>` Block Extraction:** Prioritize extraction of component logic, props, runes, and lifecycle methods:
    * Svelte: Legacy props (`export let`), Svelte 5 Runes (`$props()`, `$state()`, `$derived()`), and reactive declarations (`$: ...`).
    * Vue: `<script setup>` macros (`defineProps()`, `defineEmits()`, `defineModel()`), and reactive primitives (`ref()`, `computed()`).
* **Angular (`.component.ts`, `.service.ts`):**
  * Detect decorators: `@Component(...)`, `@Injectable(...)`, `@Directive(...)`, `@Pipe(...)`.
  * Extract input/output bindings and modern Angular Signals: `@Input()`, `@Output()`, `input()`, `output()`, `model()`.
  * Extract lifecycle hooks (`ngOnInit`, `ngOnChanges`, `ngOnDestroy`).
* **Astro (`.astro`):**
  * Extract server-side frontmatter block (`--- ... ---`) containing component props, imports, and data fetching.

---

## 3. Component Architecture & Data Flow

```text
                     INCOMING READ REQUEST
                               │
                               ▼
               [ File Classifier & Guard ]
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
     [ Binary / Media ]   [ Lockfiles/Min ]   [ Source Code ]
     • Exit Code: 2       • Exit Code: 2      • Size check
     • Suggests OCR/CLI   • Suggests pnpm why       │
                                                    ▼
                                            [ Skeletonizer ]
                                                    │
                                           Are imports > 5?
                                                    │
                                        ┌───────────┴───────────┐
                                       YES                      NO
                                        │                       │
                                        ▼                       ▼
                                [ Collapse Imports ]   [ Plain Imports ]
                                Emit 1-line summary    Emit normal lines
                                        │                       │
                                        └───────────┬───────────┘
                                                    │
                                                    ▼
                                          [ Emit Class/Signatures ]
```

---

## 4. Implementation Plan

1. **`src/file-classifier.ts`:**
   * Extension lookup map.
   * Magic bytes buffer scanner.
2. **`src/import-collapser.ts`:**
   * Parser for JS/TS (`import ... from '...'`), Python (`import ...`, `from ... import ...`), and Go (`import (...)`).
   * Generates condensed package summary.
3. **Integration into `bin/claude-hook.ts`:**
   * Plug in classifier before size check.
   * Plug in import collapser inside Tier 0 AST extraction.
4. **Test Matrix:**
   * Mock binary files (verify `Exit Code 2`).
   * Mock TypeScript file with 80 imports (verify single collapsed summary line and line numbers).
