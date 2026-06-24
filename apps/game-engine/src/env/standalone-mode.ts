/**
 * Returns true when the engine is running outside the dashboard iframe:
 *  - Top-level browsing context (Cloudflare Pages demo, direct file open)
 *  - Build-time demo template pinning (VITE_DEMO_TEMPLATE set)
 *
 * This is the single source of truth used by both the layout class application
 * in main.ts and the standalone overlay mount in overlay-shell.ts.
 */
export function isStandaloneMode(): boolean {
  return window.parent === window || !!import.meta.env.VITE_DEMO_TEMPLATE;
}
