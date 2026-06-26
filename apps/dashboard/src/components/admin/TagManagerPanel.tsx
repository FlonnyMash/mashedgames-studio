"use client";

import type { TagCategory } from "@mashedgames/shared";
import { Loader2, Pencil, Plus, RefreshCw, Tag, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { adminApiFetch } from "@/lib/admin-api-client";
import { useAuthStore } from "@/store/useAuthStore";
import type { TagWithCategory } from "@/lib/tag-api-types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      categories: TagCategory[];
      tags: TagWithCategory[];
    };

function resolveApiError(status: number | undefined, message?: string): string {
  if (status === 401) return "Session expired. Please sign in again.";
  if (status === 403) return "Forbidden — studio_admin role required.";
  return message ?? `Request failed (HTTP ${status}).`;
}

export function TagManagerPanel() {
  const authIsLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | "all">("all");
  const [categoryDraft, setCategoryDraft] = useState({
    name: "",
    slug: "",
    description: "",
    sortOrder: "0",
  });
  const [tagDraft, setTagDraft] = useState({ name: "", slug: "", categoryId: "" });
  const [busy, setBusy] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagEditDraft, setTagEditDraft] = useState({
    name: "",
    slug: "",
    categoryId: "",
  });
  const [categoryEditDraft, setCategoryEditDraft] = useState({
    name: "",
    slug: "",
    description: "",
    sortOrder: "0",
  });

  const load = useCallback(async () => {
    if (authIsLoading) return;

    setState({ status: "loading" });

    if (!isAuthenticated) {
      setState({ status: "error", message: "Not signed in." });
      return;
    }

    const [catJson, tagJson] = await Promise.all([
      adminApiFetch<{ categories: TagCategory[] }>("/api/admin/tag-categories"),
      adminApiFetch<{ tags: TagWithCategory[] }>("/api/admin/tags"),
    ]);

    if (!catJson.ok) {
      setState({
        status: "error",
        message: resolveApiError(catJson.status, catJson.error),
      });
      return;
    }
    if (!tagJson.ok) {
      setState({
        status: "error",
        message: resolveApiError(tagJson.status, tagJson.error),
      });
      return;
    }

    setState({
      status: "ready",
      categories: catJson.categories,
      tags: tagJson.tags,
    });

    setTagDraft((prev) =>
      prev.categoryId ? prev : { ...prev, categoryId: catJson.categories[0]?.id ?? "" },
    );
  }, [authIsLoading, isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCategory() {
    if (state.status !== "ready") return;

    setBusy(true);
    try {
      const json = await adminApiFetch("/api/admin/tag-categories", {
        method: "POST",
        body: {
          name: categoryDraft.name,
          slug: categoryDraft.slug || undefined,
          description: categoryDraft.description,
          sortOrder: Number(categoryDraft.sortOrder) || 0,
        },
      });
      if (!json.ok) {
        toast.error(resolveApiError(json.status, json.error));
        return;
      }
      toast.success("Category created.");
      setCategoryDraft({ name: "", slug: "", description: "", sortOrder: "0" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(id: string) {
    setBusy(true);
    try {
      const json = await adminApiFetch(`/api/admin/tag-categories/${id}`, {
        method: "DELETE",
      });
      if (!json.ok) {
        toast.error(resolveApiError(json.status, json.error));
        return;
      }
      toast.success("Category deleted.");
      if (selectedCategoryId === id) setSelectedCategoryId("all");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createTag() {
    if (state.status !== "ready") return;

    const categoryId = tagDraft.categoryId || state.categories[0]?.id;
    if (!categoryId) {
      toast.error("Create a category first.");
      return;
    }

    setBusy(true);
    try {
      const json = await adminApiFetch("/api/admin/tags", {
        method: "POST",
        body: {
          name: tagDraft.name,
          slug: tagDraft.slug || undefined,
          categoryId,
        },
      });
      if (!json.ok) {
        toast.error(resolveApiError(json.status, json.error));
        return;
      }
      toast.success("Tag created.");
      setTagDraft((prev) => ({ ...prev, name: "", slug: "" }));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteTag(id: string) {
    setBusy(true);
    try {
      const json = await adminApiFetch(`/api/admin/tags/${id}`, {
        method: "DELETE",
      });
      if (!json.ok) {
        toast.error(resolveApiError(json.status, json.error));
        return;
      }
      toast.success("Tag deleted.");
      if (editingTagId === id) setEditingTagId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function updateCategory(id: string) {
    setBusy(true);
    try {
      const json = await adminApiFetch(`/api/admin/tag-categories/${id}`, {
        method: "PATCH",
        body: {
          name: categoryEditDraft.name,
          slug: categoryEditDraft.slug || undefined,
          description: categoryEditDraft.description,
          sortOrder: Number(categoryEditDraft.sortOrder) || 0,
        },
      });
      if (!json.ok) {
        toast.error(resolveApiError(json.status, json.error));
        return;
      }
      toast.success("Category updated.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  function startEditCategory(cat: TagCategory) {
    setSelectedCategoryId(cat.id);
    setCategoryEditDraft({
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      sortOrder: String(cat.sortOrder),
    });
  }

  function startEditTag(tag: TagWithCategory) {
    setEditingTagId(tag.id);
    setTagEditDraft({
      name: tag.name,
      slug: tag.slug,
      categoryId: tag.categoryId,
    });
  }

  async function updateTag(id: string) {
    setBusy(true);
    try {
      const json = await adminApiFetch(`/api/admin/tags/${id}`, {
        method: "PATCH",
        body: {
          name: tagEditDraft.name,
          slug: tagEditDraft.slug || undefined,
          categoryId: tagEditDraft.categoryId,
        },
      });
      if (!json.ok) {
        toast.error(resolveApiError(json.status, json.error));
        return;
      }
      toast.success("Tag updated.");
      setEditingTagId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (authIsLoading || state.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading tags…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {state.message}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Retry
        </button>
      </div>
    );
  }

  const filteredTags =
    selectedCategoryId === "all"
      ? state.tags
      : state.tags.filter((t) => t.categoryId === selectedCategoryId);

  const selectedCategory =
    selectedCategoryId !== "all"
      ? state.categories.find((c) => c.id === selectedCategoryId)
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Tag Manager</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Global categories and tags for storefront filtering.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Refresh
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Categories */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-zinc-800">Categories</h3>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategoryId("all")}
              className={`rounded-lg px-3 py-2 text-left text-sm ${
                selectedCategoryId === "all"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              All tags
            </button>
            {state.categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => startEditCategory(cat)}
                  className={`flex-1 rounded-lg px-3 py-2 text-left text-sm ${
                    selectedCategoryId === cat.id
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <span className="font-medium">{cat.name}</span>
                  <span className="ml-2 text-xs opacity-70">{cat.slug}</span>
                </button>
                <button
                  type="button"
                  onClick={() => startEditCategory(cat)}
                  disabled={busy}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
                  aria-label={`Edit ${cat.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteCategory(cat.id)}
                  disabled={busy}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  aria-label={`Delete ${cat.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {selectedCategory ? (
            <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Edit category
              </p>
              <div className="flex flex-col gap-2">
                <input
                  value={categoryEditDraft.name}
                  onChange={(e) =>
                    setCategoryEditDraft((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="Name"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={categoryEditDraft.slug}
                  onChange={(e) =>
                    setCategoryEditDraft((p) => ({ ...p, slug: e.target.value }))
                  }
                  placeholder="Slug"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
                />
                <input
                  value={categoryEditDraft.description}
                  onChange={(e) =>
                    setCategoryEditDraft((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Description"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={categoryEditDraft.sortOrder}
                  onChange={(e) =>
                    setCategoryEditDraft((p) => ({ ...p, sortOrder: e.target.value }))
                  }
                  placeholder="Sort order"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void updateCategory(selectedCategory.id)}
                  disabled={busy || !categoryEditDraft.name.trim()}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  Save changes
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 border-t border-zinc-100 pt-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
              New category
            </p>
            <div className="flex flex-col gap-2">
              <input
                value={categoryDraft.name}
                onChange={(e) =>
                  setCategoryDraft((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Name"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                value={categoryDraft.slug}
                onChange={(e) =>
                  setCategoryDraft((p) => ({ ...p, slug: e.target.value }))
                }
                placeholder="Slug (optional, auto-generated)"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                value={categoryDraft.sortOrder}
                onChange={(e) =>
                  setCategoryDraft((p) => ({ ...p, sortOrder: e.target.value }))
                }
                placeholder="Sort order"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void createCategory()}
                disabled={busy || !categoryDraft.name.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add category
              </button>
            </div>
          </div>
        </section>

        {/* Tags */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-zinc-800">Tags</h3>

          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-100">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Slug</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filteredTags.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-zinc-400">
                      No tags yet.
                    </td>
                  </tr>
                ) : (
                  filteredTags.map((tag) =>
                    editingTagId === tag.id ? (
                      <tr key={tag.id} className="border-t border-zinc-100 bg-zinc-50">
                        <td colSpan={4} className="px-3 py-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <input
                              value={tagEditDraft.name}
                              onChange={(e) =>
                                setTagEditDraft((p) => ({ ...p, name: e.target.value }))
                              }
                              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                            <input
                              value={tagEditDraft.slug}
                              onChange={(e) =>
                                setTagEditDraft((p) => ({ ...p, slug: e.target.value }))
                              }
                              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
                            />
                            <select
                              value={tagEditDraft.categoryId}
                              onChange={(e) =>
                                setTagEditDraft((p) => ({
                                  ...p,
                                  categoryId: e.target.value,
                                }))
                              }
                              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm sm:col-span-2"
                            >
                              {state.categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name}
                                </option>
                              ))}
                            </select>
                            <div className="flex gap-2 sm:col-span-2">
                              <button
                                type="button"
                                onClick={() => void updateTag(tag.id)}
                                disabled={busy || !tagEditDraft.name.trim()}
                                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTagId(null)}
                                disabled={busy}
                                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                              >
                                <X className="h-3 w-3" aria-hidden />
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={tag.id} className="border-t border-zinc-100">
                        <td className="px-3 py-2 font-medium text-zinc-800">{tag.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-500">{tag.slug}</td>
                        <td className="px-3 py-2 text-zinc-600">{tag.categoryName}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => startEditTag(tag)}
                              disabled={busy}
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
                              aria-label={`Edit ${tag.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteTag(tag.id)}
                              disabled={busy}
                              className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              aria-label={`Delete ${tag.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 border-t border-zinc-100 pt-5">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
              <Tag className="h-3.5 w-3.5" aria-hidden />
              New tag
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={tagDraft.name}
                onChange={(e) => setTagDraft((p) => ({ ...p, name: e.target.value }))}
                placeholder="Name"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                value={tagDraft.slug}
                onChange={(e) => setTagDraft((p) => ({ ...p, slug: e.target.value }))}
                placeholder="Slug (optional)"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <select
                value={tagDraft.categoryId || state.categories[0]?.id || ""}
                onChange={(e) =>
                  setTagDraft((p) => ({ ...p, categoryId: e.target.value }))
                }
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
              >
                {state.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void createTag()}
                disabled={busy || !tagDraft.name.trim() || state.categories.length === 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 sm:col-span-2"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add tag
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
