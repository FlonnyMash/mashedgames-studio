"use client";

import { UnsavedChangesDialog } from "@/components/studio/UnsavedChangesDialog";
import { saveProjectClientNow } from "@/hooks/useSaveGameProject";
import { useWorkspaceSessionStore } from "@/lib/workspace-session-store";
import {
  discardConfiguratorUnsavedChanges,
  type UnsavedChangeItem,
} from "@/lib/template-unsaved-changes";
import { useConfiguratorStore } from "@mashedgames/configurator-engine";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ExitConfiguratorProjectButton() {
  const router = useRouter();
  const projectId = useConfiguratorStore((s) => s.projectId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!projectId) {
    return null;
  }

  const finishExit = () => {
    useWorkspaceSessionStore.getState().clearConfiguratorSession();
    useConfiguratorStore.getState().clearProject();
    setDialogOpen(false);
    router.replace("/configurator/projects");
  };

  const handleExit = () => {
    if (useConfiguratorStore.getState().hasUnsavedClient()) {
      setError(null);
      setDialogOpen(true);
      return;
    }
    finishExit();
  };

  const handleSaveAndExit = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveProjectClientNow(projectId);
      setSaving(false);
      finishExit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setSaving(false);
    }
  };

  const unsavedItems: UnsavedChangeItem[] = [
    {
      id: "configurator-client",
      kind: "game-control",
      label: "Client branding & project settings",
    },
  ];

  return (
    <>
      <button
        type="button"
        onClick={handleExit}
        disabled={saving}
        title="Return to the project list"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Exit project
      </button>

      <UnsavedChangesDialog
        open={dialogOpen}
        items={unsavedItems}
        saving={saving}
        error={error}
        description="Save client branding to disk before leaving, stay in this project, or leave without saving."
        primaryLabel="Save & exit"
        cancelLabel="Stay in project"
        discardLabel="Leave anyway"
        onPrimary={() => void handleSaveAndExit()}
        onDiscard={() => {
          if (!saving) {
            discardConfiguratorUnsavedChanges();
            finishExit();
          }
        }}
        onCancel={() => {
          if (!saving) {
            setDialogOpen(false);
          }
        }}
      />
    </>
  );
}
