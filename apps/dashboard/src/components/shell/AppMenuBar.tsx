"use client";

import { projectFetch } from "@/lib/project-api-client";
import { useMenuActionsStore } from "@/lib/menu-actions-store";
import { STUDIO_MODE_ENABLED } from "@/lib/studio-mode";
import { useWorkspaceSessionStore } from "@/lib/workspace-session-store";
import { TutorialDrawer } from "@/components/shell/TutorialDrawer";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Dropdown primitive
// ---------------------------------------------------------------------------

interface MenuItem {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  separator?: boolean; // renders a rule BEFORE this item
}

function MenuDropdown({
  label,
  items,
}: {
  label: string;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`rounded px-2.5 py-0.5 text-xs font-medium transition-colors ${
          open
            ? "bg-zinc-200/80 text-zinc-900"
            : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
        }`}
      >
        {label}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-0.5 min-w-[220px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
        >
          {items.map((item, i) =>
            item.separator ? (
              <hr key={`sep-${i}`} className="my-1 border-zinc-100" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className="flex w-full items-center justify-between gap-8 px-4 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>{item.label}</span>
                {item.shortcut ? (
                  <span className="text-[10px] text-zinc-400">
                    {item.shortcut}
                  </span>
                ) : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppMenuBar
// ---------------------------------------------------------------------------

/** Thin native-style desktop menu bar mounted at the top of AppShell. */
export function AppMenuBar() {
  const router = useRouter();
  const pathname = usePathname();
  const actions = useMenuActionsStore();

  const isStudio = pathname.startsWith("/studio");
  const isConfigurator = pathname.startsWith("/configurator");
  const isWorkspace = isStudio || isConfigurator;

  // Tutorial drawer state
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [parentTemplateId, setParentTemplateId] = useState<string | null>(null);
  const activeConfiguratorProjectId = useWorkspaceSessionStore(
    (s) => s.activeConfiguratorProjectId,
  );

  // Resolve parent template ID from the active project whenever we're in the configurator
  useEffect(() => {
    if (!isConfigurator || !activeConfiguratorProjectId) {
      setParentTemplateId(null);
      return;
    }
    let cancelled = false;
    projectFetch(`/api/projects/${encodeURIComponent(activeConfiguratorProjectId)}`)
      .then((res) => res.json())
      .then((data: { ok?: boolean; manifest?: { parentTemplateId?: string } }) => {
        if (!cancelled && data.ok && data.manifest?.parentTemplateId) {
          setParentTemplateId(data.manifest.parentTemplateId);
        }
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [isConfigurator, activeConfiguratorProjectId]);

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!actions.onSave) {
      toast.info("No active workspace to save.");
      return;
    }
    try {
      await actions.onSave();
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    }
  }, [actions]);

  // -------------------------------------------------------------------------
  // Revert
  // -------------------------------------------------------------------------
  const handleRevert = useCallback(async () => {
    if (!actions.onRevert) {
      toast.info("No active workspace to revert.");
      return;
    }
    try {
      await actions.onRevert();
      toast.info("Reverted to last saved state.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revert failed.");
    }
  }, [actions]);

  // -------------------------------------------------------------------------
  // Undo / Redo
  // -------------------------------------------------------------------------
  const handleUndo = useCallback(() => {
    if (actions.onUndo) {
      actions.onUndo();
    } else {
      toast.info("Undo is not yet available.", {
        description:
          "Full undo/redo history requires the Zustand undoable middleware — coming in a future update.",
      });
    }
  }, [actions]);

  const handleRedo = useCallback(() => {
    if (actions.onRedo) {
      actions.onRedo();
    } else {
      toast.info("Redo is not yet available.", {
        description:
          "Full undo/redo history requires the Zustand undoable middleware — coming in a future update.",
      });
    }
  }, [actions]);

  // -------------------------------------------------------------------------
  // Open folder / IDE
  // -------------------------------------------------------------------------
  const handleOpenFolder = useCallback(async () => {
    if (!actions.onOpenFolder) return;
    try {
      await actions.onOpenFolder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open folder.");
    }
  }, [actions]);

  const handleOpenIde = useCallback(async () => {
    if (!actions.onOpenIde) return;
    try {
      await actions.onOpenIde();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open IDE.");
    }
  }, [actions]);

  // -------------------------------------------------------------------------
  // Test template (studio-only)
  // -------------------------------------------------------------------------
  const handleTestTemplate = useCallback(async () => {
    if (!actions.onTestTemplate) return;
    try {
      await actions.onTestTemplate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed.");
    }
  }, [actions]);

  // -------------------------------------------------------------------------
  // Exit
  // -------------------------------------------------------------------------
  const handleExit = useCallback(() => {
    if (isStudio) {
      useWorkspaceSessionStore.getState().clearStudioSession();
      router.replace("/studio/templates");
    } else if (isConfigurator) {
      useWorkspaceSessionStore.getState().clearConfiguratorSession();
      router.replace("/configurator/projects");
    }
  }, [isConfigurator, isStudio, router]);

  // -------------------------------------------------------------------------
  // Global keyboard shortcuts
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
      if (mod && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
      if (mod && e.key === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, handleUndo, handleRedo]);

  // -------------------------------------------------------------------------
  // Menu definitions
  // -------------------------------------------------------------------------
  const fileItems: MenuItem[] = [
    {
      label: "Save",
      shortcut: "Ctrl+S",
      onClick: () => void handleSave(),
      disabled: !isWorkspace,
    },
    {
      label: "Revert to Saved",
      onClick: () => void handleRevert(),
      disabled: !isWorkspace || !actions.onRevert,
    },
    {
      label: "Open Project Folder",
      onClick: () => void handleOpenFolder(),
      disabled: !actions.onOpenFolder,
      separator: true,
    },
    {
      label: "Exit",
      onClick: handleExit,
      disabled: !isWorkspace,
      separator: true,
    },
  ];

  const editItems: MenuItem[] = [
    {
      label: "Undo",
      shortcut: "Ctrl+Z",
      onClick: handleUndo,
      disabled: !isWorkspace,
    },
    {
      label: "Redo",
      shortcut: "Ctrl+Y",
      onClick: handleRedo,
      disabled: !isWorkspace,
    },
  ];

  const devItems: MenuItem[] = [
    {
      label: "Open in IDE",
      onClick: () => void handleOpenIde(),
      disabled: !actions.onOpenIde,
    },
    ...(STUDIO_MODE_ENABLED && isStudio
      ? ([
          {
            label: "Test Template in Configurator",
            onClick: () => void handleTestTemplate(),
            disabled: !actions.onTestTemplate,
            separator: true,
          },
        ] satisfies MenuItem[])
      : []),
  ];

  const helpItems: MenuItem[] = [
    {
      label: "Tutorial",
      onClick: () => setTutorialOpen(true),
      disabled: !isConfigurator || !parentTemplateId,
    },
  ];

  return (
    <>
      <div className="flex shrink-0 items-center gap-0.5 border-b border-zinc-200 bg-zinc-50 px-2 py-0.5">
        <MenuDropdown label="File" items={fileItems} />
        <MenuDropdown label="Edit" items={editItems} />
        {(isWorkspace || STUDIO_MODE_ENABLED) ? (
          <MenuDropdown label="Developer" items={devItems} />
        ) : null}
        {isWorkspace ? (
          <MenuDropdown label="Help" items={helpItems} />
        ) : null}
      </div>

      <TutorialDrawer
        templateId={parentTemplateId}
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
      />
    </>
  );
}
