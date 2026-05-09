import Link from "next/link";
import { ChevronRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MasterProfileViewData } from "@/lib/master/profile-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { formatMinutes, formatRubles } from "../lib/format";
import { SectionShell } from "./section-shell";

const T = UI_TEXT.cabinetMaster.profile.services;

type Props = {
  data: MasterProfileViewData["services"];
};

/**
 * Read-only mini view: accordion of categories. Native `<details>` so
 * we don't pull in any state — the section is glued to the dedicated
 * services management surface (31b backlog).
 */
export function ServicesReadonlySection({ data }: Props) {
  const subtitle =
    data.totalCount === 0
      ? T.subtitleEmpty
      : data.categories.length === 1
        ? T.subtitleSingleCategory.replace("{count}", String(data.totalCount))
        : T.subtitleTemplate
            .replace("{count}", String(data.totalCount))
            .replace("{categories}", String(data.categories.length));

  const actions = (
    <Button asChild variant="ghost" size="sm">
      <Link href="/cabinet/master/services">{T.manageCta} →</Link>
    </Button>
  );

  return (
    <SectionShell
      anchor="services"
      icon={Layers}
      title={T.title}
      subtitle={subtitle}
      actions={actions}
    >
      {data.totalCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-card/60 p-6 text-center">
          <p className="font-display text-base text-text-main">{T.emptyTitle}</p>
          <p className="mt-1 text-sm text-text-sec">{T.emptyBody}</p>
          <Button asChild variant="primary" size="sm" className="mt-4">
            <Link href="/cabinet/master/services">{T.emptyCta}</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.categories.map((category) => (
            <li key={category.id ?? "uncategorised"}>
              <details className="group rounded-xl bg-bg-input/40 open:bg-bg-input/70">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-bg-input">
                  <ChevronRight
                    className="h-4 w-4 text-text-sec transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                  <span className="flex-1 text-sm font-medium text-text-main">
                    {category.name}
                  </span>
                  <span className="font-mono text-xs text-text-sec">
                    {category.services.length}
                  </span>
                </summary>
                <ul className="ml-8 space-y-1 px-3 pb-3 pt-1">
                  {category.services.map((service) => (
                    <li
                      key={service.id}
                      className="flex items-center gap-3 py-1 text-sm"
                    >
                      <span className="flex-1 truncate text-text-main">{service.title}</span>
                      <span className="font-mono text-xs text-text-sec">
                        {formatMinutes(service.durationMin)}
                      </span>
                      <span className="font-mono text-sm font-medium text-text-main">
                        {formatRubles(service.price)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}
