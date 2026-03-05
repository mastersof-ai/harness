import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

export interface HarnessConfig {
  model: string;
  defaultAgent: string;
  tools: {
    memory: { enabled: boolean };
    workspace: { enabled: boolean };
    web: { enabled: boolean; extraction_model?: string };
    shell: { enabled: boolean };
    tasks: { enabled: boolean };
    introspection: { enabled: boolean };
    models: { enabled: boolean };
  };
  hooks: {
    logToolUse: boolean;
  };
  effort: "low" | "medium" | "high" | "max";
}

const DEFAULTS: HarnessConfig = {
  model: "claude-opus-4-6",
  defaultAgent: "cofounder",
  tools: {
    memory: { enabled: true },
    workspace: { enabled: true },
    web: { enabled: true },
    shell: { enabled: true },
    tasks: { enabled: true },
    introspection: { enabled: true },
    models: { enabled: true },
  },
  hooks: {
    logToolUse: false,
  },
  effort: "high",
};

export function getHomeDir(): string {
  return join(homedir(), ".mastersof-ai");
}

export function getConfigPath(): string {
  return join(getHomeDir(), "config.yaml");
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] ?? {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function loadConfig(): HarnessConfig {
  const configPath = getConfigPath();
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    return deepMerge(DEFAULTS, parsed);
  } catch {
    return DEFAULTS;
  }
}

export const DEFAULT_CONFIG_YAML = `# Masters of AI Harness — Configuration
# See: https://mastersof.ai/docs/config

# Default model for all agents
model: claude-opus-4-6

# Agent to start when no --agent flag is given
defaultAgent: cofounder

# Effort level: low | medium | high | max
# Controls how much thinking/reasoning effort the model applies
effort: high

# Tool domains — disable any you don't need
tools:
  memory:
    enabled: true
  workspace:
    enabled: true
  web:
    enabled: true
    # extraction_model: claude-haiku-4-5  # Enables smart extraction for web_fetch
  shell:
    enabled: true
  tasks:
    enabled: true
  introspection:
    enabled: true
  models:
    enabled: true

# Hooks — lifecycle callbacks for the agent SDK
hooks:
  # Log every tool call to stderr log (tool name, inputs, timing)
  logToolUse: false
`;
