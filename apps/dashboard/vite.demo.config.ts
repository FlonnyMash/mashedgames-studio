import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dashboardRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(dashboardRoot, "../..");

const outDir = process.env.DEMO_BUNDLE_OUT_DIR
  ? path.resolve(process.env.DEMO_BUNDLE_OUT_DIR)
  : path.join(dashboardRoot, ".demo-shell-dist");

export default defineConfig({
  root: path.join(dashboardRoot, "demo-player"),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.join(dashboardRoot, "src"),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.NEXT_PUBLIC_GAME_ENGINE_URL": JSON.stringify(""),
    "process.env.NEXT_PUBLIC_WORKSPACE_DESKTOP": JSON.stringify(""),
    "process.env.NEXT_PUBLIC_APP_MODE": JSON.stringify("studio"),
    // Leads worker base URL — inlined so the published demo bundle can POST
    // captured leads without a live Next.js runtime.
    "process.env.NEXT_PUBLIC_WORKER_URL": JSON.stringify(
      process.env.NEXT_PUBLIC_WORKER_URL ?? "",
    ),
  },
  server: {
    fs: {
      allow: [dashboardRoot, monorepoRoot],
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(dashboardRoot, "demo-player", "index.html"),
    },
  },
});
