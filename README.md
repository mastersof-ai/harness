# @mastersof-ai/harness

Define agents in markdown. Control the entire system prompt. No hidden framework instructions coloring your agent's behavior.

Write an `IDENTITY.md`, run `mastersof-ai`, and your agent starts with exactly the context you gave it — nothing more. Persistent memory, built-in tools, sub-agents, sandboxing, and a terminal UI. Powered by your Claude Code subscription via the Claude Agent SDK.

## Install

```bash
npm install -g @mastersof-ai/harness
```

## Quick Start

```bash
mastersof-ai                          # first-run setup → starts default agent
mastersof-ai --agent analyst          # start a specific agent
mastersof-ai --message "hello"        # headless one-shot mode
mastersof-ai --resume                 # resume last session
mastersof-ai create my-agent          # scaffold a new agent
mastersof-ai --list-agents            # list available agents
```

On first run, `~/.mastersof-ai/` is created with three default agents:

- **cofounder** — co-founder template with self-improvement tools (default)
- **assistant** — general purpose
- **analyst** — research and analysis

## Creating Agents

```bash
mastersof-ai create my-agent
```

This creates `~/.mastersof-ai/agents/my-agent/` with a template `IDENTITY.md`. Edit the identity file to customize your agent's personality, instructions, and behavior.

## How It Works

- **Identity is markdown.** Each agent is defined by an `IDENTITY.md` file — no code required.
- **Persistent memory.** Agents read and write to `~/.mastersof-ai/agents/{name}/memory/`. Context survives across sessions.
- **Built-in tools.** Memory, workspace (file ops), web search/fetch, shell, task tracking, introspection, and model queries.
- **Sub-agents.** Researcher (Sonnet), deep-thinker (Opus), and writer (Opus) handle delegated work in separate contexts.
- **Session management.** Named sessions with resume, rename, and history.
- **Config-driven.** Optional `~/.mastersof-ai/config.yaml` for model selection and tool toggles.
- **Sandbox.** Optional `--sandbox` flag runs the agent inside a bubblewrap container for filesystem isolation.

## Configuration

Edit `~/.mastersof-ai/config.yaml`:

```yaml
model: claude-opus-4-6        # default model for all agents
defaultAgent: cofounder        # agent started with no --agent flag

tools:
  memory:
    enabled: true
  workspace:
    enabled: true
  web:
    enabled: true
  shell:
    enabled: true
  tasks:
    enabled: true
  introspection:
    enabled: true
  models:
    enabled: true
```

## TUI Commands

Inside the TUI:

- `/sessions` — list recent sessions
- `/resume [name|#N]` — resume a session
- `/name <text>` — rename current session
- `/new` — start a fresh session
- `/quit` — exit

**Keyboard shortcuts:**

- `Enter` — send message
- `Ctrl+J` — insert newline
- `Ctrl+G` — open external editor
- `Escape` — interrupt streaming / clear input
- `Ctrl+C` (double) — exit

## Auth

Uses your Claude Code subscription. No API key needed.

## Sandbox

Run any agent in a [bubblewrap](https://github.com/containers/bubblewrap) sandbox for filesystem isolation:

```bash
mastersof-ai --agent cofounder --sandbox
```

The sandbox mounts system directories read-only, gives the agent read-write access to its memory, session state, and a configured project directory, and isolates PID/IPC namespaces. On first use, a default `sandbox.json` is created in the agent's directory. Edit it to customize mounts, environment variables, and network access.

Requires `bwrap` to be installed (`apt install bubblewrap` or equivalent).

## Optional Dependencies

- `fd` — used by `find_files` tool (fast file search)
- `rg` (ripgrep) — used by `grep_files` tool (fast content search)

Both are optional. Tools return clear errors if the binaries are missing.

## Web Search

Set `BRAVE_API_KEY` environment variable to enable the `web_search` tool. `web_fetch` works without it.

## License

MIT
