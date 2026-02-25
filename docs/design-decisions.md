# Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Standalone | Reads format directly | Independence, simpler install, no coupling |
| Tools discovered at runtime | Agent adapts to harness | Portable definitions, no dep declarations |
| In-process MCP servers | One server per tool domain | No external processes, fast, simple |
| Config-driven tool enable/disable | `config.yaml` controls what's available | User controls their environment |
| Legacy format fallback (planned) | IDENTITY.md will still work | Don't break existing agents |
| tsx as runtime | No build step for JSX | Simpler than bundling React/Ink |
| `~/.mastersof-ai/` home dir | Global config + agents + state | Standard Unix convention |
| Memory as a tool | Not baked into core | Just another context source |
| Sub-agents as .md files (planned) | Same format as primary agents | Uniform, composable, portable |
| Bubblewrap sandbox | Optional `--sandbox` flag | Isolate agent filesystem access without Docker overhead |
