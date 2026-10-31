import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";
import type { CabinetTip } from "@/lib/cabinet-insights/types";
import * as UI_TEXT from "@/lib/ui/text";
import { HomeSection } from "./home-section";

const T = UI_TEXT.cabinetHome.tips;

/**
 * Советы на главной кабинета (AI-CABINET-ANALYSIS): правила по данным кабинета
 * (`lib/cabinet-insights/tips.ts`), каждый ведёт туда, где это правится.
 */
export function TipsSection({ tips }: { tips: CabinetTip[] }) {
  return (
    <HomeSection title={T.title} subtitle={T.subtitle} testId="cabinet-home-tips">
      {tips.length === 0 ? (
        <p className="text-sm text-text-sec">{T.empty}</p>
      ) : (
        <ul className="space-y-3">
          {tips.map((tip) => (
            <li
              key={tip.id}
              data-tip-id={tip.id}
              className="flex gap-3 rounded-xl border border-border-subtle bg-bg-page p-3"
            >
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-accent-text"
              >
                <Lightbulb className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-main">{tip.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-sec">{tip.text}</p>
                <Link
                  href={tip.action.href}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {tip.action.label}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </HomeSection>
  );
}
