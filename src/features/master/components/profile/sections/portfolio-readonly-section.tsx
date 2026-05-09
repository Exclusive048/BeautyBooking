/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Camera, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { MasterProfileViewData } from "@/lib/master/profile-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { SectionShell } from "./section-shell";

const T = UI_TEXT.cabinetMaster.profile.portfolio;

type Props = {
  data: MasterProfileViewData["portfolio"];
};

export function PortfolioReadonlySection({ data }: Props) {
  if (data.totalCount === 0) {
    return (
      <SectionShell
        anchor="portfolio"
        icon={ImageIcon}
        title={T.title}
        subtitle={T.subtitleEmpty}
      >
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-card/60 p-8 text-center">
          <Camera className="mx-auto mb-3 h-10 w-10 text-text-sec/40" aria-hidden />
          <p className="font-display text-base text-text-main">{T.emptyTitle}</p>
          <p className="mt-1 text-sm text-text-sec">{T.emptyBody}</p>
          <Button asChild variant="primary" size="sm" className="mt-4">
            <Link href="/cabinet/master/portfolio">{T.emptyCta}</Link>
          </Button>
        </div>
      </SectionShell>
    );
  }

  const subtitle = T.subtitleTemplate
    .replace("{total}", String(data.totalCount))
    .replace("{publicCount}", String(data.publicCount));

  const actions = (
    <Button asChild variant="ghost" size="sm">
      <Link href="/cabinet/master/portfolio">{T.manageCta} →</Link>
    </Button>
  );

  return (
    <SectionShell
      anchor="portfolio"
      icon={ImageIcon}
      title={T.title}
      subtitle={subtitle}
      actions={actions}
    >
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {data.items.map((item) => (
          <li key={item.id} className="aspect-square">
            <Link
              href="/cabinet/master/portfolio"
              className="relative block h-full w-full overflow-hidden rounded-xl bg-bg-input transition-shadow hover:shadow-card"
            >
              <img
                src={item.mediaUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
              {!item.isPublic ? (
                <span
                  className={cn(
                    "absolute right-1 top-1 rounded-full bg-bg-card/90 px-2 py-0.5",
                    "font-mono text-[9px] uppercase tracking-[0.18em] text-text-sec"
                  )}
                >
                  {T.hiddenBadge}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
