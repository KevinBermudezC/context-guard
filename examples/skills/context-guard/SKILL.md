---
name: context-guard
description: >-
  Uses ContextGuard to inspect large files, outlines, and structural AST skeletons safely without blowing up the context window. Use whenever exploring unfamiliar files, large components (>300 lines), or auditing token consumption.
---

# 🛡️ ContextGuard Skill for Antigravity

ContextGuard provides intelligent context admission control, reducing token usage by up to 90% when reading large source files.

## When to Use
- Whenever you need to read or understand a source file larger than 300 lines.
- When locating functions, classes, interfaces, or types in a large codebase.
- When searching patterns across unfamiliar repositories.

## Workflow

### 1. Inspect File Structure First (<5ms, 0 tokens)
Instead of dumping full files into context, call `inspect_outline`:
```json
{
  "file_path": "path/to/large-service.ts"
}
```
This returns all class declarations, function signatures, and exported types with exact line numbers `[L120]`.

### 2. Read Safe Protected Content
When reading files through MCP, call `read_file_safe`:
```json
{
  "file_path": "path/to/large-service.ts"
}
```
- If the file is small (≤300 lines), full content is returned.
- If the file is large (>300 lines), an AST skeleton is returned with instructions.

### 3. Read Only Targeted Slices
Once you identify the line numbers from the outline, read only the relevant function:
```json
{
  "file_path": "path/to/large-service.ts",
  "start_line": 120,
  "end_line": 160
}
```

### 4. Search Symbols with Structural Distillation
Use `grep_distilled` instead of raw regex searches to see structural context around matches without dumping hundreds of lines of implementation.
