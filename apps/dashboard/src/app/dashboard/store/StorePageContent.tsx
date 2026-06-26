"use client";

import { Suspense } from "react";
import { TemplateStorefront } from "@/components/store/TemplateStorefront";
import { StorefrontHowItWorksDialog } from "@/components/store/StorefrontHowItWorksDialog";
import type { StorefrontSortOption } from "@/components/store/storefront-types";
import Link from "next/link";

type StorePageContentProps = {
  initialSearch: string;
  initialSort: StorefrontSortOption;
};

function StorefrontFallback() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading store">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-zinc-100" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
        <div className="hidden h-64 animate-pulse rounded-xl bg-zinc-100 lg:block" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100"
            />
          ))}
        </div>
        <div className="hidden space-y-4 lg:block">
          <div className="h-48 animate-pulse rounded-xl bg-zinc-100" />
          <div className="h-40 animate-pulse rounded-xl bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}

function StorePageHeader() {
  return (
    <header className="mb-8">
      <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-800">
        ← Home
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Game Templates</h1>
        <StorefrontHowItWorksDialog />
      </div>
    </header>
  );
}

export function StorePageContent({
  initialSearch,
  initialSort,
}: StorePageContentProps) {
  return (
    <div className="mx-auto w-full max-w-[1920px] flex-1 overflow-y-auto px-6 py-8 lg:px-12">
      <StorePageHeader />

      <Suspense fallback={<StorefrontFallback />}>
        <TemplateStorefront
          initialSearch={initialSearch}
          initialSort={initialSort}
        />
      </Suspense>
    </div>
  );
}
