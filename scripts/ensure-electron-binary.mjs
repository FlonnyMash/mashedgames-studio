import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootRequire = createRequire(import.meta.url);

function extractZip(zipPath, destDir) {
  if (process.platform === "win32") {
    fs.mkdirSync(destDir, { recursive: true });
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" },
    );
    return;
  }

  const electronRequire = createRequire(
    path.join(
      rootRequire.resolve("electron/package.json", {
        paths: [path.join(repoRoot, "apps", "desktop")],
      }),
      "..",
    ),
  );
  const extract = electronRequire("extract-zip");
  return extract(zipPath, { dir: path.resolve(destDir) });
}

async function main() {
  let electronDir;
  try {
    const electronPkg = rootRequire.resolve("electron/package.json", {
      paths: [path.join(repoRoot, "apps", "desktop")],
    });
    electronDir = path.dirname(electronPkg);
  } catch {
    console.error("[ensure-electron-binary] electron package not found — run pnpm install first.");
    process.exit(1);
  }

  const electronRequire = createRequire(path.join(electronDir, "package.json"));
  const { downloadArtifact } = electronRequire("@electron/get");

  const { version } = electronRequire("./package.json");
  const distDir = path.resolve(path.join(electronDir, "dist"));
  const platformPath = process.platform === "win32" ? "electron.exe" : "electron";
  const executablePath = path.join(distDir, platformPath);

  if (fs.existsSync(executablePath)) {
    console.log(`[ensure-electron-binary] OK — ${executablePath}`);
    return;
  }

  console.log(
    `[ensure-electron-binary] downloading Electron ${version} for ${process.platform}/${process.arch}...`,
  );

  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    platform: process.platform,
    arch: process.arch,
    force: true,
  });

  console.log(`[ensure-electron-binary] extracting ${zipPath}...`);
  await extractZip(zipPath, distDir);

  if (!fs.existsSync(executablePath)) {
    console.error("[ensure-electron-binary] extract finished but executable is missing:", executablePath);
    process.exit(1);
  }

  await fs.promises.writeFile(path.join(electronDir, "path.txt"), platformPath);

  const versionFile = path.join(distDir, "version");
  if (!fs.existsSync(versionFile)) {
    await fs.promises.writeFile(versionFile, `v${version}`);
  }

  console.log(`[ensure-electron-binary] installed — ${executablePath}`);
}

main().catch((error) => {
  console.error("[ensure-electron-binary] failed:", error);
  process.exit(1);
});
