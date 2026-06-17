"use client";

import { WorkspaceActionToolbar } from "@/components/shell/WorkspaceActionToolbar";
import { ExitStudioTemplateButton } from "@/components/studio/ExitStudioTemplateButton";
import { useStudioConfigStore } from "@mashedgames/studio-engine";
import { FlaskConical, Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

type BtnStatus = "idle" | "busy" | "error";

interface StudioToolsPanelProps {
  onSave: () => Promise<void>;
  onRevert: () => Promise<void>;
  onTestInConfigurator: () => Promise<void>;
}

export function StudioToolsPanel({
  onSave,
  onRevert,
  onTestInConfigurator,
}: StudioToolsPanelProps) {
  const selectedTemplateId = useStudioConfigStore(
    (state) => state.selectedTemplateId,
  );

  const [testStatus, setTestStatus] = useState<BtnStatus>("idle");
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSaveWithToast = useCallback(async () => {
    await onSave();
    toast.success("Template saved", {
      description: `"${selectedTemplateId}" config written to workspace.`,
    });
  }, [onSave, selectedTemplateId]);

  const handleTest = useCallback(async () => {
    if (testStatus === "busy") return;
    if (testTimerRef.current) clearTimeout(testTimerRef.current);
    setTestStatus("busy");
    try {
      await onTestInConfigurator();
      setTestStatus("idle");
    } catch {
      setTestStatus("error");
      testTimerRef.current = setTimeout(() => setTestStatus("idle"), 3000);
    }
  }, [onTestInConfigurator, testStatus]);

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-r border-zinc-200 bg-white">
      <header className="border-b border-zinc-200 px-6 py-5">
        <h2 className="text-lg font-semibold text-zinc-900">Workspace</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Flat template configuration</p>
      </header>

      {/* Unified action toolbar */}
      <div className="border-b border-zinc-200 px-6 py-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Actions
        </p>
        <div className="flex items-center justify-between">
          <WorkspaceActionToolbar
            onSave={handleSaveWithToast}
            onRevert={onRevert}
            /* Undo not yet wired — undo stub shows a toast via the toolbar's disabled state */
          />

          {/* Test in Configurator */}
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testStatus === "busy"}
            aria-label="Save template and open in Configurator for live testing"
            title="Test in Configurator"
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              testStatus === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
            }`}
          >
            {testStatus === "busy" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Opening…
              </>
            ) : testStatus === "error" ? (
              "Failed"
            ) : (
              <>
                <FlaskConical className="h-3.5 w-3.5" aria-hidden />
                Test
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
        <ExitStudioTemplateButton />
      </div>
    </aside>
  );
}
