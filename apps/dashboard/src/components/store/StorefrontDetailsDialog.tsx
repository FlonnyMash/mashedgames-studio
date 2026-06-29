"use client";

import { useId, useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type MouseEvent } from "react";
import type { Editor } from "@tiptap/core";
import { Gamepad2, Lock, Loader2, Pencil, Play, Settings2, X } from "lucide-react";
import type { Tables } from "@/lib/supabaseClient";
import { supabase } from "@/lib/supabaseClient";
import { useAuthStore } from "@/store/useAuthStore";
import { claimGameViaIpc } from "@/lib/store-ipc";
import { useGameLibraryStore } from "@/store/useGameLibraryStore";
import { toast } from "sonner";
import { BadgePill, getBadgeStyle } from "@/lib/badge-config";
import { getTierStyle, TierBadge, type TemplateTier } from "@/lib/tier-config";
import {
  parseManifest,
  slugToTitle,
  type EnrichedTemplate,
} from "./storefront-types";
import { StorefrontDemoPreview } from "./StorefrontDemoPreview";
import {
  sanitizeControlsForSave,
  TemplateControlsEditor,
} from "./TemplateControlsEditor";
import { useTheaterMode } from "@/lib/theater-preview-styles";
import { RichHtmlContent } from "@/components/ui/RichHtmlContent";
import { InlineRichTextEditor } from "@/components/ui/InlineRichTextEditor";
import { InlineTitleEditor } from "@/components/ui/InlineTitleEditor";
import { StorefrontEditMetadataPanel } from "@/components/store/StorefrontEditMetadataPanel";
import { StorefrontRichTextToolbarDock } from "@/components/store/StorefrontRichTextToolbarDock";
import { adminApiFetch } from "@/lib/admin-api-client";
import type { TemplateControlEntry } from "@mashedgames/shared";
import {
  isEmptyRichHtml,
  normalizeEditorContent,
  normalizeRichContentForCompare,
} from "@/lib/rich-html-content";
import { cn } from "@/lib/utils";
import { type BadgeType } from "@mashedgames/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";

const UI_MODULE_LABELS: Record<string, string> = {
  highscore: "Highscore",
  "lead-capture": "Lead Capture",
  "countdown-timer": "Countdown Timer",
  "lives-display": "Lives Display",
  "combo-multiplier": "Combo Multiplier",
  "percentage-win": "Win %",
};

const PRO_FEATURE_MODULES = ["lead-capture", "highscore", "combo-multiplier"];

function isElectronRuntime() {
  return (
    typeof window !== "undefined" &&
    !!(window as Window & { electron?: { ipcRenderer?: unknown } }).electron
      ?.ipcRenderer
  );
}

function usesExternalDashboardInElectron(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (
      window as Window & {
        mashedRuntime?: { usesExternalDashboard?: boolean };
      }
    ).mashedRuntime?.usesExternalDashboard === true
  );
}

type ClaimSuccessResponse = { ok: true; game: Tables<"games"> };
type ClaimErrorResponse = { ok: false; error: string };

async function resolveAccessToken(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.access_token) {
    return sessionData.session.access_token;
  }

  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed?.session?.access_token ?? null;
}

async function resolveTargetOwnerId(): Promise<string | null> {
  const storeUserId = useAuthStore.getState().userId;
  if (storeUserId) return storeUserId;

  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData?.session?.user.id ?? null;
}

function slugFromTemplate(templateSlug: string): string {
  const base = templateSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  const slug = base.length > 0 ? `${base}-${suffix}` : `game-${suffix}`;
  return slug.length >= 3 ? slug : `game-${suffix}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPublishedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// ---------------------------------------------------------------------------
// FeaturePill
// ---------------------------------------------------------------------------

function FeaturePill({
  module,
  isLicensed,
}: {
  module: string;
  isLicensed: boolean;
}) {
  const label = UI_MODULE_LABELS[module] ?? module;
  const showLock = PRO_FEATURE_MODULES.includes(module) && !isLicensed;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm">
      {showLock ? (
        <Lock className="h-3 w-3 shrink-0 text-zinc-400" aria-hidden />
      ) : null}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// AcquireCTA
// ---------------------------------------------------------------------------

type CtaState =
  | "owned"
  | "free-acquire"
  | "premium-lock"
  | "cap-reached"
  | "pending"
  | "error";

function AcquireCTA({
  template,
  atLicenseCap,
  onClose,
  tone = "default",
}: {
  template: EnrichedTemplate;
  atLicenseCap: boolean;
  onClose: () => void;
  tone?: "default" | "hero" | "theater";
}) {
  const addClaimedTemplate = useGameLibraryStore((s) => s.addClaimedTemplate);
  const [ctaState, setCtaState] = useState<CtaState>(() => {
    if (template.isLicensed) return "owned";
    if (atLicenseCap) return "cap-reached";
    if (template.tier === "free") return "free-acquire";
    return "premium-lock";
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resolvedOwned = template.isLicensed || ctaState === "owned";
  const tierLabel = getTierStyle(template.tier).label;
  const isHero = tone === "hero";
  const isTheater = tone === "theater";

  if (resolvedOwned) {
    return (
      <button
        type="button"
        className={
          isTheater
            ? "inline-flex min-w-[12rem] items-center justify-center rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-zinc-900 shadow-lg transition-all hover:bg-zinc-100 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            : isHero
              ? "w-full rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:w-auto"
              : "w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
        }
      >
        {isTheater ? "Start now" : "Open in Engine"}
      </button>
    );
  }

  if (ctaState === "cap-reached") {
    return (
      <div
        aria-disabled="true"
        className={
          isTheater
            ? "inline-flex min-w-[12rem] cursor-not-allowed items-center justify-center rounded-full border border-white/10 bg-white/5 px-8 py-3.5 text-sm font-medium text-zinc-500 select-none"
            : "w-full cursor-not-allowed rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-center text-sm font-medium text-zinc-400 select-none"
        }
        title="Your plan's template limit has been reached. Contact your account manager to expand your entitlement."
      >
        License cap reached
      </div>
    );
  }

  if (ctaState === "premium-lock") {
    if (isTheater) {
      return (
        <div
          aria-disabled="true"
          className="inline-flex min-w-[12rem] cursor-not-allowed items-center justify-center rounded-full border border-amber-400/20 bg-amber-500/10 px-8 py-3.5 text-sm font-medium text-amber-200 select-none"
          title="Premium and Enterprise templates require license provisioning by your account manager."
        >
          Upgrade Required
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-2">
        <div
          aria-disabled="true"
          className="w-full cursor-not-allowed rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-700 select-none"
          title="Premium and Enterprise templates require license provisioning by your account manager."
        >
          Upgrade Required
        </div>
        <p className="text-xs text-zinc-400">
          Contact your account manager to license this template.
        </p>
      </div>
    );
  }

  if (ctaState === "pending") {
    return (
      <button
        type="button"
        disabled
        className={
          isTheater
            ? "inline-flex min-w-[12rem] items-center justify-center gap-2 rounded-full bg-white/90 px-8 py-3.5 text-sm font-semibold text-zinc-900 disabled:opacity-60"
            : "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        }
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Adding to library…
      </button>
    );
  }

  if (ctaState === "error") {
    return (
      <div className="space-y-2">
        {errorMsg ? (
          <p className="text-center text-xs text-red-600" role="alert">
            {errorMsg}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            setCtaState("free-acquire");
          }}
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          Try again
        </button>
      </div>
    );
  }

  const handleAcquire = async () => {
    setCtaState("pending");
    setErrorMsg(null);

    const finishSuccess = () => {
      addClaimedTemplate(template.id);
      setCtaState("owned");
      toast.success("Template successfully added to your library!");
      onClose();
    };

    const fail = (message: string) => {
      toast.error(message);
      setErrorMsg(message);
      setCtaState("error");
    };

    try {
      const claimViaHttp = async () => {
        const jwt = await resolveAccessToken();
        if (!jwt) {
          fail("Session expired. Please sign in again.");
          return;
        }

        const targetOwnerId = await resolveTargetOwnerId();
        if (!targetOwnerId) {
          fail("Could not determine your user ID. Please reload and try again.");
          return;
        }

        const res = await fetch("/api/games/claim", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            templateId: template.id,
            targetOwnerId,
            slug: slugFromTemplate(template.template_slug),
          }),
        });

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error(
            res.status === 500
              ? "Server misconfiguration. Check Supabase keys in .env.local."
              : `Claim API returned an unexpected response (${res.status}).`,
          );
        }

        const data = (await res.json()) as ClaimSuccessResponse | ClaimErrorResponse;

        if (!res.ok || !data.ok) {
          throw new Error(
            !data.ok ? data.error : "Failed to add template to library.",
          );
        }

        finishSuccess();
      };

      if (isElectronRuntime()) {
        const data = await claimGameViaIpc(template.id, template.template_slug);
        if (data) {
          if (!data.ok) {
            const message =
              data.error === "SESSION_EXPIRED"
                ? "Session expired. Please sign in again."
                : data.error;
            throw new Error(message);
          }

          finishSuccess();
          return;
        }

        if (
          process.env.NODE_ENV !== "production" &&
          usesExternalDashboardInElectron()
        ) {
          await claimViaHttp();
          return;
        }

        throw new Error(
          "Desktop auth bridge is out of date. Quit Electron fully and restart pnpm dev.",
        );
      }

      await claimViaHttp();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Failed to add template to library.");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleAcquire()}
      className={
        isTheater
          ? "inline-flex min-w-[12rem] items-center justify-center rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-zinc-900 shadow-lg transition-all hover:bg-zinc-100 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          : isHero
            ? "w-full rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:w-auto"
            : "w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
      }
    >
      {isTheater ? "Use this template" : `Add to Library — ${tierLabel}`}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pitch section helper
// ---------------------------------------------------------------------------

function PitchSection({
  title,
  children,
  large = false,
  tone = "light",
}: {
  title: string;
  children: ReactNode;
  large?: boolean;
  tone?: "light" | "dark";
}) {
  return (
    <section className="space-y-5 sm:space-y-6">
      <h3
        className={
          large
            ? tone === "dark"
              ? "text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl"
              : "text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl"
            : tone === "dark"
              ? "text-[11px] font-semibold uppercase tracking-widest text-zinc-400"
              : "text-[11px] font-semibold uppercase tracking-widest text-zinc-400"
        }
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function HeroBadge({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
      {children}
    </span>
  );
}

function collectFallbackImages(template: EnrichedTemplate): string[] {
  const previews = Array.isArray(template.preview_urls)
    ? template.preview_urls.filter(
        (url): url is string => typeof url === "string" && url.trim().length > 0,
      )
    : [];

  if (previews.length > 0) return previews;
  if (typeof template.thumbnail_url === "string" && template.thumbnail_url.trim()) {
    return [template.thumbnail_url];
  }
  return [];
}

// ---------------------------------------------------------------------------
// StorefrontDetailsDialog
// ---------------------------------------------------------------------------

type EditDraft = {
  title: string;
  description: string;
  tutorial: string;
  badgeType: BadgeType | null;
  tier: TemplateTier;
  tagIds: string[];
  thumbnailUrl: string;
  previewUrls: string[];
  controls: TemplateControlEntry[];
};

function editDraftFromTemplate(template: EnrichedTemplate): EditDraft {
  return {
    title: template.title?.trim() ?? "",
    description: normalizeEditorContent(template.description?.trim() ?? ""),
    tutorial: normalizeEditorContent(template.tutorial?.trim() ?? ""),
    badgeType: (template.badge_type as BadgeType | null) ?? null,
    tier: (template.tier ?? "free") as TemplateTier,
    tagIds: [],
    thumbnailUrl: template.thumbnail_url ?? "",
    previewUrls: Array.isArray(template.preview_urls) ? template.preview_urls : [],
    controls: template.controls ?? [],
  };
}

function richFieldsEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.trim() === b.trim()) return true;
  return (
    normalizeRichContentForCompare(a) === normalizeRichContentForCompare(b)
  );
}

function editDraftsEqual(a: EditDraft, b: EditDraft): boolean {
  return (
    a.title === b.title &&
    richFieldsEqual(a.description, b.description) &&
    richFieldsEqual(a.tutorial, b.tutorial) &&
    a.badgeType === b.badgeType &&
    a.tier === b.tier &&
    a.thumbnailUrl === b.thumbnailUrl &&
    JSON.stringify(a.previewUrls) === JSON.stringify(b.previewUrls) &&
    JSON.stringify([...a.tagIds].sort()) === JSON.stringify([...b.tagIds].sort()) &&
    JSON.stringify(a.controls) === JSON.stringify(b.controls)
  );
}

export function StorefrontDetailsDialog({
  template,
  atLicenseCap,
  onClose,
  layout = "modal",
  isAdminPreview = false,
  isDraft = false,
  editMode = false,
  onEditModeChange,
  onTemplateUpdated,
  adminReturnUrl,
}: {
  template: EnrichedTemplate;
  atLicenseCap: boolean;
  onClose: () => void;
  layout?: "modal" | "page";
  isAdminPreview?: boolean;
  isDraft?: boolean;
  editMode?: boolean;
  onEditModeChange?: (edit: boolean) => void;
  onTemplateUpdated?: (template: EnrichedTemplate) => void;
  /** When set, cancel/save navigation returns to the admin panel. */
  adminReturnUrl?: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const manifest = parseManifest(template.manifest);
  const { isExpanded, expand, setIsExpanded } = useTheaterMode();

  const [editDraft, setEditDraft] = useState<EditDraft>(() =>
    editDraftFromTemplate(template),
  );
  const [savedSnapshot, setSavedSnapshot] = useState<EditDraft>(() =>
    editDraftFromTemplate(template),
  );
  const [tagsDirty, setTagsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingEditMeta, setLoadingEditMeta] = useState(() => editMode);
  const [editSaveSuccess, setEditSaveSuccess] = useState(false);
  const [metadataPanelOpen, setMetadataPanelOpen] = useState(false);
  const [activeRichTextEditor, setActiveRichTextEditor] = useState<Editor | null>(
    null,
  );
  const [activeRichTextField, setActiveRichTextField] = useState("Description");
  const [editorRevision, setEditorRevision] = useState(0);
  const descriptionEditorRef = useRef<Editor | null>(null);
  const tutorialEditorRef = useRef<Editor | null>(null);

  const bumpEditorRevision = useCallback(() => {
    setEditorRevision((revision) => revision + 1);
  }, []);

  const readEditorHtml = useCallback((editor: Editor | null, fallback: string) => {
    if (!editor) return fallback;
    const html = editor.getHTML();
    return isEmptyRichHtml(html) ? "" : html;
  }, []);

  const templateSlug = template.template_slug ?? "";

  useEffect(() => {
    if (!editMode) {
      setActiveRichTextEditor(null);
      descriptionEditorRef.current = null;
      tutorialEditorRef.current = null;
    }
  }, [editMode]);

  const bindEditorRevision = useCallback(
    (editor: Editor) => {
      const refresh = () => bumpEditorRevision();
      editor.on("update", refresh);
      editor.on("selectionUpdate", refresh);
      return () => {
        editor.off("update", refresh);
        editor.off("selectionUpdate", refresh);
      };
    },
    [bumpEditorRevision],
  );

  const descriptionEditorCleanupRef = useRef<(() => void) | null>(null);
  const tutorialEditorCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      descriptionEditorCleanupRef.current?.();
      tutorialEditorCleanupRef.current?.();
    };
  }, []);

  const registerDescriptionEditor = useCallback(
    (editor: Editor) => {
      descriptionEditorCleanupRef.current?.();
      descriptionEditorRef.current = editor;
      descriptionEditorCleanupRef.current = bindEditorRevision(editor);
      setActiveRichTextEditor((current: Editor | null) => current ?? editor);
      setActiveRichTextField("Description");
      bumpEditorRevision();
    },
    [bindEditorRevision, bumpEditorRevision],
  );

  const registerTutorialEditor = useCallback(
    (editor: Editor) => {
      tutorialEditorCleanupRef.current?.();
      tutorialEditorRef.current = editor;
      tutorialEditorCleanupRef.current = bindEditorRevision(editor);
      bumpEditorRevision();
    },
    [bindEditorRevision, bumpEditorRevision],
  );

  const focusDescriptionEditor = useCallback(() => {
    if (descriptionEditorRef.current) {
      setActiveRichTextEditor(descriptionEditorRef.current);
      setActiveRichTextField("Description");
    }
  }, []);

  const focusTutorialEditor = useCallback(() => {
    if (tutorialEditorRef.current) {
      setActiveRichTextEditor(tutorialEditorRef.current);
      setActiveRichTextField("Configurator tutorial");
    }
  }, []);

  useEffect(() => {
    if (!editMode || !templateSlug) return;

    let cancelled = false;

    void adminApiFetch<{
      title: string;
      description: string;
      tutorial: string;
      badgeType: BadgeType | null;
      thumbnailUrl: string;
      previewUrls: string[];
      tagIds: string[];
      controls: TemplateControlEntry[];
    }>(`/api/templates/${encodeURIComponent(templateSlug)}/metadata`)
      .then((result) => {
        if (cancelled || !result.ok) return;
        setEditDraft((prev) => ({
          ...prev,
          title: result.title || prev.title,
          description: normalizeEditorContent(
            result.description || prev.description,
          ),
          tutorial: normalizeEditorContent(result.tutorial || prev.tutorial),
          badgeType: result.badgeType,
          thumbnailUrl: result.thumbnailUrl || prev.thumbnailUrl,
          previewUrls: result.previewUrls.length > 0 ? result.previewUrls : prev.previewUrls,
          tagIds: result.tagIds,
          controls: result.controls ?? prev.controls,
        }));
        setSavedSnapshot((prev) => ({
          ...prev,
          title: result.title || prev.title,
          description: normalizeEditorContent(
            result.description || prev.description,
          ),
          tutorial: normalizeEditorContent(result.tutorial || prev.tutorial),
          badgeType: result.badgeType,
          thumbnailUrl: result.thumbnailUrl || prev.thumbnailUrl,
          previewUrls: result.previewUrls.length > 0 ? result.previewUrls : prev.previewUrls,
          tagIds: result.tagIds,
          controls: result.controls ?? prev.controls,
        }));
      })
      .finally(() => {
        if (!cancelled) setLoadingEditMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editMode, templateSlug]);

  const displayName = useMemo(() => {
    if (editMode) {
      return (
        editDraft.title.trim() ||
        manifest.displayName ||
        slugToTitle(templateSlug)
      );
    }
    return (
      template.title?.trim() ||
      manifest.displayName ||
      slugToTitle(templateSlug)
    );
  }, [editDraft.title, editMode, manifest.displayName, template.title, templateSlug]);
  const featureModules: string[] = Array.isArray(manifest.supportsUI)
    ? manifest.supportsUI
    : [];
  const demoUrl = manifest.demo_url ?? null;
  const fallbackImages = collectFallbackImages(template);
  const heroKeyArt = fallbackImages[0] ?? null;
  const tutorial = editMode
    ? editDraft.tutorial
    : typeof template.tutorial === "string"
      ? template.tutorial.trim()
      : "";
  const description = editMode
    ? editDraft.description
    : template.description?.trim() ?? "";
  const tierLabel = getTierStyle(
    editMode ? editDraft.tier : template.tier,
  ).label;

  const isDirty = useMemo(() => {
    if (!editMode) return false;
    if (tagsDirty) return true;

    const liveDraft: EditDraft = {
      ...editDraft,
      description: readEditorHtml(
        descriptionEditorRef.current,
        editDraft.description,
      ),
      tutorial: readEditorHtml(tutorialEditorRef.current, editDraft.tutorial),
    };

    return !editDraftsEqual(liveDraft, savedSnapshot);
  }, [
    editDraft,
    editMode,
    editorRevision,
    readEditorHtml,
    savedSnapshot,
    tagsDirty,
  ]);
  const showSaveSuccess = editSaveSuccess && !isDirty;

  const handleCancelEdit = useCallback(() => {
    setEditDraft(savedSnapshot);
    setTagsDirty(false);
    setEditSaveSuccess(false);
    if (adminReturnUrl) {
      router.push(adminReturnUrl);
      return;
    }
    onEditModeChange?.(false);
  }, [adminReturnUrl, onEditModeChange, router, savedSnapshot]);

  const handleSaveEdit = useCallback(async () => {
    if (!templateSlug) return;

    const draftToSave: EditDraft = {
      ...editDraft,
      description: readEditorHtml(
        descriptionEditorRef.current,
        editDraft.description,
      ),
      tutorial: readEditorHtml(tutorialEditorRef.current, editDraft.tutorial),
      controls: sanitizeControlsForSave(editDraft.controls),
    };

    setSaving(true);
    try {
      const result = await adminApiFetch<{
        title: string;
        description: string;
        badgeType: BadgeType | null;
        tutorial: string;
        thumbnailUrl: string;
        previewUrls: string[];
        tagIds: string[];
        controls: TemplateControlEntry[];
      }>(`/api/templates/${encodeURIComponent(templateSlug)}/metadata`, {
        method: "PUT",
        body: {
          title: draftToSave.title,
          description: draftToSave.description,
          tutorial: draftToSave.tutorial,
          badgeType: draftToSave.badgeType,
          tier: draftToSave.tier,
          thumbnailUrl: draftToSave.thumbnailUrl,
          previewUrls: draftToSave.previewUrls,
          tagIds: draftToSave.tagIds,
          controls: draftToSave.controls,
        },
      });

      if (!result.ok) {
        toast.error("Save failed", { description: result.error });
        return;
      }

      const nextTemplate: EnrichedTemplate = {
        ...template,
        title: draftToSave.title,
        description: draftToSave.description,
        tutorial: draftToSave.tutorial,
        badge_type: draftToSave.badgeType,
        tier: draftToSave.tier,
        thumbnail_url: result.thumbnailUrl,
        preview_urls: result.previewUrls,
        controls: result.controls ?? draftToSave.controls,
      };

      setEditDraft(draftToSave);
      const nextSnapshot = { ...draftToSave, tagIds: draftToSave.tagIds };
      setSavedSnapshot(nextSnapshot);
      setTagsDirty(false);
      bumpEditorRevision();
      onTemplateUpdated?.(nextTemplate);
      setEditSaveSuccess(true);
      router.refresh();
      toast.success("Saved", {
        description: "Changes applied. You can keep editing.",
      });
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }, [
    bumpEditorRevision,
    editDraft,
    onTemplateUpdated,
    readEditorHtml,
    router,
    template,
    templateSlug,
  ]);

  const hasPitchContent =
    description ||
    featureModules.length > 0 ||
    tutorial.length > 0;

  const demoIframe = demoUrl ? (
    <iframe
      src={demoUrl}
      sandbox="allow-scripts allow-same-origin allow-forms"
      title={`${displayName} live demo`}
      loading="lazy"
      className="absolute inset-0 h-full w-full border-0"
    />
  ) : null;

  const demoTheaterFooter = (
    <AcquireCTA
      template={template}
      atLicenseCap={atLicenseCap}
      onClose={onClose}
      tone="theater"
    />
  );

  const demoControls = editMode
    ? sanitizeControlsForSave(editDraft.controls)
    : (template.controls ?? []);

  const dismissTheater = useCallback(() => {
    setIsExpanded(false);
  }, [setIsExpanded]);

  const handleShellClose = useCallback(
    (event?: MouseEvent) => {
      if (isExpanded) {
        event?.stopPropagation();
        event?.preventDefault();
        dismissTheater();
        return;
      }
      onClose();
    },
    [dismissTheater, isExpanded, onClose],
  );

  useEffect(() => {
    if (!isExpanded) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      dismissTheater();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dismissTheater, isExpanded]);

  const shellContent = (
    <>
      {heroKeyArt ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroKeyArt}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-3xl"
          />
        </>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 bg-zinc-950"
          aria-hidden
        />
      )}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/75 via-black/80 to-black/85"
        aria-hidden
      />

      {layout === "page" && !isExpanded ? (
        <Link
          href="/dashboard/store"
          className="absolute left-4 top-4 z-20 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
        >
          ← Store
        </Link>
      ) : null}

      {isAdminPreview && isDraft ? (
        <div
          role="status"
          className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-amber-400/30 bg-amber-500/20 px-4 py-1.5 text-xs font-medium text-amber-100 backdrop-blur-md"
        >
          Admin preview — not published
        </div>
      ) : null}

      {onEditModeChange && !editMode ? (
        <button
          type="button"
          onClick={() => onEditModeChange(true)}
          className="absolute right-16 top-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Edit
        </button>
      ) : null}

      {!isExpanded ? (
        <button
          type="button"
          onClick={(event) => handleShellClose(event)}
          className="absolute right-4 top-4 z-20 rounded-full bg-white/10 p-2 text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
          {/* ── Hero banner ── */}
          <section
            className={cn(
              "relative shrink-0",
              editMode ? "overflow-visible" : "overflow-hidden",
            )}
          >
            <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-5 pb-5 pt-20 text-center sm:px-10 sm:pb-6 sm:pt-24">
              {manifest.logoUrl ? (
                <div className="mb-5 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={manifest.logoUrl}
                    alt={`${displayName} logo`}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : null}

              <h2
                id={titleId}
                className="max-w-3xl px-2 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
              >
                {editMode ? (
                  <InlineTitleEditor
                    value={editDraft.title}
                    onChange={(title) =>
                      setEditDraft((prev) => ({ ...prev, title }))
                    }
                    placeholder="Storefront title"
                    className="text-center text-2xl font-bold text-white sm:text-3xl lg:text-4xl"
                  />
                ) : (
                  displayName
                )}
              </h2>

              {template.published_at ? (
                <p className="mt-3 text-sm text-zinc-400">
                  Updated {formatPublishedAt(template.published_at)}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {template.isLicensed ? (
                  <HeroBadge>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    In Library
                  </HeroBadge>
                ) : (
                  <HeroBadge>
                    <Lock className="h-3 w-3 shrink-0 text-white/70" aria-hidden />
                    Not owned
                  </HeroBadge>
                )}
                <TierBadge
                  tier={editMode ? editDraft.tier : template.tier}
                  className="border-white/15 bg-white/10 text-white/90"
                />
                <BadgePill
                  badgeType={editMode ? editDraft.badgeType : template.badge_type}
                  className="border-white/15 bg-white/10 text-white/90"
                />
              </div>

              <div className="mt-8 flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:justify-center">
                {demoUrl ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      expand();
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:w-auto"
                  >
                    <Play className="h-4 w-4 fill-current" aria-hidden />
                    Play Interactive Demo
                  </button>
                ) : null}
                <AcquireCTA
                  template={template}
                  atLicenseCap={atLicenseCap}
                  onClose={onClose}
                  tone="hero"
                />
              </div>

              {demoUrl ? (
                <div className="mt-8 w-full">
                  <StorefrontDemoPreview
                    isExpanded={isExpanded}
                    onExpandChange={setIsExpanded}
                    posterUrl={heroKeyArt}
                    posterAlt={`${displayName} preview`}
                    showExpandControl={false}
                    posterLayout="landscape"
                    backLabel="Back to template"
                    theaterFooter={demoTheaterFooter}
                    controls={demoControls}
                  >
                    {demoIframe}
                  </StorefrontDemoPreview>
                </div>
              ) : heroKeyArt ? (
                <div className="relative mt-8 inline-block max-w-full overflow-hidden rounded-2xl ring-1 ring-white/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroKeyArt}
                    alt={`${displayName} preview`}
                    className="block max-h-[min(40vh,400px)] w-auto max-w-full"
                  />
                </div>
              ) : (
                <div className="mt-8 flex aspect-video w-full max-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl bg-zinc-900/80 ring-1 ring-white/10">
                  <Gamepad2 className="h-10 w-10 text-zinc-600" aria-hidden />
                  <p className="text-sm text-zinc-500">No preview available</p>
                </div>
              )}
            </div>
          </section>

          {/* ── Template description (on hero background) ── */}
          {(description || tutorial || editMode) ? (
            <section className="w-full shrink-0 pb-10 pt-6 sm:pb-14 sm:pt-8">
              <div className="mx-auto max-w-4xl px-6 sm:px-10">
                <PitchSection title="Template Details" large tone="dark">
                  {editMode ? (
                    loadingEditMeta ? (
                      <div className="flex items-center justify-center gap-2 py-12">
                        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                        <span className="text-sm text-zinc-400">Loading…</span>
                      </div>
                    ) : (
                      <div className="space-y-10 overflow-visible sm:space-y-12">
                        <InlineRichTextEditor
                          value={editDraft.description}
                          onChange={(value) =>
                            setEditDraft((prev) => ({ ...prev, description: value }))
                          }
                          variant="dark"
                          placeholder="Describe the campaign integration…"
                          editorKey={`desc-${templateSlug}`}
                          onEditorReady={registerDescriptionEditor}
                          onEditorFocus={focusDescriptionEditor}
                        />
                        <TemplateControlsEditor
                          value={editDraft.controls}
                          onChange={(controls) =>
                            setEditDraft((prev) => ({ ...prev, controls }))
                          }
                          variant="dark"
                        />
                        {(editDraft.tutorial || editMode) ? (
                          <div className="space-y-4 overflow-visible">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                              Configurator tutorial
                            </p>
                            <InlineRichTextEditor
                              value={editDraft.tutorial}
                              onChange={(value) =>
                                setEditDraft((prev) => ({ ...prev, tutorial: value }))
                              }
                              variant="dark"
                              placeholder="Help text shown in the Configurator…"
                              editorKey={`tut-${templateSlug}`}
                              onEditorReady={registerTutorialEditor}
                              onEditorFocus={focusTutorialEditor}
                            />
                          </div>
                        ) : null}
                      </div>
                    )
                  ) : (
                    <div className="space-y-10 sm:space-y-12">
                      {description ? (
                        <RichHtmlContent source={description} variant="dark" />
                      ) : null}
                      {tutorial ? (
                        <div className="space-y-4">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                            Configurator tutorial
                          </p>
                          <RichHtmlContent source={tutorial} variant="dark" />
                        </div>
                      ) : null}
                    </div>
                  )}
                </PitchSection>
              </div>
            </section>
          ) : null}

          {/* ── Pitch content ── */}
          <section
            className={cn(
              "w-full bg-white pt-10 sm:pt-12",
              editMode ? "pb-28 sm:pb-32" : "pb-24 sm:pb-28",
            )}
          >
            <div className="mx-auto max-w-4xl space-y-16 px-6 sm:px-10">
              {featureModules.length > 0 ? (
                <PitchSection title="Marketing Features" large>
                  <p className="text-base leading-relaxed text-zinc-500">
                    Built-in UI modules ready to customize for your brand
                    campaign — no engineering required.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {featureModules.map((mod) => (
                      <FeaturePill
                        key={mod}
                        module={mod}
                        isLicensed={template.isLicensed}
                      />
                    ))}
                  </div>
                </PitchSection>
              ) : null}

              <PitchSection title="Technical Specifications" large>
                <dl className="divide-y divide-zinc-100 rounded-2xl border border-zinc-100 bg-zinc-50/50">
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <dt className="text-sm text-zinc-500">Template version</dt>
                    <dd className="font-mono text-sm font-medium text-zinc-900">
                      v{template.version}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <dt className="text-sm text-zinc-500">License tier</dt>
                    <dd className="text-sm font-medium text-zinc-900">{tierLabel}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <dt className="text-sm text-zinc-500">Template ID</dt>
                    <dd className="font-mono text-xs text-zinc-600">
                      {template.template_slug}
                    </dd>
                  </div>
                  {typeof manifest.demo_size_kb === "number" ? (
                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                      <dt className="text-sm text-zinc-500">Demo bundle size</dt>
                      <dd className="text-sm font-medium text-zinc-900">
                        {(manifest.demo_size_kb / 1024).toFixed(2)} MB
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </PitchSection>

              {!hasPitchContent && !demoUrl ? (
                <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center">
                  <p className="text-sm text-zinc-400">
                    No additional details available for this template.
                  </p>
                </div>
              ) : null}

              <div className="border-t border-zinc-100 pt-10">
                <AcquireCTA
                  template={template}
                  atLicenseCap={atLicenseCap}
                  onClose={onClose}
                />
              </div>
            </div>
          </section>
        </div>

      {editMode ? (
        <>
          <StorefrontRichTextToolbarDock
            editor={activeRichTextEditor}
            fieldLabel={activeRichTextField}
            visible={editMode && !loadingEditMeta}
          />

          <StorefrontEditMetadataPanel
            open={metadataPanelOpen}
            onClose={() => setMetadataPanelOpen(false)}
            templateSlug={templateSlug}
            tier={editDraft.tier}
            badgeType={editDraft.badgeType}
            onTierChange={(tier) =>
              setEditDraft((prev) => ({ ...prev, tier }))
            }
            onBadgeTypeChange={(badgeType) =>
              setEditDraft((prev) => ({ ...prev, badgeType }))
            }
            onTagsDirtyChange={setTagsDirty}
            onTagIdsChange={(tagIds) =>
              setEditDraft((prev) => ({ ...prev, tagIds }))
            }
          />

          <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-3 shadow-2xl sm:gap-4 sm:px-6">
          <button
            type="button"
            onClick={handleCancelEdit}
            disabled={saving}
            className="rounded-full px-4 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setMetadataPanelOpen((open) => !open)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              metadataPanelOpen
                ? "bg-white/15 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
            aria-expanded={metadataPanelOpen}
            aria-label="Template metadata"
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Metadata</span>
          </button>
          {adminReturnUrl ? (
            <Link
              href={adminReturnUrl}
              className="hidden rounded-full px-4 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:text-white sm:inline"
            >
              Back to admin
            </Link>
          ) : null}
          {showSaveSuccess ? (
            <span
              className="hidden text-xs font-medium text-emerald-400 sm:inline"
              role="status"
            >
              Saved
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSaveEdit()}
            disabled={saving || !isDirty}
            className="inline-flex min-w-[7rem] items-center justify-center gap-2 rounded-full bg-white px-5 py-1.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
        </>
      ) : null}
    </>
  );

  if (layout === "page") {
    return (
      <div
        role="main"
        aria-labelledby={titleId}
        className="relative isolate flex min-h-dvh w-full flex-col overflow-hidden bg-zinc-950"
      >
        {shellContent}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
      role="presentation"
      onClick={() => handleShellClose()}
    >
      <div
        className="absolute inset-0 bg-zinc-950/70 backdrop-blur-md"
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative isolate flex h-full w-full max-h-dvh flex-col overflow-hidden shadow-[0_48px_140px_-24px_rgba(0,0,0,0.55)] sm:h-[92vh] sm:w-[94vw] sm:max-w-7xl sm:rounded-2xl sm:border sm:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {shellContent}
      </div>
    </div>
  );
}
