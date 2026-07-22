import type { AppMode } from "./flat-game-config";
import type { GameConfig } from "./flat-game-config";
import { normalizeTemplateId } from "./template-id";
import { UI_MODULE, type UIModule } from "./template-schema";

export type FlatFieldType =
  | "color"
  | "image"
  | "slider"
  | "text"
  | "number"
  | "toggle"
  | "styled-text";

export type FlatFieldSurface = "studio" | "configurator" | "both";

/**
 * Declares which flat GameConfig keys control inline style properties for a
 * `"styled-text"` field. All bindings are optional; the toolbar renders only
 * the controls whose key is declared. The underlying data stays flat — no
 * nested objects, no HTML strings.
 */
export type StyleBindings = {
  /** Key of a hex-color string field (e.g. `"startScreenTitleColor"`). */
  colorKey?: keyof GameConfig & string;
  /** Key of a boolean field that drives `fontWeight: bold`. */
  boldKey?: keyof GameConfig & string;
  /** Key of a boolean field that drives `fontStyle: italic`. */
  italicKey?: keyof GameConfig & string;
  /** Key of a boolean field that drives `textDecoration: underline`. */
  underlineKey?: keyof GameConfig & string;
};

export type FlatFieldDefinition = {
  key: keyof GameConfig & string;
  type: FlatFieldType;
  surface: FlatFieldSurface;
  label: string;
  /** Group this field belongs to. Ungrouped fields are rendered outside any accordion. */
  group?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /**
   * Only valid when `type === "styled-text"`. Declares which additional flat
   * keys drive inline color/bold/italic styling on this text field. The bound
   * keys are NOT rendered as separate rows — the `StyledTextInput` toolbar
   * owns their controls.
   */
  styleBindings?: StyleBindings;
  /** When set, the field is shown only for these template ids. */
  templateIds?: string[];
  /** Shown in the panel when the config key is unset. */
  defaultValue?: number | string | boolean;
};

// ---------------------------------------------------------------------------
// Group definitions
//
// Declares logical sections for the sidebar panel. The masterVisibilityKey
// must be a boolean GameConfig key; when present it is rendered as a toggle
// in the group header rather than inside the body, and its value controls
// whether nested fields are interactive.
// ---------------------------------------------------------------------------

export type GroupDefinition = {
  /** Unique group identifier referenced by FlatFieldDefinition.group. */
  id: string;
  /** Human-readable heading shown in the accordion header. */
  label: string;
  /** Surface visibility — same semantics as FlatFieldDefinition.surface. */
  surface: FlatFieldSurface;
  /**
   * A boolean GameConfig key whose value acts as master visibility for this group.
   * When defined the toggle is rendered in the group header. Turning it off
   * visually disables all body fields and writes the false value to flat config.
   */
  masterVisibilityKey?: keyof GameConfig & string;
  /** When true the accordion is collapsed by default. */
  defaultCollapsed?: boolean;
  /** When set, the group is shown only for these template ids. */
  templateIds?: string[];
  /**
   * The overlay module this group's fields configure. When set, the group
   * (and its master toggle) is hidden unless the active template's manifest
   * declares this module in `supportsUI` — the manifest is the source of
   * truth, not the raw GameConfig boolean flags. Groups without a uiModule
   * (e.g. "branding") are never gated this way.
   */
  uiModule?: UIModule;
};

export const GROUP_REGISTRY: GroupDefinition[] = [
  {
    id: "resolution",
    label: "Preview Resolution",
    surface: "studio",
  },
  {
    id: "branding",
    label: "Branding",
    surface: "both",
  },
  {
    id: "startScreen",
    label: "Start Screen",
    surface: "both",
    masterVisibilityKey: "showStartScreen",
    uiModule: UI_MODULE.START_SCREEN,
  },
  {
    id: "highscore",
    label: "Highscore Board",
    surface: "both",
    masterVisibilityKey: "showHighscore",
    defaultCollapsed: true,
    uiModule: UI_MODULE.HIGHSCORE,
  },
  {
    id: "leadCapture",
    label: "Lead Capture",
    surface: "both",
    masterVisibilityKey: "showLeadCapture",
    defaultCollapsed: false,
    uiModule: UI_MODULE.LEAD_CAPTURE,
  },
  {
    id: "timer",
    label: "Countdown Timer",
    surface: "both",
    masterVisibilityKey: "showCountdownTimer",
    defaultCollapsed: false,
    uiModule: UI_MODULE.COUNTDOWN_TIMER,
  },
];

export const FLAT_FIELD_REGISTRY: FlatFieldDefinition[] = [
  // ── Preview Resolution ────────────────────────────────────────────────────
  {
    key: "previewWidth",
    type: "number",
    surface: "studio",
    label: "Width (px)",
    min: 240,
    max: 3840,
    step: 10,
    group: "resolution",
  },
  {
    key: "previewHeight",
    type: "number",
    surface: "studio",
    label: "Height (px)",
    min: 240,
    max: 3840,
    step: 10,
    group: "resolution",
  },
  // ── Branding ──────────────────────────────────────────────────────────────
  {
    key: "themeColor",
    type: "color",
    surface: "both",
    label: "Theme color",
    group: "branding",
  },
  {
    key: "backgroundColor",
    type: "color",
    surface: "studio",
    label: "Background color",
    group: "branding",
  },
  {
    key: "logoUrl",
    type: "image",
    surface: "both",
    label: "Logo",
    group: "branding",
  },
  // ── Start Screen ──────────────────────────────────────────────────────────
  // showStartScreen is the masterVisibilityKey — rendered in the group header,
  // not in this list.
  // Color/bold/italic keys are NOT separate rows — they live inside the
  // StyledTextInput toolbar via styleBindings.
  {
    key: "startScreenTitle",
    type: "styled-text",
    surface: "both",
    label: "Title",
    placeholder: "Ready to play?",
    group: "startScreen",
    styleBindings: {
      colorKey: "startScreenTitleColor",
      boldKey: "startScreenTitleBold",
      italicKey: "startScreenTitleItalic",
      underlineKey: "startScreenTitleUnderline",
    },
  },
  {
    key: "startScreenSubtitle",
    type: "styled-text",
    surface: "both",
    label: "Subtitle",
    placeholder: "Tap start when you are ready.",
    group: "startScreen",
    styleBindings: {
      colorKey: "startScreenSubtitleColor",
      boldKey: "startScreenSubtitleBold",
      italicKey: "startScreenSubtitleItalic",
      underlineKey: "startScreenSubtitleUnderline",
    },
  },
  {
    key: "ctaLabel",
    type: "styled-text",
    surface: "both",
    label: "CTA label",
    placeholder: "Start Game",
    group: "startScreen",
    styleBindings: {
      colorKey: "ctaTextColor",
      boldKey: "ctaLabelBold",
      italicKey: "ctaLabelItalic",
      underlineKey: "ctaLabelUnderline",
    },
  },
  {
    key: "gameDurationSeconds",
    type: "number",
    surface: "both",
    label: "Duration (seconds)",
    min: 10,
    max: 300,
    step: 5,
    group: "timer",
  },
  // ── Lead Capture ──────────────────────────────────────────────────────────
  {
    key: "leadCaptureTitle",
    type: "styled-text",
    surface: "both",
    label: "Title",
    placeholder: "Great run!",
    group: "leadCapture",
    styleBindings: {
      colorKey: "leadCaptureTitleColor",
      boldKey: "leadCaptureTitleBold",
      italicKey: "leadCaptureTitleItalic",
      underlineKey: "leadCaptureTitleUnderline",
    },
  },
  {
    key: "leadCaptureSubtitle",
    type: "styled-text",
    surface: "both",
    label: "Subtitle",
    placeholder: "Enter your details to save your score.",
    group: "leadCapture",
    styleBindings: {
      colorKey: "leadCaptureSubtitleColor",
      boldKey: "leadCaptureSubtitleBold",
      italicKey: "leadCaptureSubtitleItalic",
      underlineKey: "leadCaptureSubtitleUnderline",
    },
  },
  {
    key: "leadCaptureNamePlaceholder",
    type: "text",
    surface: "both",
    label: "Name placeholder",
    placeholder: "Your name",
    group: "leadCapture",
  },
  {
    key: "leadCaptureEmailPlaceholder",
    type: "text",
    surface: "both",
    label: "Email placeholder",
    placeholder: "Email address",
    group: "leadCapture",
  },
  {
    key: "leadCaptureSubmitLabel",
    type: "styled-text",
    surface: "both",
    label: "Submit label",
    placeholder: "Submit",
    group: "leadCapture",
    styleBindings: {
      colorKey: "leadCaptureSubmitColor",
      boldKey: "leadCaptureSubmitBold",
      italicKey: "leadCaptureSubmitItalic",
      underlineKey: "leadCaptureSubmitUnderline",
    },
  },
  {
    key: "leadCaptureRetryLabel",
    type: "styled-text",
    surface: "both",
    label: "Try again label",
    placeholder: "Try again",
    group: "leadCapture",
    styleBindings: {
      colorKey: "leadCaptureRetryColor",
      boldKey: "leadCaptureRetryBold",
      italicKey: "leadCaptureRetryItalic",
      underlineKey: "leadCaptureRetryUnderline",
    },
  },
  // ── Highscore Board ───────────────────────────────────────────────────────
  {
    key: "highscoreTitle",
    type: "styled-text",
    surface: "both",
    label: "Title",
    placeholder: "Leaderboard",
    group: "highscore",
    styleBindings: {
      colorKey: "highscoreTitleColor",
      boldKey: "highscoreTitleBold",
      italicKey: "highscoreTitleItalic",
      underlineKey: "highscoreTitleUnderline",
    },
  },
  {
    key: "highscoreSubtitle",
    type: "styled-text",
    surface: "both",
    label: "Subtitle",
    placeholder: "Top scores this week",
    group: "highscore",
    styleBindings: {
      colorKey: "highscoreSubtitleColor",
      boldKey: "highscoreSubtitleBold",
      italicKey: "highscoreSubtitleItalic",
      underlineKey: "highscoreSubtitleUnderline",
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesTemplate(
  templateIds: string[] | undefined,
  activeTemplateId?: string,
): boolean {
  if (!templateIds || templateIds.length === 0) {
    return true;
  }
  if (!activeTemplateId) {
    return true;
  }
  return templateIds.includes(normalizeTemplateId(activeTemplateId));
}

export function fieldsForMode(
  mode: AppMode,
  activeTemplateId?: string,
): FlatFieldDefinition[] {
  const allowed: FlatFieldSurface[] =
    mode === "studio" ? ["studio", "both"] : ["configurator", "both"];
  return FLAT_FIELD_REGISTRY.filter(
    (field) =>
      allowed.includes(field.surface) &&
      matchesTemplate(field.templateIds, activeTemplateId),
  );
}

/**
 * Whether a universal overlay group is allowed to render for the active
 * template. Groups with no `uiModule` (e.g. "branding") are always allowed.
 * `supportsUI === undefined` means "unknown/not loaded yet" and does not
 * filter anything, so the panel doesn't flash empty before the manifest's
 * `supportsUI` has been fetched.
 */
function matchesSupportedUI(
  group: GroupDefinition,
  supportsUI: UIModule[] | undefined,
): boolean {
  if (!group.uiModule || !supportsUI) {
    return true;
  }
  return (supportsUI as string[]).includes(group.uiModule);
}

export function groupsForMode(
  mode: AppMode,
  activeTemplateId?: string,
  supportsUI?: UIModule[],
): GroupDefinition[] {
  const allowed: FlatFieldSurface[] =
    mode === "studio" ? ["studio", "both"] : ["configurator", "both"];
  return GROUP_REGISTRY.filter((group) => {
    if (!allowed.includes(group.surface)) {
      return false;
    }
    if (!matchesTemplate(group.templateIds, activeTemplateId)) {
      return false;
    }
    if (!matchesSupportedUI(group, supportsUI)) {
      return false;
    }
    if (group.masterVisibilityKey) {
      return true;
    }
    return fieldsForGroup(group.id, mode, activeTemplateId).length > 0;
  });
}

/**
 * Returns the body fields for a given group in the correct surface context.
 * The masterVisibilityKey field is intentionally excluded — it lives in the
 * group header, not the body.
 */
export function fieldsForGroup(
  groupId: string,
  mode: AppMode,
  activeTemplateId?: string,
): FlatFieldDefinition[] {
  return fieldsForMode(mode, activeTemplateId).filter((f) => f.group === groupId);
}

/**
 * Returns fields that carry no group assignment for the given mode.
 * These are rendered above all accordion groups.
 */
export function ungroupedFields(
  mode: AppMode,
  activeTemplateId?: string,
): FlatFieldDefinition[] {
  return fieldsForMode(mode, activeTemplateId).filter((f) => !f.group);
}
