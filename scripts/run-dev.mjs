import { spawn, spawnSync } from "node:child_process";

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env,
  });

  if (typeof result.status === "number") {
    return result.status;
  }

  if (result.error) {
    console.error(result.error.message);
  }
  return 1;
}

const baseEnv = {
  ...process.env,
  NODE_ENV: "development",
  NPM_CONFIG_PRODUCTION: "false",
  MASHEDGAMES_ELECTRON_DEV: "1",
  NEXT_PUBLIC_MASHED_DEV_STORE_PREVIEW: "1",
};

// pnpm deploy --prod (release builds) can leave electron's postinstall in a
// broken state — the zip downloads but extract-zip silently fails on Node 24.
const electronBootstrapExitCode = run("node", ["scripts/ensure-electron-binary.mjs"], baseEnv);
if (electronBootstrapExitCode !== 0) {
  process.exit(electronBootstrapExitCode);
}

// Phase 1 bootstrap: compile/check local workspace packages before app startup.
const packageBootstrapExitCode = run("pnpm", ["run", "build:packages"], baseEnv);
if (packageBootstrapExitCode !== 0) {
  process.exit(packageBootstrapExitCode);
}

function spawnPhase(scriptName) {
  return spawn("pnpm", ["--config.verifyDepsBeforeRun=false", "run", scriptName], {
    stdio: "inherit",
    shell: true,
    env: baseEnv,
  });
}

// Phase 1 watchers stay active while Phase 2 apps run.
const phase1 = spawnPhase("dev:phase1");
const phase2 = spawnPhase("dev:phase2");
// Phase 3 waits on dashboard readiness before launching desktop.
const phase3 = spawnPhase("dev:phase3");

const children = [phase1, phase2, phase3];
let hasExited = false;

function shutdown(code = 0) {
  if (hasExited) {
    return;
  }
  hasExited = true;
  for (const child of children) {
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });
  child.on("error", (error) => {
    console.error("[dev-orchestrator] child process error:", error);
    shutdown(1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
