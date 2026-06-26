import { StorePageContent } from "./StorePageContent";
import { parseStorefrontPageSearchParams } from "@/lib/storefront-search-params";

export const dynamic = "force-dynamic";

type StorePageProps = {
  searchParams: Promise<{
    tag?: string | string[];
    search?: string;
    sort?: string;
  }>;
};

export default async function StorePage({ searchParams }: StorePageProps) {
  const params = await searchParams;
  const { initialSearch, initialSort } = parseStorefrontPageSearchParams(params);

  return (
    <StorePageContent
      initialSearch={initialSearch}
      initialSort={initialSort}
    />
  );
}
