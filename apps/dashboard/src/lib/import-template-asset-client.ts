"use client";

import {
  textureKeyForConfigField,
  type GameConfig,
} from "@mashedgames/shared";

export type ImportTemplateAssetResult = {
  relativePath: string;
  absolutePath: string;
  textureKey: string | null;
  config?: GameConfig;
};

type ImportTemplateAssetApiResponse = {
  ok?: boolean;
  error?: string;
  relativePath?: string;
  absolutePath?: string;
  textureKey?: string | null;
  config?: GameConfig;
};

export async function saveTemplateAssetWithFallback(input: {
  templateId: string;
  file: File;
  targetPath: string;
}): Promise<ImportTemplateAssetResult> {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("targetPath", input.targetPath);

  const response = await fetch(
    `/api/templates/${encodeURIComponent(input.templateId)}/import-asset`,
    { method: "POST", body: formData },
  );

  const data = (await response.json()) as ImportTemplateAssetApiResponse;

  if (!response.ok || !data.ok || !data.relativePath || !data.absolutePath) {
    throw new Error(data.error ?? "Failed to import template asset.");
  }

  return {
    relativePath: data.relativePath,
    absolutePath: data.absolutePath,
    textureKey: data.textureKey ?? textureKeyForConfigField(input.targetPath),
    config: data.config,
  };
}
