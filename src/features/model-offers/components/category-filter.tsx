import Link from "next/link";
import type { PublicModelOfferFilterCategory } from "@/lib/model-offers/public.service";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  categories: ReadonlyArray<PublicModelOfferFilterCategory>;
  activeCategoryId?: string;
};

/**
 * Server-rendered chips row. Selection is encoded as `?categoryId=…` in the
 * URL — preserves SSR and clean back/forward navigation. The active chip uses
 * the brand primary color, inactive chips a soft card background.
 */
export function CategoryFilter({ categories, activeCategoryId }: Props) {
  if (categories.length === 0) return null;

  const allHref = "/models";
  const allActive = !activeCategoryId;

  return (
    <nav aria-label="Категории услуг" className="flex flex-wrap gap-2">
      <Link
        href={allHref}
        className={
          allActive
            ? "rounded-full bg-primary px-4 py-2 text-sm font-medium text-white"
            : "rounded-full border border-border-subtle bg-bg-card px-4 py-2 text-sm font-medium text-text-sec transition-colors hover:border-primary/30 hover:text-text-main"
        }
        aria-current={allActive ? "page" : undefined}
      >
        {UI_TEXT.models.list.categoryAll}
      </Link>
      {categories.map((cat) => {
        const isActive = cat.id === activeCategoryId;
        const href = isActive ? "/models" : `/models?categoryId=${encodeURIComponent(cat.id)}`;
        return (
          <Link
            key={cat.id}
            href={href}
            className={
              isActive
                ? "rounded-full bg-primary px-4 py-2 text-sm font-medium text-white"
                : "rounded-full border border-border-subtle bg-bg-card px-4 py-2 text-sm font-medium text-text-sec transition-colors hover:border-primary/30 hover:text-text-main"
            }
            aria-current={isActive ? "page" : undefined}
          >
            {cat.name}
          </Link>
        );
      })}
    </nav>
  );
}
