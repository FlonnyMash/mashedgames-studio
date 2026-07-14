# Template Sandbox — AI Isolation Rules

You are an AI assistant operating inside the **Mashed Games Studio** template sandbox.
Your jurisdiction is **strictly limited** to the template you are currently working on.

---

## Sandbox Boundary

You MAY only create or modify files inside:

```
packages/templates/src/catch-game/
```

Where `catch-game` is the specific template directory you have been assigned (e.g. `catch-game`, `quiz-game`).

You MUST NOT create files at any other path. If you need a shared utility, raise it for the Lead Architect to add to `@mashedgames/shared`.

---

## Read-Only Zones — NEVER MODIFY

The following are external API dependencies. Treat every file in them as read-only:

| Path | Why it is read-only |
|---|---|
| `apps/game-engine/**` | Phaser runtime — versioned and built separately |
| `packages/shared/**` | Contract layer — owned by the Lead Architect |
| `apps/dashboard/**` | Next.js UI — separate release cycle |
| `apps/desktop/**` | Electron main process — security boundary |
| `packages/configurator-engine/**` | Studio UI package — separate release cycle |
| `packages/studio-engine/**` | Studio UI package — separate release cycle |
| `packages/state/**` | State factory — separate release cycle |

If any task requires changing those files, **stop and raise it**. Do not silently edit them.

---

## Import Rules

- Import ONLY via workspace package names: `@mashedgames/shared`, `@mashedgames/game-engine`.
- NEVER use relative `../` paths that escape `packages/templates/src/catch-game/`.
- NEVER import from `apps/dashboard/src/`, `apps/game-engine/src/`, or any `packages/*/src/` directly.

---

## Template Manifest Contract

Every template directory MUST have a `manifest.ts` that exports a `satisfies TemplateSchema` object.

The manifest MUST explicitly declare all four required fields — no silent omissions:

```typescript
import { type TemplateSchema, type TemplateFieldDescriptor } from '@mashedgames/shared';

const myGameFields: TemplateFieldDescriptor[] = [
  // { key, type, label, group?, min?, max?, step?, default, textureKey? }
];

export const myGameManifest = {
  templateId:       'catch-game',    // must match directory name
  version:          '1.0.0',
  displayName:      '<Human readable>',
  lockedFields:     [...],              // GameConfig keys configurator cannot change
  supportsUI:       [...],              // UIModule values from @mashedgames/shared
  supportedEvents:  [...],             // GameLifecycleEventType values from @mashedgames/shared
  assetRestrictions: [...],            // at least one entry if sprites are replaceable
  fields:           myGameFields,      // TemplateFieldDescriptor[] — the ONLY source of
                                        // per-template config keys, defaults, and UI metadata
} satisfies TemplateSchema;
```

---

## Phaser / UI Separation Law

**Phaser NEVER renders UI.** This is an absolute rule.

Phaser `MainScene` is permitted to:
- Run gameplay logic (collision, scoring, timers)
- Emit Phaser scene events: `this.events.emit('score-update', { score })`

Phaser `MainScene` is PROHIBITED from:
- Rendering score text, titles, forms, or buttons via Phaser Text/DOM objects
- Calling `document.querySelector` or manipulating `#ui-layer` directly
- Importing React or any dashboard component

All user-facing UI (scores, start screens, lead capture, highscore boards) lives in `#ui-layer` HTML overlays driven by `GAME_LIFECYCLE_EVENT` messages.

---

## Config Schema Law

- `GameConfig` is flat: top-level primitive keys only, plus one generic bucket — `fields: Record<string, string | number | boolean>`.
- Do NOT add nested objects, arrays, or `.passthrough()` to `GameConfig`.
- NEVER add a new hardcoded top-level key to `GameConfig` for template-specific tuning or assets.
  Declare it as a `TemplateFieldDescriptor` in your manifest's `fields` array instead — this is the
  single source of truth for the field's Zod validation, default value, and dynamic Configurator/Studio UI.
- At runtime your scene reads these values from `config.fields.<key>`, never from a top-level `config.<key>`.
- `type: "image"` fields MUST declare a `textureKey` matching an entry in `assetRestrictions`.
- If you need a new universal (template-agnostic) `GameConfig` field — e.g. something every template's
  DOM overlay would use — raise it for the Lead Architect instead of adding it yourself.

---

## Lifecycle Events

Templates declare which events they emit in `supportedEvents`. The overlay shell in
`apps/game-engine/src/overlays/overlay-shell.ts` bridges Phaser events to `GAME_LIFECYCLE_EVENT`
bridge messages. You do not write that bridge code — only declare the contract in your manifest.

Available event types (from `@mashedgames/shared`):

```
ON_GAME_START | ON_GAME_READY | ON_SCORE_UPDATE | ON_GAME_OVER
ON_LEVEL_COMPLETE | ON_LIFE_LOST | ON_COMBO_UPDATE | ON_TIMER_UPDATE
```

---

## Checklist Before Every Response

1. Are all file writes inside `packages/templates/src/catch-game/`? If not, STOP.
2. Does the manifest `satisfies TemplateSchema` with all four required fields?
3. Does Phaser render any UI text or DOM elements? If yes, STOP and refactor.
4. Are there any `../` relative imports escaping the template directory? If yes, STOP.
5. Is `GameConfig` still flat after your changes? If not, STOP.
6. Did you add a new hardcoded key to `GameConfig` instead of a `TemplateFieldDescriptor` in `fields`? If yes, STOP and refactor.
