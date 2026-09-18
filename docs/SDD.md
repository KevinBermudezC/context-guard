# SDD: Software Design Document - ContextGuard

**Document ID:** SDD-CG-001  
**Author:** Kevin Bermudez  
**Status:** Approved / In Production  
**Target Version:** v1.0.0  
**Last Updated:** September 2026  

---

## 1. Executive Summary & Problem Statement

### 1.1 Context & Motivation
With the advent of advanced frontier reasoning models (**Claude Opus 5**, **Claude Sonnet 5**, and **GPT-6 Astra**), agentic developer workflows have shifted heavily toward **System-2 Reasoning** (test-time compute). 

When these models are fed large files (monorepo services, generated types, long logs) in raw text:
1. **Compounded Token Cost:** Frontier models incur premium pricing on input tokens and expand their reasoning traces (*thinking tokens*), resulting in bills up to 3x–5x higher than necessary for simple read operations.
2. **Context Degradation (*Lost in the Middle*):** Attention heads become saturated with boilerplate and irrelevant code, directly degrading needle-in-a-haystack recall and increasing logical errors in downstream tasks.

### 1.2 Objective
`ContextGuard` is an automated **admission turnstile and context-optimization middleware** designed specifically for **Claude Code** and agentic coding workflows. It intercepts un-scoped file reads, enforces deterministic thresholds, and delegates structural extraction or summarization to zero-cost AST parsers or sub-100ms worker models (**Gemini 3.8 Flash**).

---

## 2. System Architecture & Component Design

```text
                           [ Claude Code Engine ]
                                     │
                        (PreToolUse: Read / View / Bash)
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │ ContextGuard Hook Interface │
                      │   (bin/claude-hook.ts)      │
                      └──────────────┬──────────────┘
                                     │
                      Is read scoped (offset/limit)?
                      OR is file <= MAX_LINES?
                                     │
                       ┌─────────────┴─────────────┐
                      YES                          NO
                       │                           │
                       ▼                           ▼
                [ PASS-THROUGH ]         [ CONTEXTGUARD SHUNT ]
                 Exit Code: 0                      │
                                     ┌─────────────┴─────────────┐
                                     ▼                           ▼
                             [ Tier 0: AST ]            [ Tier 1: Worker ]
                             Regex/AST Parser           Gemini 3.8 Flash
                             Cost: $0.00 / <5ms         Cost: ~$0.0001 / <100ms
                                     │                           │
                                     └─────────────┬─────────────┘
                                                   │
                                                   ▼
                                         [ HARD BLOCK: Exit 2 ]
                                         Emits structured skeleton
                                         to stderr as feedback
```

### 2.1 Core Components

1. **PreToolUse Hook (`bin/claude-hook.ts`):**
   * Listens via standard input (`stdin`) for tool invocation payloads from Claude Code.
   * Decodes native `Read`, legacy `View`, `readFile`, and open `Bash` commands (`cat`, `less`, `more`).
   * Evaluates line count and file byte size against configured thresholds.
   * Emits exit codes:
     * **Exit Code `0` (Allow):** Used when the call is scoped (`offset`/`limit`) or file size is under the threshold.
     * **Exit Code `2` (Block):** Prevents tool execution in Claude Code and routes the generated structural summary to `stderr` as contextual feedback.

2. **Structural Skeletonizer (`src/skeletonizer.ts` - Tier 0):**
   * Deterministic syntax extractor for TypeScript, JavaScript, Python, Go, Rust, Java, and C#.
   * Extracts classes, interfaces, function signatures, types, and top-level imports.
   * Prepends line numbers (e.g., `[L142]`) to each signature to enable precise follow-up seeks.
   * Operates with **\$0 token cost** and **< 5ms** CPU latency.

3. **Worker Model Delegation (`src/worker-model.ts` - Tier 1):**
   * Fallback for unstructured files (logs, markdown, JSON) or semantic queries.
   * Routes tasks to high-throughput, low-cost models (**Gemini 3.8 Flash** or local **Ollama** `qwen2.5-coder:7b`).

4. **CLI Client (`bin/context-guard.ts`):**
   * Standalone binary for developers and external agent frameworks (`context-guard <path> [options]`).

---

## 3. Decision Matrix & Protocol

| Trigger Event | Condition | Action | Exit Code | Feedback Target |
| :--- | :--- | :--- | :--- | :--- |
| `Read` / `View` | `offset` or `limit` present | Pass-through full slice | `0` | Claude Code executes tool |
| `Read` / `View` | Lines $\le 300$ & Bytes $\le 25\text{ KB}$ | Pass-through raw file | `0` | Claude Code executes tool |
| `Read` / `View` | Lines $> 300$ (Un-scoped) | Shunt to Tier 0 AST / Worker | `2` | `stderr` -> Claude Prompt |
| `Bash` | Contains `\|` or `>` | Pass-through command | `0` | Claude Code executes tool |
| `Bash` | Raw `cat <file>` ($> 300$ lines) | Intercept & Shunt | `2` | `stderr` -> Claude Prompt |

---

## 4. Technology Stack & Operational Decisions

1. **Language & Compiler: TypeScript 7.0 (Go-based Corsa Engine):**
   * Native Mach-O arm64 compilation via Go compiler binary.
   * 10x faster type checks and builds compared to legacy Node-based compilers.
2. **Package & Dependency Management: `pnpm` (v11.2+):**
   * Enforces strict, non-flat symlink topology in `node_modules`.
   * Eliminates phantom dependencies and supply-chain vulnerabilities.
3. **Zero Production Runtime Dependencies:**
   * Utilizes Node.js standard libraries (`node:fs`, `node:path`, `node:child_process`) and native `fetch()`.
   * Guarantees hook cold-start latency of **$\le 15\text{ ms}$**.

---

## 5. Security, Governance & Compliance

* **Data Residency:** Tier 0 (AST) processes 100% of code locally without network I/O.
* **Network Isolation:** Tier 1 (Worker) defaults to local endpoints (Ollama) or private enterprise cloud endpoints (GCP Vertex AI / AWS Bedrock).
* **Process Isolation:** The hook operates as an external child process; failure of the script defaults safely to `exit 0` (fail-open) to prevent blocking developer workflows.

---

## 6. Versioning & Release Roadmap

Adheres strictly to **Semantic Versioning 2.0.0**:

* **v1.0.0 (Current Release):** Initial production-ready release with Claude Code hook integration, TypeScript 7.0 Go-native engine, pnpm architecture, Tier 0 multi-language AST, and full E2E test suite.
* **v1.1.0 (Planned):** Configurable AST plug-ins via tree-sitter, token metering dashboard, and telemetry integration.
