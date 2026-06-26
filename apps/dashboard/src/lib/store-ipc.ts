type AcquireLicenseResult =
  | { ok: true; licenseId?: string; alreadyOwned?: boolean }
  | { ok: false; error: string };

type ClaimGameResult =
  | { ok: true; game?: { id: string; slug: string } }
  | { ok: false; error: string };

function getElectron() {
  return window.electron?.ipcRenderer ?? null;
}

function isMissingIpcHandlerError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return (
    msg.includes("No handler registered for") || msg.includes("IPC channel not allowed")
  );
}

/**
 * Acquires a free template license via the Electron main process.
 * Returns null when called outside the Electron runtime (web dev context).
 */
export async function acquireLicenseViaIpc(
  templateId: string,
): Promise<AcquireLicenseResult | null> {
  const electron = getElectron();
  if (!electron) return null;
  try {
    return (await electron.invoke("store:acquire-license", {
      template_id: templateId,
    })) as AcquireLicenseResult;
  } catch (err) {
    if (isMissingIpcHandlerError(err)) return null;
    throw err;
  }
}

/**
 * Claims a template game via the Electron main process.
 * Returns null when called outside the Electron runtime (web dev context).
 */
export async function claimGameViaIpc(
  templateId: string,
  templateSlug: string,
): Promise<ClaimGameResult | null> {
  const electron = getElectron();
  if (!electron) return null;
  try {
    return (await electron.invoke("store:claim-game", {
      template_id: templateId,
      template_slug: templateSlug,
    })) as ClaimGameResult;
  } catch (err) {
    if (isMissingIpcHandlerError(err)) return null;
    throw err;
  }
}
