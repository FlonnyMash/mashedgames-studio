"use client";

import { projectApiFetch } from "@/lib/project-api-client";
import { Check, Copy, Eye, EyeOff, Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface WebhookIntegrationPanelProps {
  /** public.games id whose webhook settings are being edited. */
  gameId: string;
}

type WebhookResponse = {
  webhookUrl: string | null;
  webhookSecret: string;
};

export const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 disabled:opacity-50";
const labelClass =
  "text-[11px] font-medium uppercase tracking-wider text-zinc-400";

export function WebhookIntegrationPanel({ gameId }: WebhookIntegrationPanelProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [revealSecret, setRevealSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await projectApiFetch<WebhookResponse>(
      `/api/games/${gameId}/webhook`,
    );
    if (result.ok) {
      setWebhookUrl(result.webhookUrl ?? "");
      setSavedUrl(result.webhookUrl ?? null);
      setSecret(result.webhookSecret);
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = (savedUrl ?? "") !== webhookUrl.trim();

  const handleSave = useCallback(async () => {
    setSaving(true);
    const result = await projectApiFetch<WebhookResponse>(
      `/api/games/${gameId}/webhook`,
      { method: "PATCH", body: { webhookUrl: webhookUrl.trim() } },
    );
    setSaving(false);
    if (result.ok) {
      setSavedUrl(result.webhookUrl ?? null);
      setWebhookUrl(result.webhookUrl ?? "");
      toast.success("Webhook URL saved.");
    } else {
      toast.error("Could not save webhook URL", { description: result.error });
    }
  }, [gameId, webhookUrl]);

  const handleCopySecret = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy secret to clipboard.");
    }
  }, [secret]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    toast.loading("Sending test payload...", { id: "webhook-test" });
    const result = await projectApiFetch<{ status?: number; delivered?: boolean }>(
      `/api/games/${gameId}/webhook/test`,
      { method: "POST" },
    );
    setTesting(false);
    if (result.ok) {
      toast.success("Test payload delivered", {
        id: "webhook-test",
        description: `Endpoint responded ${result.status ?? 200}.`,
      });
    } else {
      toast.error("Test payload failed", {
        id: "webhook-test",
        description: result.error,
      });
    }
  }, [gameId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading integration settings...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {loadError}
      </div>
    );
  }

  const maskedSecret = revealSecret ? secret : "•".repeat(Math.min(secret.length, 40));

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-zinc-900">Lead Webhook</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Forward captured leads to your CRM. When set, we bypass internal
          handling and POST a signed <code className="text-[11px]">lead.captured</code> event.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="webhook-url">
          Webhook URL
        </label>
        <input
          id="webhook-url"
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://your-crm.example.com/hooks/mashedgames"
          className={inputClass}
          disabled={saving}
        />
        <p className="text-xs text-zinc-500">
          Enter the endpoint URL provided by your destination system (e.g.,
          Zapier, Make.com, Klaviyo, or your custom CRM). This is where we will
          send the POST request when a lead is captured.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? "Saving..." : "Save URL"}
          </button>
          {!dirty && savedUrl ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>
          Webhook Secret — Auto-generated by Mashed Games
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700">
            {maskedSecret}
          </code>
          <button
            type="button"
            onClick={() => setRevealSecret((v) => !v)}
            className="rounded-lg border border-zinc-200 p-2 text-zinc-500 transition hover:bg-zinc-50"
            aria-label={revealSecret ? "Hide secret" : "Reveal secret"}
          >
            {revealSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleCopySecret}
            className="rounded-lg border border-zinc-200 p-2 text-zinc-500 transition hover:bg-zinc-50"
            aria-label="Copy secret"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Use this signature to cryptographically verify that incoming webhooks
          originated from our servers (HMAC SHA-256).
        </p>
      </div>

      <div className="border-t border-zinc-100 pt-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !savedUrl}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-40"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send Test Payload
        </button>
        {!savedUrl ? (
          <p className="mt-1.5 text-[11px] text-zinc-400">
            Save a webhook URL to enable test delivery.
          </p>
        ) : null}
      </div>
    </div>
  );
}
