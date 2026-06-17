"use client";

import { PostGameScreen } from "./PostGameScreen";
import type { TemplateOverlayProps } from "./types";

/** @deprecated Use PostGameScreen — kept for OverlayRegistry compatibility. */
export function LeadCaptureForm(props: TemplateOverlayProps) {
  return <PostGameScreen {...props} />;
}
