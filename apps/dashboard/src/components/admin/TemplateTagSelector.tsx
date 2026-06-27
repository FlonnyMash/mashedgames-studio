"use client";

import type { TagWithCategory } from "@/lib/tag-api-types";
import { Loader2, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { adminApiFetch } from "@/lib/admin-api-client";
import { useAuthStore } from "@/store/useAuthStore";

type TemplateTagSelectorProps = {
  templateSlug: string;
  disabled?: boolean;
  mode?: "standalone" | "unified";
  onDirtyChange?: (dirty: boolean) => void;
  onSelectionChange?: (tagIds: string[]) => void;
  onSaved?: () => void;
};

export function TemplateTagSelector({
  templateSlug,
  disabled = false,
  mode = "standalone",
  onDirtyChange,
  onSelectionChange,
  onSaved,
}: TemplateTagSelectorProps) {
  const authIsLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [allTags, setAllTags] = useState<TagWithCategory[]>([]);
  const [selected, setSelected] = useState<TagWithCategory[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [createCategoryId, setCreateCategoryId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (authIsLoading) return;

    setLoading(true);
    setLoadError(null);

    if (!isAuthenticated) {
      setLoadError("Sign in as a studio admin to manage template tags.");
      setLoading(false);
      return;
    }

    try {
      const [allJson, assignedJson, catJson] = await Promise.all([
        adminApiFetch<{ tags: TagWithCategory[] }>("/api/admin/tags"),
        adminApiFetch<{ tags: TagWithCategory[] }>(
          `/api/templates/${encodeURIComponent(templateSlug)}/tags`,
        ),
        adminApiFetch<{ categories: { id: string }[] }>("/api/admin/tag-categories"),
      ]);

      if (!allJson.ok) {
        setLoadError(allJson.error);
        return;
      }
      if (!assignedJson.ok) {
        setLoadError(assignedJson.error);
        return;
      }

      setAllTags(allJson.tags);
      setSelected(assignedJson.tags);
      setSavedIds(assignedJson.tags.map((t) => t.id));

      if (catJson.ok && catJson.categories[0]) {
        setCreateCategoryId(catJson.categories[0].id);
      }
    } catch {
      setLoadError("Failed to load tags.");
    } finally {
      setLoading(false);
    }
  }, [authIsLoading, isAuthenticated, templateSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedIds = useMemo(
    () => selected.map((t) => t.id),
    [selected],
  );
  const isDirty =
    selectedIds.length !== savedIds.length ||
    selectedIds.some((id) => !savedIds.includes(id));

  const lastDirtyRef = useRef(isDirty);
  useEffect(() => {
    if (lastDirtyRef.current === isDirty) return;
    lastDirtyRef.current = isDirty;
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const lastSelectionKeyRef = useRef("");
  useEffect(() => {
    const selectionKey = selectedIds.join("\0");
    if (lastSelectionKeyRef.current === selectionKey) return;
    lastSelectionKeyRef.current = selectionKey;
    onSelectionChange?.(selectedIds);
  }, [onSelectionChange, selectedIds]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const available = allTags.filter(
    (tag) =>
      !selectedIds.includes(tag.id) &&
      (query.trim() === "" ||
        tag.name.toLowerCase().includes(query.toLowerCase()) ||
        tag.slug.toLowerCase().includes(query.toLowerCase())),
  );

  const exactMatch = allTags.some(
    (tag) => tag.name.toLowerCase() === query.trim().toLowerCase(),
  );

  function addTag(tag: TagWithCategory) {
    setSelected((prev) => [...prev, tag]);
    setQuery("");
    setOpen(false);
  }

  function removeTag(tagId: string) {
    setSelected((prev) => prev.filter((t) => t.id !== tagId));
  }

  async function createAndAddTag() {
    const name = query.trim();
    if (!name || !createCategoryId) return;

    setSaving(true);
    try {
      const json = await adminApiFetch<{ tag: TagWithCategory }>("/api/admin/tags", {
        method: "POST",
        body: { name, categoryId: createCategoryId },
      });

      if (!json.ok) {
        toast.error(json.error);
        return;
      }

      setAllTags((prev) => [...prev, json.tag]);
      addTag(json.tag);
      toast.success(`Tag "${json.tag.name}" created.`);
    } finally {
      setSaving(false);
    }
  }

  async function saveTags(): Promise<boolean> {
    setSaving(true);
    try {
      const json = await adminApiFetch(
        `/api/templates/${encodeURIComponent(templateSlug)}/tags`,
        {
          method: "PUT",
          body: { tagIds: selectedIds },
        },
      );
      if (!json.ok) {
        toast.error(json.error ?? "Failed to save tags.");
        return false;
      }
      setSavedIds(selectedIds);
      onSaved?.();
      return true;
    } finally {
      setSaving(false);
    }
  }

  if (authIsLoading || loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading tags…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
        {loadError}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Storefront tags
        </span>
        <p className="mt-1 text-xs text-zinc-500">
          Tags appear in the client store filter sidebar once this template is
          published.
        </p>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                disabled={disabled || saving}
                className="rounded-full p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-50"
                aria-label={`Remove ${tag.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            disabled={disabled || saving}
            placeholder="Search or create tags…"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 disabled:opacity-50"
          />
        </div>

        {open && (available.length > 0 || (query.trim() && !exactMatch)) ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
          >
            {available.map((tag) => (
              <li key={tag.id} role="option">
                <button
                  type="button"
                  onClick={() => addTag(tag)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50"
                >
                  <span className="font-medium text-zinc-800">{tag.name}</span>
                  <span className="text-xs text-zinc-400">{tag.categoryName}</span>
                </button>
              </li>
            ))}
            {query.trim() && !exactMatch ? (
              <li role="option">
                <button
                  type="button"
                  onClick={() => void createAndAddTag()}
                  disabled={!createCategoryId || saving}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Create &ldquo;{query.trim()}&rdquo;
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {mode === "standalone" && isDirty ? (
        <button
          type="button"
          onClick={() => void saveTags()}
          disabled={disabled || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : null}
          Save tags
        </button>
      ) : null}
    </div>
  );
}
