"use client";

import { cn } from "@/lib/utils";
import {
  isRichHtmlContent,
  renderRichContentToHtml,
} from "@/lib/rich-html-content";
import { MarkdownContent, PROSE_DARK, PROSE_LIGHT } from "./MarkdownContent";

export function RichHtmlContent({
  source,
  variant = "light",
  className,
  emptyFallback = null,
}: {
  source: string;
  variant?: "light" | "dark";
  className?: string;
  emptyFallback?: React.ReactNode;
}) {
  const trimmed = source.trim();
  if (!trimmed) {
    return emptyFallback;
  }

  if (!isRichHtmlContent(trimmed)) {
    return (
      <MarkdownContent
        source={trimmed}
        variant={variant}
        className={className}
        emptyFallback={emptyFallback}
      />
    );
  }

  const html = renderRichContentToHtml(trimmed);

  return (
    <div
      className={cn(
        "rich-html-content",
        variant === "dark" ? PROSE_DARK : PROSE_LIGHT,
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
