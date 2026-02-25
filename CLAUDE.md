# Masters Of AI Harness

## Related Docs

- **DESIGN.md** — overview with links to docs/
- **docs/** — architecture, agents, tools, configuration, sandbox, design decisions

## Quick Orientation

Standalone agent runtime built on top of the Claude Agent SDK. 

Reads agent definition files (IDENTITY.md) directly. Connects to a model, provides MCP tools, handles I/O via React/Ink TUI.

- TypeScript, runs via tsx (no build step)
- Entry: `bin/mastersof-ai.js` → `src/index.tsx`
- Agent loading: `src/agent-context.ts` → `src/agent.ts`
- Tools: `src/tools/` — in-process MCP servers, one per domain
- TUI: `src/components/` — React/Ink (DO NOT TOUCH unless broken)
- Config: `~/.mastersof-ai/config.yaml`

## Running Locally

```bash
npx tsx bin/mastersof-ai.js:
npx tsx bin/mastersof-ai.js --agent researcher
npx tsx bin/mastersof-ai.js --agent researcher --sandbox # Run in a bubblewrap sandbox
npx tsx bin/mastersof-ai.js --list-agents
```
