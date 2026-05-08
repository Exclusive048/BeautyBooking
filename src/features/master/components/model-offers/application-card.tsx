import { Camera, CameraOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { ApplicationItem } from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import {
  formatOfferDateShort,
  pickAvatarColor,
} from "./lib/format";
import { ApplicationActionsIsland } from "./application-actions-island";
import { ApplicationPhotos } from "./application-photos";

const T = UI_TEXT.cabinetMaster.modelOffers.applicationCard;

type Props = {
  application: ApplicationItem;
};

/**
 * Application card. Read-only in 29a — Approve/Reject/Chat are disabled
 * with "Доступно скоро" tooltips (29b backlog). Layout:
 *   [avatar] [name + offer ref + status]
 *   [photos]
 *   [client note]
 *   [consent + actions]
 */
export function ApplicationCard({ application }: Props) {
  const avatarClass = pickAvatarColor(application.client.avatarSeed);
  const offerLink = T.offerLinkTemplate
    .replace("{date}", formatOfferDateShort(application.offer.dateLocal))
    .replace("{time}", application.offer.timeRangeStartLocal);

  return (
    <article className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-mono text-sm",
            avatarClass
          )}
          aria-hidden
        >
          {application.client.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-display text-base text-text-main">
              {application.client.displayName}
            </p>
            <Badge variant="warning">{T.statusBadges.pending}</Badge>
          </div>
          <a
            href={`#offer-${application.offer.id}`}
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-text-sec hover:text-primary hover:underline"
          >
            <span>{offerLink}</span>
            {application.offer.discountPct !== null ? (
              <span className="text-primary">· −{application.offer.discountPct}%</span>
            ) : null}
          </a>
        </div>
      </header>

      <div className="mt-4">
        <ApplicationPhotos photos={application.photos} />
      </div>

      {application.clientNote ? (
        <p className="mt-3 whitespace-pre-line rounded-xl border border-border-subtle bg-bg-input/40 px-4 py-3 text-sm text-text-main">
          {application.clientNote}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle/70 pt-4">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            application.consentToShoot ? "text-emerald-700 dark:text-emerald-300" : "text-text-sec"
          )}
        >
          {application.consentToShoot ? (
            <Camera className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <CameraOff className="h-3.5 w-3.5" aria-hidden />
          )}
          {application.consentToShoot ? T.consentYes : T.consentNo}
        </span>
        <ApplicationActionsIsland
          application={application}
          offerStartLocal={application.offer.timeRangeStartLocal}
          offerEndLocal={application.offer.timeRangeEndLocal}
        />
      </div>
    </article>
  );
}
