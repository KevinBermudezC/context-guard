# 🛡️ ContextGuard

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node: >=18](https://img.shields.io/badge/Node->=18.0.0-green.svg)](https://nodejs.org/)
[![pnpm: >=10](https://img.shields.io/badge/pnpm->=10.0.0-F69220.svg?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0%20(Go%20Native)-blue.svg)](https://www.typescriptlang.org/)
[![Go Engine](https://img.shields.io/badge/Compiler-Go%20Native%20(Corsa)-00ADD8.svg)](https://golang.org/)

> **Intelligent context admission control & token optimization for Claude Code, Cursor, and Agentic AI workflows.**

Stop burning expensive tokens and degrading reasoning accuracy. `ContextGuard` intercepts un-scoped, large file reads before they enter your frontier reasoning models (Claude Opus 5, Claude Sonnet 5, GPT-6 Astra), extracting structural signatures or delegating summarization to ultra-fast worker models (Gemini 3.8 Flash, local SLMs).

---

## ⚡ High-Performance Go Native Compiler (TypeScript 7.0)

ContextGuard is built on **TypeScript 7.0**, utilizing the native **Go-based compiler engine** (*Corsa*):
* **10x Faster Compilation:** Type-checking and build steps run directly on native machine code compiled in Go, taking full advantage of Apple Silicon / ARM64 and multi-threaded Goroutines.
* **Sub-Millisecond Cold Starts:** Pure ESM standard library design with zero production runtime dependencies ensures the Claude Code `PreToolUse` hook executes in under **15ms**.

---

## 💡 The Problem

Frontier models are incredible at reasoning, but reading massive files (1,000+ lines of monorepo code, generated types, or verbose logs) introduces two major problems:

1. **FinOps Bleed:** Frontier models cost between \$3.00 and \$15.00+ per million input tokens. Dumping a few 2,000-line files into a session quickly adds up to dozens of dollars per day per developer.
2. **Context Rot & "Lost in the Middle":** Saturating attention heads with hundreds of lines of boilerplate degrades precision, increases hallucination rates, and derails agentic reasoning loops.

---

## 🏗️ How ContextGuard Works

ContextGuard acts as an **admission turnstile** using Claude Code's native `PreToolUse` hook lifecycle:

```
                      CLAUDE CODE TOOL INVOCATION
                                    │
                                    ▼
                 Does the file exceed the limit (e.g. 300 lines)
                     AND is it an un-scoped full read?
                                    │
                       ┌────────────┴────────────┐
                      YES                        NO
                       │                         │
                       ▼                         ▼
         ┌───────────────────────────┐      [ALLOW: Exit 0]
         │    CONTEXTGUARD TRIGGER   │   File is small or
         └─────────────┬─────────────┘   targeted slice requested
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
    [Tier 0: Local AST]       [Tier 1: Worker Model]
    TypeScript, Python, Go,   Logs, JSON, Markdown or
    Rust, Java, C#            semantic question queries
    • Cost: $0.00             • Gemini Flash / Ollama
    • Latency: < 5ms          • Cost: ~95% cheaper
          │                         │
          └────────────┬────────────┘
                       │
                       ▼
          [HARD BLOCK: Exit 2]
     Emits signature skeleton with [L120] line tags to stderr
                       │
                       ▼
     Claude receives system feedback & requests
     the exact slice needed (e.g. offset=130, limit=40)
```

---

## 🚀 Quick Start for Claude Code

### 1. Installation

Clone or install in your workspace:

```bash
pnpm add -D context-guard
# Or global install:
pnpm add -g context-guard
```

### 2. Configure Claude Code Hook

Add ContextGuard to your `.claude/settings.json` (at project root or `~/.claude/settings.json` globally):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "View|Bash",
        "type": "command",
        "command": "node ./node_modules/context-guard/dist/bin/claude-hook.js"
      }
    ]
  }
}
```

That's it! When Claude Code attempts to run `View` or bash commands like `cat massive-file.ts`, ContextGuard will intercept it, extract the structural map, and instruct Claude to seek only the exact line range it needs.

---

## 🛠️ CLI Usage

You can also use ContextGuard directly as a command-line tool:

```bash
# View file through ContextGuard (auto-shunts if > 300 lines)
npx context-guard src/large-service.ts

# Ask a semantic question to the worker model
npx context-guard logs/server.log --query "Find all 500 status database connection timeouts"

# Specific line range (bypasses guard / passthrough)
npx context-guard src/large-service.ts --start 120 --end 160

# Output structured JSON
npx context-guard src/large-service.ts --json
```

---

## ⚙️ Configuration

Customize thresholds and worker models via environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `CONTEXT_GUARD_MAX_LINES` | `300` | Maximum lines allowed for un-scoped direct reads |
| `CONTEXT_GUARD_MAX_BYTES` | `25600` | Maximum file size in bytes (~25 KB) |
| `CONTEXT_GUARD_PROVIDER` | `skeleton` | Worker mode: `skeleton` (Tier 0 AST), `gemini`, `ollama`, or `openai` |
| `GEMINI_API_KEY` | - | API key for Gemini 2.5 Flash worker |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model name |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama local endpoint |
| `OLLAMA_MODEL` | `qwen2.5-coder:7b` | Model to use in Ollama |

---

## 🧪 Development & Testing
 
```bash
# Install dependencies with strict symlink resolution
pnpm install

# Compile TypeScript using Go-powered tsc engine
pnpm run build

# Run unit and end-to-end tests
pnpm test
```

---

## 📄 License

MIT © [Kevin Bermudez](https://github.com/kevinbermudezc)
