import { execSync, spawnSync } from "node:child_process";

const dashboardUrl =
  process.env.MASHEDGAMES_DASHBOARD_URL ?? "http://127.0.0.1:3000";
const parsed = new URL(dashboardUrl);
const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
const probeOrigin = `${parsed.protocol}//127.0.0.1:${port}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findListeningPids(targetPort) {
  if (process.platform === "win32") {
    try {
      const output = execSync("netstat -ano -p tcp", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const pids = new Set();
      for (const line of output.split(/\r?\n/)) {
        if (!line.includes(`:${targetPort}`)) {
          continue;
        }
        const listenMatch = line.match(/LISTENING|ABH[ÖO]REN/i);
        if (!listenMatch) {
          continue;
        }
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts.at(-1));
        if (Number.isFinite(pid) && pid > 0) {
          pids.add(pid);
        }
      }
      return [...pids];
    } catch {
      return [];
    }
  }

  try {
    const output = execSync(`lsof -nP -iTCP:${targetPort} -sTCP:LISTEN -t`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split(/\r?\n/)
      .map((value) => Number(value.trim()))
      .filter((pid) => Number.isFinite(pid) && pid > 0);
  } catch {
    return [];
  }
}

function killPid(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/F"], {
      stdio: "ignore",
      shell: false,
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

async function probeDashboard(timeoutMs = 4_000) {
  try {
    const response = await fetch(`${probeOrigin}/engine/index.html`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    return response.ok || response.status === 304;
  } catch {
    return false;
  }
}

export async function ensureDevPortReady() {
  const pids = findListeningPids(port);
  if (pids.length === 0) {
    return;
  }

  if (await probeDashboard()) {
    console.log(
      `[ensure-dev-port] Port ${port} is already serving dashboard — leaving it running.`,
    );
    return;
  }

  for (const pid of pids) {
    console.warn(
      `[ensure-dev-port] Port ${port} is stuck (PID ${pid}) — terminating stale process.`,
    );
    killPid(pid);
  }

  await sleep(1_000);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  await ensureDevPortReady();
}
