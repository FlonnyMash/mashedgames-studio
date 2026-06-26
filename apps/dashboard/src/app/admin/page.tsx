import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { LicenseProvisioningForm } from "@/components/admin/LicenseProvisioningForm";
import { PublishTemplatePanel } from "@/components/admin/PublishTemplatePanel";
import { RoleGate } from "@/components/auth/RoleGate";

export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-zinc-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Studio-admin tools — changes here affect all client organisations.
        </p>
      </div>

      <RoleGate allow="studio_admin">
        <div className="flex flex-col gap-8">
          <PublishTemplatePanel />
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4">
            <p className="text-sm text-zinc-600">
              Manage global storefront tags in the{" "}
              <Link href="/admin/tags" className="font-medium text-zinc-900 underline">
                Tag Manager
              </Link>
              .
            </p>
          </div>
          <LicenseProvisioningForm />
        </div>
      </RoleGate>

      {/* Fallback for non-admins who reach this URL directly */}
      <noscript>
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-500">
          <ShieldAlert className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
          <span>Admin access is restricted to Studio Admins.</span>
        </div>
      </noscript>
    </div>
  );
}
