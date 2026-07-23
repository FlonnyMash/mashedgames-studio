"use client";

import { inputClass } from "@/components/integrations/WebhookIntegrationPanel";
import { projectApiFetch } from "@/lib/project-api-client";
import {
  emptyCouponTierCounts,
  PRIZE_TIER_LABELS,
  PRIZE_TIER_VALUES,
  type CouponTierCounts,
  type PrizeTier,
} from "@mashedgames/shared";
import { Loader2, TicketPercent, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface BuiltInRewardsPanelProps {
  /** public.games id whose coupon pools are being managed. */
  gameId: string;
}

const labelClass =
  "text-[11px] font-medium uppercase tracking-wider text-zinc-400";

function parseCodes(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function BuiltInRewardsPanel({ gameId }: BuiltInRewardsPanelProps) {
  const [prizeTier, setPrizeTier] = useState<PrizeTier>(PRIZE_TIER_VALUES[0]);
  const [codesText, setCodesText] = useState("");
  const [counts, setCounts] = useState<CouponTierCounts>(
    emptyCouponTierCounts(),
  );
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    const result = await projectApiFetch<{ counts: CouponTierCounts }>(
      `/api/games/${gameId}/coupons`,
    );
    if (result.ok) {
      setCounts({ ...emptyCouponTierCounts(), ...result.counts });
    } else {
      toast.error("Could not load coupon stats", { description: result.error });
    }
    setLoadingCounts(false);
  }, [gameId]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const parsedCodes = useMemo(() => parseCodes(codesText), [codesText]);
  const availableForTier = counts[prizeTier] ?? 0;

  const handleUpload = useCallback(async () => {
    const codes = parseCodes(codesText);
    if (codes.length === 0) {
      toast.error("Paste at least one code (one per line).");
      return;
    }

    setUploading(true);
    const result = await projectApiFetch<{
      inserted: number;
      skippedDuplicates: number;
    }>(`/api/games/${gameId}/coupons`, {
      method: "POST",
      body: { prizeTier, codes },
    });
    setUploading(false);

    if (result.ok) {
      const skipped = result.skippedDuplicates
        ? ` (${result.skippedDuplicates} duplicate${
            result.skippedDuplicates === 1 ? "" : "s"
          } skipped)`
        : "";
      toast.success(
        `Uploaded ${result.inserted} code${
          result.inserted === 1 ? "" : "s"
        }${skipped}.`,
      );
      setCodesText("");
      void loadCounts();
    } else {
      toast.error("Could not upload codes", { description: result.error });
    }
  }, [codesText, gameId, prizeTier, loadCounts]);

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-xs text-indigo-700">
        <TicketPercent className="mt-px h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
        <p>
          Paste your discount codes below and we&apos;ll hand one out to each
          winner automatically. No coding or CRM required.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="rewards-tier" className={labelClass}>
          Prize Tier
        </label>
        <select
          id="rewards-tier"
          value={prizeTier}
          onChange={(event) => setPrizeTier(event.target.value as PrizeTier)}
          disabled={uploading}
          className={inputClass}
        >
          {PRIZE_TIER_VALUES.map((tier) => (
            <option key={tier} value={tier}>
              {PRIZE_TIER_LABELS[tier]}
            </option>
          ))}
        </select>
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          {loadingCounts ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking availability...
            </>
          ) : (
            <>
              <span className="font-semibold text-zinc-700">
                {availableForTier}
              </span>{" "}
              unused code{availableForTier === 1 ? "" : "s"} available for this
              tier
            </>
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="rewards-codes" className={labelClass}>
          Discount Codes
        </label>
        <textarea
          id="rewards-codes"
          value={codesText}
          onChange={(event) => setCodesText(event.target.value)}
          disabled={uploading}
          rows={8}
          placeholder={"SAVE10\nWELCOME20\nVIP-2K7F...\nOne code per line"}
          className={`${inputClass} resize-y font-mono`}
        />
        <p className="text-xs text-zinc-500">
          {parsedCodes.length} code{parsedCodes.length === 1 ? "" : "s"} ready to
          upload.
        </p>
      </div>

      <button
        type="button"
        onClick={handleUpload}
        disabled={uploading || parsedCodes.length === 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <UploadCloud className="h-4 w-4" />
            Upload Codes
          </>
        )}
      </button>
    </div>
  );
}
