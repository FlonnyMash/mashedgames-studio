"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { StorefrontDetailsDialog } from "@/components/store/StorefrontDetailsDialog";
import type { EnrichedTemplate } from "@/components/store/storefront-types";
import { fetchStoreTemplateDetail } from "@/lib/storefront-template-client";
import { buildAdminTemplateHref } from "@/lib/storefront-editor-routes";
import { useAuthStore } from "@/store/useAuthStore";

export function StoreTemplateDetailPage({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useAuthStore((s) => s.role);
  const authIsLoading = useAuthStore((s) => s.isLoading);

  const [template, setTemplate] = useState<EnrichedTemplate | null>(null);
  const [isAdminPreview, setIsAdminPreview] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const editMode = searchParams.get("edit") === "true";
  const isStudioAdmin = role === "studio_admin";
  const fromAdmin = searchParams.get("from") === "admin";
  const adminReturnUrl = useMemo(
    () => (fromAdmin ? buildAdminTemplateHref(slug, "preview") : undefined),
    [fromAdmin, slug],
  );

  useEffect(() => {
    if (authIsLoading) return;

    let cancelled = false;

    void fetchStoreTemplateDetail(slug)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          setTemplate(null);
          return;
        }
        setError(null);
        setTemplate(result.template);
        setIsAdminPreview(result.isAdminPreview);
        setIsDraft(result.isDraft);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load template.");
        setTemplate(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authIsLoading, slug]);

  const setEditMode = (next: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("edit", "true");
    } else {
      params.delete("edit");
    }
    const query = params.toString();
    router.replace(
      query
        ? `/dashboard/store/templates/${encodeURIComponent(slug)}?${query}`
        : `/dashboard/store/templates/${encodeURIComponent(slug)}`,
      { scroll: false },
    );
  };

  if (authIsLoading || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" aria-hidden />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm font-medium text-zinc-800">
          {error === "Template not found." ? "Template not found" : "Could not load template"}
        </p>
        {error && error !== "Template not found." ? (
          <p className="mt-2 text-xs text-zinc-500">{error}</p>
        ) : null}
        <Link
          href="/dashboard/store"
          className="mt-6 inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Back to Store
        </Link>
      </div>
    );
  }

  const handleTemplateUpdated = (updated: EnrichedTemplate) => {
    setTemplate(updated);
    router.refresh();
    void fetchStoreTemplateDetail(slug).then((result) => {
      if (result.ok) {
        setTemplate(result.template);
        setIsAdminPreview(result.isAdminPreview);
        setIsDraft(result.isDraft);
      }
    });
  };

  return (
    <StorefrontDetailsDialog
      key={`${template.template_slug}-${editMode}`}
      template={template}
      atLicenseCap={false}
      layout="page"
      isAdminPreview={isAdminPreview}
      isDraft={isDraft}
      editMode={editMode && isStudioAdmin}
      onEditModeChange={isStudioAdmin ? setEditMode : undefined}
      onTemplateUpdated={handleTemplateUpdated}
      adminReturnUrl={adminReturnUrl}
      onClose={() =>
        router.push(fromAdmin ? adminReturnUrl! : "/dashboard/store")
      }
    />
  );
}
