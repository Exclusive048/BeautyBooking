import type { Metadata } from "next";
import { CatalogPage } from "@/features/catalog/pages/catalog-page";

export const metadata: Metadata = {
  title: "Мастера красоты — МастерРядом",
  description: "Выбери мастера по отзывам, фото и расписанию. Запись онлайн.",
};

export default function CatalogRoutePage() {
  return <CatalogPage />;
}
