import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { render } from "ink";
import { buildOptions, buildSystemPrompt, sendMessage } from "./agent.js";
import { DEFAULT_AGENT, getAgentsDir, resolveAgent } from "./agent-context.js";
import { App } from "./components/App.js";
import { loadConfig } from "./config.js";
import { createAgent } from "./create-agent.js";
import { isFirstRun, runFirstRun } from "./first-run.js";
import { setInkClear } from "./lib/ink-clear.js";
import { findSessionByName, listSessions, loadSession, relativeTime } from "./sessions.js";

// --- Arg parsing ---

const args = process.argv.slice(2);

function getFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function getFlagValue(name: string): string | null {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  const val = args[idx + 1];
  if (val.startsWith("--")) return null;
  return val;
}

// --- Subcommand: create ---

if (args[0] === "create") {
  const name = args[1];
  if (!name) {
    console.error("Usage: mastersof-ai create <name>");
    process.exit(1);
  }
  if (isFirstRun()) runFirstRun();
  createAgent(name);
  process.exit(0);
}

// --- Flag: --init ---

if (getFlag("init")) {
  runFirstRun();
  process.exit(0);
}

// --- First run check ---

if (isFirstRun()) {
  runFirstRun();
}

// --- Load config ---

const config = loadConfig();

// --- Flag: --list-agents ---

if (getFlag("list-agents")) {
  const agentsDir = getAgentsDir();
  try {
    const entries = readdirSync(agentsDir, { withFileTypes: true });
    const agents = entries
      .filter((e) => e.isDirectory() && existsSync(join(agentsDir, e.name, "IDENTITY.md")))
      .map((e) => e.name);
    if (agents.length === 0) {
      console.log("No agents found. Create one with: mastersof-ai create <name>");
    } else {
      console.log("Available agents:\n");
      for (const name of agents) {
        const marker = name === config.defaultAgent ? " (default)" : "";
        console.log(`  ${name}${marker}`);
      }
    }
  } catch {
    console.log("No agents found. Run: mastersof-ai --init");
  }
  process.exit(0);
}

// --- Resolve agent ---

const agentName = getFlagValue("agent") ?? config.defaultAgent ?? DEFAULT_AGENT;
const agentContext = resolveAgent(agentName);

// Sandbox gate: re-exec under bwrap if --sandbox and not already sandboxed
if (getFlag("sandbox") && !process.env.HARNESS_SANDBOXED) {
  const { loadSandboxConfig, execInSandbox } = await import("./sandbox.js");
  const sandboxConfig = loadSandboxConfig(agentContext, { autoCreate: true });
  if (!sandboxConfig) {
    console.error(`No sandbox config found at ~/.mastersof-ai/agents/${agentName}/sandbox.json`);
    process.exit(1);
  }
  const filteredArgv = process.argv.filter((a) => a !== "--sandbox");
  execInSandbox(agentContext, sandboxConfig, filteredArgv);
}

const sessionDirs = { sessionsDir: agentContext.sessionsDir, lastSessionFile: agentContext.lastSessionFile };

// --- Flag: --message (headless mode) ---

const messageIdx = args.indexOf("--message");

if (messageIdx !== -1) {
  const message = args.slice(messageIdx + 1).join(" ");
  if (!message) {
    console.error('Usage: mastersof-ai --message "your message"');
    process.exit(1);
  }

  const systemPrompt = await buildSystemPrompt(agentContext);
  const options = buildOptions(agentContext, { systemPrompt }, config);
  const stream = sendMessage(message, options);

  let responseBuffer = "";

  for await (const msg of stream) {
    if (msg.type === "stream_event") {
      const event = (msg as any).event;
      if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        process.stdout.write(event.delta.text);
        responseBuffer += event.delta.text;
      }
    }

    if (msg.type === "assistant" && !responseBuffer) {
      const text = (msg as any).message?.content
        ?.filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("");
      if (text) {
        process.stdout.write(text);
      }
    }
  }
  process.stdout.write("\n");
} else {
  // --- TUI mode ---

  const resumeIdx = args.indexOf("--resume");
  const isResume = resumeIdx !== -1;
  let initialSessionId: string | null = null;
  let initialSessionName: string | null = null;

  if (isResume) {
    const resumeArg = resumeIdx + 1 < args.length && !args[resumeIdx + 1].startsWith("--") ? args[resumeIdx + 1] : null;

    if (resumeArg) {
      const byId = await loadSession(sessionDirs, resumeArg);
      if (byId) {
        initialSessionId = byId.id;
        initialSessionName = byId.name;
      } else {
        const sessions = await listSessions(sessionDirs);
        const match = findSessionByName(resumeArg, sessions);
        if (match) {
          initialSessionId = match.id;
          initialSessionName = match.name;
        } else {
          console.error(`No session matching "${resumeArg}"`);
          process.exit(1);
        }
      }
    } else {
      const sessions = await listSessions(sessionDirs);
      const top10 = sessions.slice(0, 10);

      if (top10.length === 0) {
        console.error("No sessions found.");
        process.exit(1);
      }

      console.log("Pick a session to resume:\n");
      for (let i = 0; i < top10.length; i++) {
        const s = top10[i];
        console.log(`  ${i + 1}. ${s.name}  (${relativeTime(s.lastUsedAt)})`);
      }

      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const choice = await new Promise<string>((resolve) => {
        rl.question("\n  > ", (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      const num = parseInt(choice, 10);
      if (num < 1 || num > top10.length || Number.isNaN(num)) {
        console.error("Invalid selection.");
        process.exit(1);
      }

      const picked = top10[num - 1];
      initialSessionId = picked.id;
      initialSessionName = picked.name;
      console.log(`\nResuming: "${picked.name}"\n`);
    }
  }

  const instance = render(
    <App
      initialSessionId={initialSessionId}
      initialSessionName={initialSessionName}
      agentContext={agentContext}
      config={config}
    />,
    { exitOnCtrlC: false },
  );
  setInkClear(instance.clear);
}
