"use client";

import { create } from "state";

type AsyncAction = () => Promise<void>;
type SyncAction = () => void;

interface WorkspaceActions {
  onSave: AsyncAction | null;
  onRevert: AsyncAction | null;
  onUndo: SyncAction | null;
  onRedo: SyncAction | null;
  onOpenFolder: AsyncAction | null;
  onOpenIde: AsyncAction | null;
  /** Studio-only: save template then open in configurator test mode. */
  onTestTemplate: AsyncAction | null;
}

interface MenuActionsStore extends WorkspaceActions {
  registerWorkspaceActions: (actions: Partial<WorkspaceActions>) => void;
  clearWorkspaceActions: () => void;
}

const emptyActions: WorkspaceActions = {
  onSave: null,
  onRevert: null,
  onUndo: null,
  onRedo: null,
  onOpenFolder: null,
  onOpenIde: null,
  onTestTemplate: null,
};

export const useMenuActionsStore = create<MenuActionsStore>((set) => ({
  ...emptyActions,
  registerWorkspaceActions: (actions) =>
    set((s) => ({ ...s, ...actions })),
  clearWorkspaceActions: () =>
    set((s) => ({ ...s, ...emptyActions })),
}));
