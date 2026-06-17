import tailwindcss from "@tailwindcss/vite";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const gameEngineRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(gameEngineRoot, "../..");

function resolveViteCacheDir(): string | undefined {
  if (process.env.MASHEDGAMES_DEV_CACHE_LOCAL === "0") {
    return undefined;
  }
  if (
    process.env.MASHEDGAMES_DEV_CACHE_LOCAL === "1" ||
    (process.platform === "win32" &&
      path.parse(path.resolve(monorepoRoot)).root.toLowerCase() !== "c:\\")
  ) {
    const base = process.env.LOCALAPPDATA ?? os.tmpdir();
    return path.join(base, "MashedGamesStudio", "dev-cache", "game-engine-vite");
  }
  return undefined;
}

function phaserSourceMapStubPlugin(): Plugin {
  return {
    name: "phaser-source-map-stub",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url.endsWith("/phaser.js.map") || url.endsWith("phaser.js.map")) {
          res.setHeader("Content-Type", "application/json");
          res.end("{}");
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  cacheDir: command === "serve" ? resolveViteCacheDir() : undefined,
  plugins: [tailwindcss(), phaserSourceMapStubPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [gameEngineRoot, monorepoRoot],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
}));
