import { spawnSync } from "node:child_process";

const dashboardUrl = process.env.MASHEDGAMES_DASHBOARD_URL ?? "http://127.0.0.1:3000";
const dashboardOrigin = dashboardUrl.replace(/\/+$/, "");

const env = {
  ...process.env,
  NODE_ENV: "development",
  MASHEDGAMES_ELECTRON_DEV: "1",
  MASHEDGAMES_DASHBOARD_URL: dashboardOrigin,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll the dashboard until it returns a successful HTTP response.
 * Uses static engine HTML first (lighter than the app root) then `/`.
 */
async function waitForDashboardReady({
  timeoutMs = 180_000,
  intervalMs = 1_000,
  requestTimeoutMs = 8_000,
} = {}) {
  const targets = [
    `${dashboardOrigin}/engine/index.html`,
    `${dashboardOrigin}/`,
  ];
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;

    for (const target of targets) {
      try {
        const response = await fetch(target, {
          signal: AbortSignal.timeout(requestTimeoutMs),
          redirect: "follow",
        });

        if (response.ok || response.status === 304) {
          console.log(`[dev-phase3] Dashboard ready (${target}, ${response.status})`);
          return;
        }
      } catch {
        // Server still starting or first compile in progress — retry.
      }
    }

    if (attempt === 1 || attempt % 10 === 0) {
      console.log(
        `[dev-phase3] Waiting for dashboard at ${dashboardOrigin} (attempt ${attempt})…`,
      );
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for dashboard at ${dashboardOrigin}. ` +
      "If port 3000 is stuck, stop stale Node processes and run pnpm dev again.",
  );
}

function run(command, args, runEnv) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env: runEnv,
  });
  if (typeof result.status === "number") {
    return result.status;
  }
  if (result.error) {
    console.error(result.error.message);
  }
  return 1;
}

try {
  await waitForDashboardReady();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const desktopExitCode = run(process.execPath, ["scripts/dev-desktop.mjs"], env);
process.exit(desktopExitCode);
