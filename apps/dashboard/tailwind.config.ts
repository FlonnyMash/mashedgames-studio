import type { Config } from "tailwindcss";

/**
 * Tailwind v4 loads plugins via `@plugin` in `src/app/globals.css`.
 * This file documents the typography plugin for tooling and legacy references.
 */
const config: Config = {
  plugins: [require("@tailwindcss/typography")],
};

export default config;
