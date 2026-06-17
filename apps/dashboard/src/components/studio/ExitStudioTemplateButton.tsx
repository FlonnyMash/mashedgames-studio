"use client";

import { useWorkspaceSessionStore } from "@/lib/workspace-session-store";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function ExitStudioTemplateButton() {
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          useWorkspaceSessionStore.getState().clearStudioSession();
          router.replace("/studio/templates");
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        <LogOut className="h-4 w-4 shrink-0" aria-hidden />
        Exit template
      </button>
      <p className="text-center text-xs text-zinc-500">
        Return to the template list.
      </p>
    </>
  );
}
