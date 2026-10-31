import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CabinetAnnouncement } from "@/lib/cabinet-insights/announcements";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { HomeSection } from "./home-section";

const T = UI_TEXT.cabinetHome.announcements;

/**
 * «Новое в МастерРядом» (AI-CABINET-ANALYSIS): настоящие изменения продукта с
 * датой выхода, а не заглушки — список ведётся в `lib/cabinet-insights/announcements.ts`.
 * Дата — дата выпуска, без времени, поэтому пояс не нужен (`UI_FMT.dateKey`).
 */
export function AnnouncementsSection({ items }: { items: CabinetAnnouncement[] }) {
  if (items.length === 0) return null;
  return (
    <HomeSection title={T.title} subtitle={T.subtitle} testId="cabinet-home-announcements">
      <ul className="divide-y divide-border-subtle">
        {items.map((item) => (
          <li key={item.id} data-announcement-id={item.id} className="py-3 first:pt-0 last:pb-0">
            <p className="eyebrow">{UI_FMT.dateKey(item.publishedOn, "dayMonthLong")}</p>
            <p className="mt-1 text-sm font-medium text-text-main">{item.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-text-sec">{item.text}</p>
            {item.action ? (
              <Link
                href={item.action.href}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {item.action.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
