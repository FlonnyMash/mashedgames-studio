"use client";

import {
  AssetWorkspaceSaveError,
  saveAssetToWorkspace,
} from "@/lib/save-asset-to-workspace";
import { textureKeyForConfigField, type GameProjectManifest } from "@mashedgames/shared";

export type ImportAssetClientResult = {
  relativePath: string;
  absolutePath: string;
  textureKey: string | null;
  manifest?: GameProjectManifest;
};

function textureKeyForTargetPath(targetPath: string): string | null {
  return textureKeyForConfigField(targetPath);
}

type ImportAssetApiResponse = {
  ok?: boolean;
  error?: string;
  relativePath?: string;
  absolutePath?: string;
  textureKey?: string | null;
  manifest?: GameProjectManifest;
};

async function saveProjectAssetViaApi(input: {
  projectId: string;
  file: File;
  targetPath: string;
}): Promise<ImportAssetClientResult> {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("targetPath", input.targetPath);

  const response = await fetch(
    `/api/projects/${encodeURIComponent(input.projectId)}/import-asset`,
    { method: "POST", body: formData },
  );

  const data = (await response.json()) as ImportAssetApiResponse;

  if (!response.ok || !data.ok || !data.relativePath || !data.absolutePath) {
    throw new Error(data.error ?? "Failed to import asset.");
  }

  return {
    relativePath: data.relativePath,
    absolutePath: data.absolutePath,
    textureKey: data.textureKey ?? null,
    manifest: data.manifest,
  };
}

export async function saveProjectAssetWithFallback(input: {
  projectId: string;
  file: File;
  targetPath: string;
  type?: "image" | "audio";
}): Promise<ImportAssetClientResult> {
  const type = input.type ?? "image";

  if (window.electron?.ipcRenderer) {
    try {
      const saved = await saveAssetToWorkspace(input.projectId, input.file, type);
      return {
        relativePath: saved.relativePath,
        absolutePath: saved.absolutePath,
        textureKey: textureKeyForTargetPath(input.targetPath),
      };
    } catch (error) {
      if (!(error instanceof AssetWorkspaceSaveError)) {
        throw error;
      }
    }
  }

  return saveProjectAssetViaApi(input);
}
