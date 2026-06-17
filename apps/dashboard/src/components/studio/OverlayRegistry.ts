import type { ComponentType } from "react";
import { HighscoreTable } from "./overlays/HighscoreTable";
import { LeadCaptureForm } from "./overlays/LeadCaptureForm";
import { PostGameScreen } from "./overlays/PostGameScreen";
import { StartScreen } from "./overlays/StartScreen";
import type { TemplateOverlayProps } from "./overlays/types";

export const OVERLAY_REGISTRY = {
  HighscoreTable,
  StartScreen,
  LeadCaptureForm,
  PostGameScreen,
} as const satisfies Record<string, ComponentType<TemplateOverlayProps>>;

export type OverlayComponentKey = keyof typeof OVERLAY_REGISTRY;

export function isOverlayComponentKey(key: string): key is OverlayComponentKey {
  return key in OVERLAY_REGISTRY;
}

export function resolveOverlayComponent(
  key: string,
): ComponentType<TemplateOverlayProps> | null {
  if (!isOverlayComponentKey(key)) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[OverlayRegistry] Unknown overlay key: ${key}`);
    }
    return null;
  }
  return OVERLAY_REGISTRY[key];
}
