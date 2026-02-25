# Agents

## Agent Loading

The harness reads agent definitions from `~/.mastersof-ai/agents/`.

### Resolution

Each agent is a directory under `agents/` containing an `IDENTITY.md` file:

```
~/.mastersof-ai/agents/{name}/
├── IDENTITY.md          — Plain markdown, becomes the system prompt
└── memory/
    └── CONTEXT.md       — Persistent memory (optional)
```

`resolveAgent(name)` checks that `agents/{name}/` exists and contains `IDENTITY.md`. If either is missing, the harness exits with an error.

### System Prompt Assembly

```
[Agent identity — the IDENTITY.md content]
[Persistent memory from CONTEXT.md, if present]
[Current date, time, and timezone]
```

The identity file is loaded as-is (no frontmatter parsing). Memory is wrapped with a header explaining it's accumulated context from previous sessions. Date/time uses the system timezone.

## Sub-Agents

The harness supports sub-agent delegation — the primary agent can spawn specialized agents for tasks like research, deep thinking, or writing.

### Current Implementation

Sub-agents are defined in TypeScript (`src/agents/*.ts`). Each has a name, model, system prompt, and tool access. They are registered via `createAgentRegistry()` and passed to the Claude Agent SDK.

## Persistent Memory

Agents read and write to `~/.mastersof-ai/agents/{name}/memory/`. The primary file is `CONTEXT.md`, which accumulates context across sessions. Memory is exposed as a tool — agents decide when and what to remember.
