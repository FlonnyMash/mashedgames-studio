"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

export const PROSE_LIGHT =
  "prose prose-zinc prose-lg max-w-none prose-p:leading-[1.75] prose-p:text-zinc-600 prose-headings:tracking-tight prose-headings:text-zinc-900 prose-li:leading-relaxed prose-a:text-zinc-900 prose-a:underline-offset-4";

export const PROSE_DARK =
  "prose prose-invert max-w-none text-zinc-300 prose-p:leading-[1.75] prose-p:text-zinc-300 prose-headings:tracking-tight prose-headings:text-zinc-100 prose-li:leading-relaxed prose-li:text-zinc-300 prose-a:text-zinc-200 prose-a:underline-offset-4 prose-strong:text-zinc-100";

export function MarkdownContent({
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

  return (
    <div
      className={cn(
        variant === "dark" ? PROSE_DARK : PROSE_LIGHT,
        className,
      )}
    >
      <ReactMarkdown>{trimmed}</ReactMarkdown>
    </div>
  );
}
