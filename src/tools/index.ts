import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { AgentContext } from "../agent-context.js";
import type { HarnessConfig } from "../config.js";
import { createIntrospectionTools } from "./introspection.js";
import { createMemoryTools } from "./memory.js";
import { modelQueryTools } from "./model-query.js";
import { createShellTools } from "./shell.js";
import { createTaskTools } from "./tasks.js";
import { createWebTools } from "./web.js";
import { createWorkspaceTools } from "./workspace.js";

const createServer = (name: string, tools: Parameters<typeof createSdkMcpServer>[0]["tools"]) =>
  createSdkMcpServer({ name, tools });

export function createAgentServers(ctx: AgentContext, config: HarnessConfig) {
  const prefix = `${ctx.name}-`;
  const cwd = process.cwd();
  const servers: Record<string, ReturnType<typeof createSdkMcpServer>> = {};

  if (config.tools.memory.enabled) {
    servers[`${prefix}memory`] = createServer(`${prefix}memory`, createMemoryTools(ctx.memoryDir));
  }
  if (config.tools.web.enabled) {
    servers[`${prefix}web`] = createServer(`${prefix}web`, createWebTools(config.tools.web));
  }
  if (config.tools.introspection.enabled) {
    servers[`${prefix}introspection`] = createServer(
      `${prefix}introspection`,
      createIntrospectionTools({ identityPath: ctx.identityPath, proposalsDir: ctx.proposalsDir }),
    );
  }
  if (config.tools.workspace.enabled) {
    servers[`${prefix}workspace`] = createServer(`${prefix}workspace`, createWorkspaceTools(cwd));
  }
  if (config.tools.shell.enabled) {
    servers[`${prefix}shell`] = createServer(`${prefix}shell`, createShellTools(cwd));
  }
  if (config.tools.models.enabled) {
    servers[`${prefix}models`] = createServer(`${prefix}models`, modelQueryTools);
  }
  if (config.tools.tasks.enabled) {
    servers[`${prefix}tasks`] = createServer(`${prefix}tasks`, createTaskTools(ctx.memoryDir));
  }

  return servers;
}
