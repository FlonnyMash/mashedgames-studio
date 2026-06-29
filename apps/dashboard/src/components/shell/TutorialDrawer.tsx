"use client";

import { RichHtmlContent } from "@/components/ui/RichHtmlContent";
import { BookOpen, Loader2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

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
            <RichHtmlContent source={tutorial} variant="light" className="prose-sm" />
          )}
        </div>
      </div>
    </>
  );
}
