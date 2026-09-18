# 🗺️ ContextGuard Product & Technical Roadmap

This document outlines the strategic roadmap for **ContextGuard**, evolving from a Claude Code admission turnstile into a **Universal Context Optimization & FinOps Layer** for any AI coding agent (**Claude Code, Cursor, Antigravity, Kiro, Windsurf, Zed**).

---

## 🧭 Architecture Vision

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CONTEXTGUARD ENGINE (CORE)                            │
│           (TypeScript 7.0 Go Compiler | Tier 0 AST | Tier 1 Worker)          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
   [PHASE 1: DONE]               [PHASE 2: MCP]                [PHASE 3: ADAPTERS]
  Claude Code Hook          Universal MCP Server           Native Agent Integrations
  • PreToolUse Hook         • Open MCP Standard            • Antigravity (.agents/hooks)
  • Exit Code 2 Block       • Cursor                       • Cursor (.cursor/rules)
  • NPM & GitHub Packages   • Windsurf                     • Kiro / Cline / Roo Code
                            • Claude Desktop / Zed         • VS Code Agentic Tools
                                       │
         ┌─────────────────────────────┴─────────────────────────────┐
         ▼                                                           ▼
   [PHASE 4: ADVANCED AST]                                     [PHASE 5: FINOPS]
  Deep Distillation Engines                                   Observability & Telemetry
  • Tree-sitter (40+ languages)                               • Local & Cloud Dashboard
  • Local semantic cache (SQLite)                             • Dollars saved per dev tracking
```

---

## 📍 Phased Milestones

### Phase 1: Core Engine & Claude Code Foundation (✅ Completed - v1.0.0)
- [x] **TypeScript 7.0 Go Compiler:** Native Mach-O arm64 compilation via Go (Corsa engine).
- [x] **Claude Code Turnstile:** Native `PreToolUse` hook with `Exit Code 2` (Hard Block) and structured `stderr` feedback.
- [x] **Tier 0 Deterministic AST:** Regex and signature extractor for TypeScript, JavaScript, Python, Go, Rust, Java, and C#.
- [x] **Tier 1 Worker Delegation:** Connectors for Gemini 3.8 Flash, local Ollama, and OpenAI-compatible endpoints.
- [x] **Strict Dependency Management:** Migrated to `pnpm` with immutable lockfile and zero production runtime dependencies.
- [x] **Formal Software Design Document:** [SDD-CG-001](docs/SDD.md) detailing architecture, FinOps math, and threat model.
- [x] **Distribution:** Published on [npm](https://www.npmjs.com/package/@kevinbermudezc/context-guard) and [GitHub Packages](https://github.com/KevinBermudezC/context-guard/packages).

---

### Phase 2: Universal Model Context Protocol (MCP) Server (Target: v1.1.0)
The **Model Context Protocol (MCP)** provides a universal bridge to connect ContextGuard with multiple coding agents simultaneously.

- [ ] **Dedicated MCP Package:** Publish `@kevinbermudezc/context-guard-mcp`.
- [ ] **Standardized Tools:**
  - `read_file_safe`: Automated shunting for files exceeding safety thresholds.
  - `inspect_outline`: Instant structural signatures and interface outlines (< 5ms).
  - `grep_distilled`: Pattern search that strips internal implementations and isolates matches.
- [ ] **Immediate Agent Compatibility:** Unlocks out-of-the-box support for:
  - **Cursor**
  - **Windsurf (Cascade)**
  - **Zed**
  - **Claude Desktop**

---

### Phase 3: Native Agent Adapters (Target: v1.2.0)
Provide first-class configuration templates and hooks tailored to each major agent's native lifecycle.

- [ ] **Google Antigravity:**
  - Lifecycle hook configuration via `.agents/hooks.json` intercepting `view_file` and `run_command`.
  - Native Antigravity project rules (`GEMINI.md` and `.agents/rules/context-guard.md`).
  - Antigravity Custom Skill bundle (`.agents/skills/context-guard/SKILL.md`).
- [ ] **Cursor:**
  - Cursor Rules (`.cursor/rules/*.mdc`) instructing Composer to favor `read_file_safe`.
- [ ] **Kiro / Cline / Roo Code:**
  - Direct tool override configs to replace raw file viewers.

---

### Phase 4: Tree-sitter & Semantic Disk Cache (Target: v1.3.0)
- [ ] **Tree-sitter WASM / Native Core:**
  - Transition Tier 0 from regex-based parsing to full AST parsing via Tree-sitter.
  - Broaden support to 40+ programming languages (Kotlin, Swift, Elixir, Scala, C++, etc.).
- [ ] **Zero-Duplicate Semantic Cache:**
  - Local embedded SQLite / RocksDB store for caching structural skeletons based on file content hash (`sha256`).
  - Cache hits reduce shunting latency to **< 1ms**.

---

### Phase 5: Enterprise FinOps Dashboard & Observability (Target: v2.0.0)
- [ ] **CLI Analytics (`context-guard stats`):**
  - Real-time aggregation of tokens prevented, input savings, and cost reduction.
- [ ] **Metrics Export:**
  - OpenTelemetry, Prometheus, and Datadog exporters for enterprise engineering organizations measuring AI tool ROI.
- [ ] **Cost Simulator:**
  - Benchmarking tool calculating dollar savings on Claude Opus 5, Claude Sonnet 5, and GPT-6 Astra.
