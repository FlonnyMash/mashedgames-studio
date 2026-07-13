# Template Blueprint — Instructions for Cursor Agents

This file is the authoritative instruction manual for any future Cursor session
building a new game template on top of this engine. `apps/game-engine` ships
as a **zero-state bootstrapper**: it initializes a Phaser 3 `Game` instance
and listens on the `mashedgames-studio://` bridge for hot-swapped
configuration. It contains no gameplay of its own. Read this file in full
before writing a single line of scene code.

Read `packages/templates/src/catch-game/` alongside this file — it is the
reference implementation of every rule below.

## Rule 1 — Where a new template lives

- Create `packages/templates/src/{templateId}/manifest.ts` and
  `packages/templates/src/{templateId}/{Name}Scene.ts`.
- Export the scene from `packages/templates/src/index.ts`.
- Register a lazy-loaded entry in
  `apps/game-engine/src/game/template-registry.ts` (`LAZY_SCENE_REGISTRY`) so
  Vite can code-split it. This is the one manual wiring step — everything
  else about the template is self-describing.
- `templateId` in `manifest.ts` must match both the registry key and the
  directory name.

## Rule 2 — Populating the empty scene

- Start from `apps/game-engine/src/game/scenes/MainScene.ts` as a reference
  for the minimum shape: a Phaser `Scene` with `create()`, `update()`, and an
  `applyConfig(config: GameConfig)` method wired to the bridge.
- All gameplay, physics, spawning, and scoring logic lives inside your scene
  class. Do not add gameplay to `MainScene.ts` itself — it is the generic
  fallback shown when no template matches.
- Your scene receives config updates through `applyConfig()`. Never read
  config once and cache it forever — the bridge can hot-swap config at any
  time without a reload (see Rule 7).

## Rule 3 — Flat config only (no exceptions)

- Never add a hardcoded, template-specific key to
  `packages/shared/src/flat-game-config.ts` (`GameConfigSchema`). That schema
  only holds universal/system fields (identity, branding, overlay copy) that
  apply to every template.
- Your template's own mechanics — tuning numbers, toggles, sprite slots —
  are declared as a `TemplateFieldDescriptor[]` in your `manifest.ts`
  (`fields` array), using `TemplateFieldDescriptorSchema` from
  `@mashedgames/shared`. Each descriptor is self-describing:
  `{ key, type, label, group?, min?, max?, step?, default, textureKey? }`.
- Runtime values for these fields live in the flat `GameConfig.fields` record
  (`Record<string, string | number | boolean>`) — read them in your scene as
  `config.fields.myKey`, never `config.myKey`.
- This is what makes the Configurator/Studio UI fully dynamic: it renders a
  control for every entry in your `fields` array automatically — no
  React/UI code to write per template.

## Rule 4 — Forbid Phaser-based UI (DOM over canvas)

- Phaser renders **gameplay only**. Start screens, CTAs, HUDs, lead-capture
  forms, and highscore boards must never be drawn inside a Phaser scene
  (no `Phaser.GameObjects.Text` buttons, no DOM-in-canvas hacks).
- All UI lives in the dashboard's `#ui-layer` HTML/Tailwind overlay, driven
  by `GAME_LIFECYCLE_EVENT` messages your scene emits (see
  `packages/shared/src/game-events.ts`). Declare which lifecycle events your
  template emits in `manifest.ts` (`supportedEvents`) and which overlay
  modules it activates (`supportsUI`).
- If you find yourself importing a font or drawing text for anything other
  than in-world game feedback (e.g. floating score popups), stop — that
  belongs in the overlay layer, not Phaser.

## Rule 5 — Assets: protocol-only, no exceptions

- Every uploadable sprite slot must be declared in `manifest.ts`
  (`assetRestrictions`) with a Phaser texture `key`, and its corresponding
  `fields` descriptor must be `type: "image"` with a matching `textureKey`.
- Resolve asset URLs only via `resolveStudioAssetUrl()` /
  `mashedgames-studio://` (see `packages/shared/src/asset-reference.ts`).
  `data:`/base64 URLs are prohibited — `NullableAssetStringSchema` rejects
  them at validation time.
- Your scene must work with **zero** uploaded assets — generate a procedural
  fallback texture (rectangle/circle/graphics) for every sprite slot so the
  template renders correctly before any client branding is applied. See
  `createTextures()` / `recreateProceduralTexture()` in `CatchGameScene.ts`.

## Rule 6 — The bridge contract

- `main.ts` already handles the full `UPDATE_CONFIG` handshake, hot-swap,
  and `SET_RUNTIME_ASSETS` / `LOAD_EXTERNAL_ASSET` / `ASSET_READY` asset
  flow. Do not duplicate this wiring in your scene — subscribe to the
  Phaser-side events your scene needs (`bridge:config-update`,
  `bridge:control`) as `CatchGameScene` does in `registerBridgeListeners()`.
- Never talk to `window.parent` directly from a scene. All cross-frame
  communication goes through `apps/game-engine/src/bridge/messenger.ts`.

## Rule 7 — Zero-reload hot-swap

- Every field in your `manifest.ts` `fields` array must be safe to change at
  runtime without recreating the scene. Recompute derived state (spawn
  rates, physics tuning, textures) inside `applyConfig()`, not only in
  `create()`.

## Rule 8 — Dev-only code

- Any debug logging, dev-only overlays, or verbose validation warnings must
  be gated behind `process.env.NODE_ENV !== "production"`. Never ship
  dev-only branches unconditionally.

## Checklist before calling a template done

- [ ] `manifest.ts` declares `fields`, `assetRestrictions`, `supportsUI`,
      `supportedEvents` — no `meta`/`configFieldHints` (removed; superseded
      by `fields`).
- [ ] Scene reads all template-specific values from `config.fields.*`.
- [ ] Scene works with zero uploaded assets (procedural fallback textures).
- [ ] No UI/HUD/forms rendered inside Phaser.
- [ ] Registered in `LAZY_SCENE_REGISTRY`.
- [ ] `pnpm --filter @mashedgames/shared build` and `pnpm --filter game-engine build` pass with no type errors.
