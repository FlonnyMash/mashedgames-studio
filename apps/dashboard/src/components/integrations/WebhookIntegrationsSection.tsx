"use client";

import { BuiltInRewardsPanel } from "@/components/integrations/BuiltInRewardsPanel";
import {
  inputClass,
  WebhookIntegrationPanel,
} from "@/components/integrations/WebhookIntegrationPanel";
import { WebhookHelpDialog } from "@/components/integrations/WebhookHelpDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfiguratorStore } from "@mashedgames/configurator-engine";
import { Lock } from "lucide-react";

/**
 * Lead Capture & Rewards section. Both surfaces (built-in coupon rewards and
 * advanced webhooks) live on the project's `public.games` row, so this is
 * scoped strictly to the currently open project: it unlocks only once the
 * project has a Supabase `gameId` (minted on deploy).
 */
export function WebhookIntegrationsSection() {
  const gameId = useConfiguratorStore((s) => s.projectManifest?.gameId ?? null);

  return (
    <section className="space-y-3">
      <div>
        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Lead Capture & Rewards
        </p>
        <p className="text-xs text-zinc-500">
          Reward your players with discount codes automatically, or connect your
          own CRM via signed webhooks.
        </p>
      </div>

      {gameId ? (
        <Tabs defaultValue="built-in" className="space-y-3">
          <TabsList className="w-full">
            <TabsTrigger value="built-in" className="flex-1">
              Built-in System (Easy)
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="flex-1">
              Advanced Webhooks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="built-in">
            <BuiltInRewardsPanel key={`rewards-${gameId}`} gameId={gameId} />
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-3">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                Developer / Integrations
              </p>
              <WebhookHelpDialog />
            </div>
            <WebhookIntegrationPanel key={`webhook-${gameId}`} gameId={gameId} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <Lock className="mt-px h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <p>
              Lead capture &amp; rewards require an active database connection.
              Please Deploy your game to Cloudflare first to unlock coupon
              uploads and webhook endpoints.
            </p>
          </div>
          <input
            type="url"
            disabled
            aria-disabled
            placeholder="https://your-crm.example.com/hooks/mashedgames"
            className={inputClass}
          />
        </div>
      )}
    </section>
  );
}
