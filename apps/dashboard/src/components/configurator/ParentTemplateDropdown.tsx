"use client";

import type { TemplateOverviewEntry } from "@/lib/template-overview-types";
import { cn } from "@/lib/utils";
import type { GameTemplateId } from "@mashedgames/shared";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export function ParentTemplateDropdown({
  templates,
  loading,
  selectedTemplateId,
  onSelectTemplate,
  disabled = false,
}: {
  templates: TemplateOverviewEntry[];
  selectedTemplateId: string;
  onSelectTemplate: (templateId: GameTemplateId) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId,
  );

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  const handleSelect = (templateId: string) => {
    onSelectTemplate(templateId as GameTemplateId);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          className={cn(
            "truncate",
            selectedTemplate ? "text-zinc-900" : "text-zinc-400",
          )}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading templates…
            </span>
          ) : selectedTemplate ? (
            selectedTemplate.displayName
          ) : (
            "Select a template…"
          )}
        </span>
        <ChevronDown
          className={cn(
            "ml-2 h-4 w-4 shrink-0 text-zinc-400 transition-transform",
            isOpen && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Parent template"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg"
        >
          {templates.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-400">
              No templates available
            </li>
          ) : (
            templates.map((template) => {
              const selected = template.id === selectedTemplateId;
              return (
                <li key={template.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => handleSelect(template.id)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-100",
                      selected ? "font-medium text-zinc-900" : "text-zinc-700",
                    )}
                  >
                    <span className="truncate">{template.displayName}</span>
                    {selected ? (
                      <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-zinc-900" />
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
