"use client";

import { inputClass } from "@/components/integrations/WebhookIntegrationPanel";
import { projectApiFetch } from "@/lib/project-api-client";
import {
  COUPON_MAX_USES_LIMIT,
  emptyCouponTierCounts,
  PRIZE_TIER_LABELS,
  PRIZE_TIER_VALUES,
  type CouponListItem,
  type CouponTierCounts,
  type PrizeTier,
} from "@mashedgames/shared";
import {
  AlertTriangle,
  Check,
  Loader2,
  Mail,
  Pencil,
  TicketPercent,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
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

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function BuiltInRewardsPanel({ gameId }: BuiltInRewardsPanelProps) {
  const [prizeTier, setPrizeTier] = useState<PrizeTier>(PRIZE_TIER_VALUES[0]);
  const [codesText, setCodesText] = useState("");
  const [maxUsesText, setMaxUsesText] = useState("1");
  const [counts, setCounts] = useState<CouponTierCounts>(
    emptyCouponTierCounts(),
  );
  const [coupons, setCoupons] = useState<CouponListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMaxUsesText, setEditMaxUsesText] = useState("1");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    const result = await projectApiFetch<{
      counts: CouponTierCounts;
      coupons: CouponListItem[];
    }>(`/api/games/${gameId}/coupons`);
    if (result.ok) {
      setCounts({ ...emptyCouponTierCounts(), ...result.counts });
      setCoupons(result.coupons);
    } else {
      toast.error("Could not load coupons", { description: result.error });
    }
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    void loadCoupons();
  }, [loadCoupons]);

  const parsedCodes = useMemo(() => parseCodes(codesText), [codesText]);
  const availableForTier = counts[prizeTier] ?? 0;
  const maxUses = Math.max(1, Math.floor(Number(maxUsesText) || 1));

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
      body: { prizeTier, codes, maxUses },
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
      void loadCoupons();
    } else {
      toast.error("Could not upload codes", { description: result.error });
    }
  }, [codesText, gameId, prizeTier, maxUses, loadCoupons]);

  const handleDelete = useCallback(
    async (couponId: string) => {
      setDeletingId(couponId);
      // Optimistically remove; restore on failure.
      const previous = coupons;
      setCoupons((prev) => prev.filter((c) => c.id !== couponId));

      const result = await projectApiFetch<Record<string, never>>(
        `/api/games/${gameId}/coupons/${couponId}`,
        { method: "DELETE" },
      );
      setDeletingId(null);

      if (result.ok) {
        toast.success("Code deleted.");
        void loadCoupons();
      } else {
        setCoupons(previous);
        toast.error("Could not delete code", { description: result.error });
      }
    },
    [coupons, gameId, loadCoupons],
  );

  const startEdit = useCallback((coupon: CouponListItem) => {
    setEditingId(coupon.id);
    setEditMaxUsesText(String(coupon.maxUses));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleUpdateMaxUses = useCallback(
    async (couponId: string) => {
      const nextMaxUses = Math.floor(Number(editMaxUsesText));
      if (!Number.isFinite(nextMaxUses) || nextMaxUses < 1) {
        toast.error("Max uses must be a whole number of at least 1.");
        return;
      }

      setUpdatingId(couponId);
      const result = await projectApiFetch<{ coupon: CouponListItem }>(
        `/api/games/${gameId}/coupons/${couponId}`,
        { method: "PATCH", body: { maxUses: nextMaxUses } },
      );
      setUpdatingId(null);

      if (result.ok) {
        setCoupons((prev) =>
          prev.map((c) => (c.id === couponId ? result.coupon : c)),
        );
        setEditingId(null);
        toast.success("Max uses updated.");
        void loadCoupons();
      } else {
        toast.error("Could not update code", { description: result.error });
      }
    },
    [editMaxUsesText, gameId, loadCoupons],
  );

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-xs text-indigo-700">
        <TicketPercent className="mt-px h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
        <p>
          Paste your discount codes below and we&apos;ll hand one out to each
          winner automatically. No coding or CRM required.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber-500" aria-hidden />
        <p>
          <span className="font-semibold">Important:</span> Ensure the discount
          codes you upload here remain valid in your shop system (e.g., Shopify,
          WooCommerce) for the entire duration of your advergaming campaign.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600">
        <Mail className="mt-px h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
        <p>
          <span className="font-semibold text-zinc-700">Note:</span> This
          built-in system only delivers the reward to the player. If you want to
          automatically subscribe these captured emails to your own newsletter
          (like Mailchimp or Klaviyo), you must ALSO configure an endpoint in the{" "}
          <span className="font-semibold text-zinc-700">
            &lsquo;Advanced Webhooks&rsquo;
          </span>{" "}
          tab.
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
          {loading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking availability...
            </>
          ) : (
            <>
              <span className="font-semibold text-zinc-700">
                {availableForTier}
              </span>{" "}
              code{availableForTier === 1 ? "" : "s"} available for this tier
            </>
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="rewards-max-uses" className={labelClass}>
          Max Uses per Code
        </label>
        <input
          id="rewards-max-uses"
          type="number"
          min={1}
          step={1}
          value={maxUsesText}
          onChange={(event) => setMaxUsesText(event.target.value)}
          onBlur={() => setMaxUsesText(String(maxUses))}
          disabled={uploading}
          className={inputClass}
        />
        <p className="text-xs text-zinc-500">
          How many winners can redeem each code. Use{" "}
          <span className="font-semibold text-zinc-700">1</span> for
          single-use codes.
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

      <div className="space-y-2 border-t border-zinc-100 pt-4">
        <p className={labelClass}>Uploaded Codes</p>
        <div className="overflow-hidden rounded-lg border border-zinc-100">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Prize Tier</th>
                <th className="px-3 py-2 font-medium">Uses</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-zinc-400"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading codes...
                    </span>
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-zinc-400"
                  >
                    No codes uploaded yet.
                  </td>
                </tr>
              ) : (
                coupons.map((coupon) => {
                  const exhausted = coupon.currentUses >= coupon.maxUses;
                  const isEditing = editingId === coupon.id;
                  const isUpdating = updatingId === coupon.id;
                  const isDeleting = deletingId === coupon.id;
                  const rowBusy = isUpdating || isDeleting;
                  return (
                    <tr key={coupon.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2 font-mono text-xs text-zinc-800">
                        {coupon.code}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">
                        {PRIZE_TIER_LABELS[coupon.prizeTier]}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-500">
                              {coupon.currentUses} /
                            </span>
                            <input
                              type="number"
                              min={coupon.currentUses || 1}
                              max={COUPON_MAX_USES_LIMIT}
                              step={1}
                              value={editMaxUsesText}
                              onChange={(event) =>
                                setEditMaxUsesText(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  void handleUpdateMaxUses(coupon.id);
                                } else if (event.key === "Escape") {
                                  cancelEdit();
                                }
                              }}
                              disabled={isUpdating}
                              autoFocus
                              aria-label={`Max uses for code ${coupon.code}`}
                              className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                            />
                          </div>
                        ) : (
                          <span
                            className={
                              exhausted
                                ? "font-medium text-amber-600"
                                : "text-zinc-600"
                            }
                          >
                            {coupon.currentUses} / {coupon.maxUses}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {formatDateTime(coupon.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => void handleUpdateMaxUses(coupon.id)}
                              disabled={isUpdating}
                              className="rounded p-1 text-emerald-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
                              aria-label="Save max uses"
                            >
                              {isUpdating ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={isUpdating}
                              className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
                              aria-label="Cancel editing"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(coupon)}
                              disabled={rowBusy}
                              className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
                              aria-label={`Edit max uses for code ${coupon.code}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(coupon.id)}
                              disabled={rowBusy}
                              className="rounded p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              aria-label={`Delete code ${coupon.code}`}
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
