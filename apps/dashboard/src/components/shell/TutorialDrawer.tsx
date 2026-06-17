"use client";

import type { TemplateMeta } from "@/lib/template-meta-io";
import { BookOpen, Loader2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

// ---------------------------------------------------------------------------
// Minimal Markdown renderer
// Renders headings, bold, italic, inline-code, code blocks, ordered/unordered
// lists, and paragraph breaks without a heavy dependency.
// ---------------------------------------------------------------------------

function renderMarkdown(md: string): string {
  if (!md.trim()) return "";

  const lines = md.split("\n");
  const out: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inList = false;
  let listOrdered = false;

  const flushList = () => {
    if (!inList) return;
    out.push(listOrdered ? "</ol>" : "</ul>");
    inList = false;
  };

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const inlineFormat = (s: string): string => {
    let r = escape(s);
    // Bold
    r = r.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    r = r.replace(/__(.+?)__/g, "<strong>$1</strong>");
    // Italic
    r = r.replace(/\*(.+?)\*/g, "<em>$1</em>");
    r = r.replace(/_(.+?)_/g, "<em>$1</em>");
    // Inline code
    r = r.replace(/`(.+?)`/g, '<code class="rounded bg-zinc-100 px-1 font-mono text-xs text-zinc-700">$1</code>');
    return r;
  };

  for (const raw of lines) {
    const line = raw;

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        out.push(
          `<pre class="my-2 overflow-x-auto rounded-lg bg-zinc-900 px-4 py-3 font-mono text-xs leading-relaxed text-zinc-100">${escape(codeLines.join("\n"))}</pre>`,
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Blank line
    if (!line.trim()) {
      flushList();
      out.push('<div class="my-2" />');
      continue;
    }

    // Headings
    const h3 = /^###\s+(.+)/.exec(line);
    if (h3) {
      flushList();
      out.push(`<h3 class="mt-4 mb-1 text-sm font-semibold text-zinc-900">${inlineFormat(h3[1])}</h3>`);
      continue;
    }
    const h2 = /^##\s+(.+)/.exec(line);
    if (h2) {
      flushList();
      out.push(`<h2 class="mt-5 mb-1 text-base font-semibold text-zinc-900">${inlineFormat(h2[1])}</h2>`);
      continue;
    }
    const h1 = /^#\s+(.+)/.exec(line);
    if (h1) {
      flushList();
      out.push(`<h1 class="mt-6 mb-2 text-lg font-bold text-zinc-900">${inlineFormat(h1[1])}</h1>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushList();
      out.push('<hr class="my-4 border-zinc-200" />');
      continue;
    }

    // Unordered list
    const ul = /^[-*]\s+(.+)/.exec(line);
    if (ul) {
      if (!inList || listOrdered) {
        if (inList) flushList();
        out.push('<ul class="my-2 ml-4 list-disc space-y-1 text-sm text-zinc-700">');
        inList = true;
        listOrdered = false;
      }
      out.push(`<li>${inlineFormat(ul[1])}</li>`);
      continue;
    }

    // Ordered list
    const ol = /^\d+\.\s+(.+)/.exec(line);
    if (ol) {
      if (!inList || !listOrdered) {
        if (inList) flushList();
        out.push('<ol class="my-2 ml-4 list-decimal space-y-1 text-sm text-zinc-700">');
        inList = true;
        listOrdered = true;
      }
      out.push(`<li>${inlineFormat(ol[1])}</li>`);
      continue;
    }

    // Paragraph
    flushList();
    out.push(`<p class="text-sm leading-relaxed text-zinc-700">${inlineFormat(line)}</p>`);
  }

  flushList();
  if (inCodeBlock && codeLines.length > 0) {
    out.push(
      `<pre class="my-2 overflow-x-auto rounded-lg bg-zinc-900 px-4 py-3 font-mono text-xs leading-relaxed text-zinc-100">${escape(codeLines.join("\n"))}</pre>`,
    );
  }

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// TutorialDrawer
// ---------------------------------------------------------------------------

export function TutorialDrawer({
  templateId,
  open,
  onClose,
}: {
  /** Parent template ID whose tutorial to load. Null = nothing to show. */
  templateId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const [loading, setLoading] = useState(false);
  const [tutorial, setTutorial] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !templateId) {
      setTutorial(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/templates/${encodeURIComponent(templateId)}/meta`)
      .then((res) => res.json())
      .then((data: { ok?: boolean; meta?: TemplateMeta }) => {
        if (cancelled) return;
        if (data.ok && data.meta) {
          setTutorial(data.meta.tutorial || null);
        } else {
          setTutorial(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load tutorial.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, templateId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-zinc-900/20 backdrop-blur-sm"
          aria-hidden
          onClick={onClose}
        />
      ) : null}

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-zinc-500" aria-hidden />
            <h2 id={titleId} className="text-[15px] font-semibold text-zinc-900">
              Tutorial
            </h2>
            {templateId ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-500">
                {templateId}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close tutorial"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading tutorial…
            </div>
          ) : error ? (
            <p className="py-12 text-center text-sm text-red-500" role="alert">
              {error}
            </p>
          ) : !templateId ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <BookOpen className="h-10 w-10 text-zinc-200" aria-hidden />
              <p className="text-sm text-zinc-500">No template active.</p>
            </div>
          ) : !tutorial ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <BookOpen className="h-10 w-10 text-zinc-200" aria-hidden />
              <p className="text-sm font-medium text-zinc-600">No tutorial available</p>
              <p className="text-xs text-zinc-400">
                The template author hasn&apos;t added a tutorial yet.
              </p>
            </div>
          ) : (
            <div
              className="prose-sm max-w-none"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: renderMarkdown(tutorial) }}
            />
          )}
        </div>
      </div>
    </>
  );
}
