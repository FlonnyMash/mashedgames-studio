/**
 * Signals Electron that the dashboard UI has painted meaningful content so the
 * splash window can be dismissed without a blank/white handoff gap.
 */

let signaled = false;

export function notifyDesktopUiReady(): void {
  if (signaled || typeof window === "undefined") {
    return;
  }

  const ipc = window.electron?.ipcRenderer;
  if (!ipc) {
    return;
  }

  signaled = true;
  void ipc.invoke("app:ui-ready").catch(() => {
    // Main may have already closed splash via timeout — ignore.
  });
}
