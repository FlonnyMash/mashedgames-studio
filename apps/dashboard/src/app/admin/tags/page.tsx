import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TagManagerPanel } from "@/components/admin/TagManagerPanel";
import { RoleGate } from "@/components/auth/RoleGate";

export default function AdminTagsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-6 py-10">
      <div className="mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Admin
        </Link>
      </div>

      <RoleGate allow="studio_admin">
        <TagManagerPanel />
      </RoleGate>
    </div>
  );
}
