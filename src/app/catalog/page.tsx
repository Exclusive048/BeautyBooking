import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-metadata";
import * as UI_TEXT from "@/lib/ui/text";
import { CatalogPage } from "@/features/catalog/pages/catalog-page";

export const metadata: Metadata = pageMetadata(UI_TEXT.meta.pages.catalog, { path: "/catalog" });

export default function CatalogRoutePage() {
  return <CatalogPage />;
}
