import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentContext } from "./agent-context.js";

interface SandboxMount {
  path: string;
  mode: "ro" | "rw";
}

interface SandboxConfig {
  enabled?: boolean;
  project?: string;
  mounts?: SandboxMount[];
  env?: string[];
  network?: "host" | "none";
}

const ROOT_DIR = join(import.meta.dirname, "..");
const HOME = process.env.HOME ?? "/root";

function expandHome(p: string): string {
  return p.startsWith("~/") ? join(HOME, p.slice(2)) : p;
}

export function loadSandboxConfig(ctx: AgentContext, opts?: { autoCreate?: boolean }): SandboxConfig | null {
  const configPath = join(ctx.agentDir, "sandbox.json");
  if (!existsSync(configPath)) {
    if (!opts?.autoCreate) return null;
    const defaultConfig: SandboxConfig = {
      project: process.cwd(),
      env: ["HOME", "PATH", "TERM"],
      network: "host",
    };
    mkdirSync(ctx.agentDir, { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`);
    console.error(`Created default sandbox config at ${configPath}`);
    return defaultConfig;
  }
  const raw = JSON.parse(readFileSync(configPath, "utf-8")) as SandboxConfig;
  if (raw.enabled === false) return null;
  return raw;
}

function roBind(src: string): string[] {
  return existsSync(src) ? ["--ro-bind", src, src] : [];
}

function rwBind(src: string): string[] {
  return existsSync(src) ? ["--bind", src, src] : [];
}

function buildBwrapArgs(ctx: AgentContext, config: SandboxConfig): string[] {
  const home = HOME;
  const args: string[] = [];

  // --- System (read-only) ---
  for (const dir of ["/usr", "/lib", "/lib64", "/bin", "/sbin"]) {
    args.push(...roBind(dir));
  }
  for (const f of ["/etc/resolv.conf", "/etc/ssl", "/etc/ca-certificates", "/etc/passwd", "/etc/group"]) {
    args.push(...roBind(f));
  }

  // --- Runtime tools (mise installs + shims) ---
  args.push(...roBind(join(home, ".local/share/mise/installs")));
  args.push(...roBind(join(home, ".local/share/mise/shims")));

  // git global config for user.name/email
  args.push(...roBind(join(home, ".gitconfig")));

  // --- Harness source (read-only) ---
  for (const rel of ["src", "dist", "bin", "defaults", "package.json", "tsconfig.json", "node_modules"]) {
    args.push(...roBind(join(ROOT_DIR, rel)));
  }

  // --- ~/.mastersof-ai (mixed) ---
  // Config (read-only)
  const harnessHome = join(home, ".mastersof-ai");
  args.push(...roBind(join(harnessHome, "config.yaml")));

  // Agent identity (read-only — the whole agent dir except memory is immutable)
  args.push(...roBind(ctx.identityPath));

  // Agent memory (read-write)
  args.push(...rwBind(ctx.memoryDir));

  // Session state (read-write)
  args.push(...rwBind(ctx.stateDir));

  // SDK auth + sessions (read-write)
  args.push(...rwBind(join(home, ".claude")));

  // Target project (read-write)
  if (config.project) {
    args.push(...rwBind(expandHome(config.project)));
  }

  // Additional mounts
  if (config.mounts) {
    for (const mount of config.mounts) {
      const mountPath = expandHome(mount.path);
      if (mount.mode === "rw") {
        args.push(...rwBind(mountPath));
      } else {
        args.push(...roBind(mountPath));
      }
    }
  }

  // --- Specials ---
  args.push("--proc", "/proc");
  args.push("--dev", "/dev");
  if (existsSync("/dev/tty")) {
    args.push("--dev-bind", "/dev/tty", "/dev/tty");
  }
  args.push("--tmpfs", "/tmp");

  // --- Namespaces ---
  args.push("--unshare-pid", "--unshare-ipc");
  if (config.network === "none") {
    args.push("--unshare-net");
  }

  // --- Lifecycle ---
  args.push("--die-with-parent");

  // --- Working directory ---
  args.push("--chdir", config.project ? expandHome(config.project) : ROOT_DIR);

  // --- Environment ---
  args.push("--clearenv");
  args.push("--setenv", "HARNESS_SANDBOXED", "1");

  const envWhitelist = config.env ?? ["HOME", "PATH", "TERM"];
  for (const key of envWhitelist) {
    const val = process.env[key];
    if (val !== undefined) {
      args.push("--setenv", key, val);
    }
  }

  return args;
}

export function execInSandbox(ctx: AgentContext, config: SandboxConfig, argv: string[]): never {
  // Ensure rw directories exist before bwrap tries to bind-mount them
  for (const dir of [ctx.memoryDir, ctx.stateDir, ctx.sessionsDir, ctx.proposalsDir]) {
    mkdirSync(dir, { recursive: true });
  }

  const bwrapArgs = buildBwrapArgs(ctx, config);

  // Resolve tsx loader paths relative to our own node_modules (not the caller's).
  // process.execArgv may point to a different project's tsx installation.
  const tsxDir = join(ROOT_DIR, "node_modules/tsx/dist");
  const execArgv = ["--require", join(tsxDir, "preflight.cjs"), "--import", `file://${join(tsxDir, "loader.mjs")}`];
  const nodeCmd = [process.execPath, ...execArgv, ...argv.slice(1)];
  const fullArgs = [...bwrapArgs, "--", ...nodeCmd];

  try {
    execFileSync("bwrap", fullArgs, { stdio: "inherit" });
    process.exit(0);
  } catch (err: any) {
    process.exit(err.status ?? 1);
  }
}
