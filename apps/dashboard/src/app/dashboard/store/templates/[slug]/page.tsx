import { Suspense } from "react";
import { StoreTemplateDetailPage } from "./StoreTemplateDetailPage";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function DetailFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true">
      <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-200" />
    </div>
  );
}

export default async function TemplateDetailRoute({ params }: PageProps) {
  const { slug } = await params;

  return (
    <Suspense fallback={<DetailFallback />}>
      <StoreTemplateDetailPage slug={slug} />
    </Suspense>
  );
}
