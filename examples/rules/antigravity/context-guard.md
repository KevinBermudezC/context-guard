# 🛡️ ContextGuard Project Rule for Google Antigravity (AGY)

You MUST follow these context admission control and token optimization rules:

## 1. Context Admission Control
- **Do NOT read large files (>300 lines) into context unrestricted.** Dumping large files floods the context window and accelerates model degradation.
- When `read_file_safe` is available via MCP:
  - Use `inspect_outline(file_path)` to get a structural map of the file with line numbers `[L#]`.
  - Use `read_file_safe(file_path)` which automatically returns an AST skeleton for files >300 lines.
  - When inspecting implementations, read targeted line ranges:
    `read_file_safe(file_path, start_line=..., end_line=...)` or `view_file(AbsolutePath=..., StartLine=..., EndLine=...)`.

## 2. Lockfiles and Binaries
- **Never open lockfiles** (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`) or compiled/minified bundles (`.min.js`, `.wasm`, `.pyc`).
- Use command-line tools (`pnpm why <pkg>`, `npm ls <pkg>`, or read `package.json` directly) to check package dependencies.
