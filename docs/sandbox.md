# Sandbox

The `--sandbox` flag runs the harness inside a [bubblewrap](https://github.com/containers/bubblewrap) (`bwrap`) container, isolating the agent's filesystem access.

## How It Works

When `--sandbox` is passed and `HARNESS_SANDBOXED` is not set, the harness:

1. Resolves the agent and loads `sandbox.json` from the agent's directory (auto-creates a default if missing)
2. Re-executes itself under `bwrap` with the `--sandbox` flag stripped and `HARNESS_SANDBOXED=1` set
3. Inside the sandbox: system dirs are read-only, agent memory and session state are read-write, the project directory (from `sandbox.json`) is read-write

## Per-Agent Config

Each agent can have a `sandbox.json` in its directory:

```json
{
  "project": "/home/user/my-project",
  "env": ["HOME", "PATH", "TERM"],
  "network": "host",
  "mounts": [
    { "path": "~/data", "mode": "ro" }
  ]
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `project` | `process.cwd()` | Working directory, mounted read-write |
| `env` | `["HOME", "PATH", "TERM"]` | Environment variables to pass through |
| `network` | `"host"` | `"host"` or `"none"` (disables networking) |
| `mounts` | `[]` | Additional bind mounts with `"ro"` or `"rw"` mode |
| `enabled` | `true` | Set to `false` to skip sandboxing even with `--sandbox` |

## Namespace Isolation

The sandbox unshares PID and IPC namespaces. Network is shared by default but can be disabled per-agent. The child process dies with the parent (`--die-with-parent`).
