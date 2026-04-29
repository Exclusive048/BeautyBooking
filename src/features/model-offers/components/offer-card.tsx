import Link from "next/link";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FocalImage } from "@/components/ui/focal-image";
import { UI_TEXT } from "@/lib/ui/text";
import type { PublicModelOfferItem } from "@/lib/model-offers/public.service";

type Props = { offer: PublicModelOfferItem };

const T = UI_TEXT.models.card;

function formatRub(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(value))} ₽`;
}

function formatDuration(min: number): string {
  if (min <= 0) return "—";
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  if (hours === 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

function formatDateLocal(dateLocal: string): string {
  // dateLocal is "YYYY-MM-DD" — format as "1 мая" / "12 марта"
  const parts = dateLocal.split("-");
  const m = parts[1];
  const d = parts[2];
  if (!m || !d) return dateLocal;
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  const monthIdx = parseInt(m, 10) - 1;
  const day = parseInt(d, 10);
  if (monthIdx < 0 || monthIdx > 11 || !Number.isFinite(day)) return dateLocal;
  return `${day} ${months[monthIdx]}`;
}

export function OfferCard({ offer }: Props) {
  const { master, service, price, extraBusyMin, dateLocal, timeRangeStartLocal } = offer;

  const isFreeForModel = price === null || price === 0;
  const originalPrice = service.originalPrice;
  const discountPercent =
    originalPrice && originalPrice > 0 && price !== null && price < originalPrice
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : null;

  const serviceMin = service.durationMin;
  const contentMin = extraBusyMin;
  const totalMin = serviceMin + contentMin;
  const showContentRow = contentMin > 0;

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-bg-card/50 p-5 transition-colors hover:border-primary/30">
      {/* Master info */}
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-border-subtle/60 bg-bg-input text-text-sec">
          {master.avatarUrl ? (
            <FocalImage
              src={master.avatarUrl}
              alt=""
              width={40}
              height={40}
              className="rounded-full object-cover"
            />
          ) : (
            <span className="text-sm font-semibold">
              {master.name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-text-main">{master.name}</p>
          {master.ratingCount > 0 ? (
            <div className="flex items-center gap-1 text-xs text-text-sec">
              <Star className="h-3 w-3 fill-current text-amber-500" aria-hidden />
              <span className="tabular-nums">{master.ratingAvg.toFixed(1)}</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{master.ratingCount}</span>
              <span>{T.reviewsLabel}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Service title + category */}
      <div>
        <h3 className="mb-1 font-display text-lg text-text-main">{service.title}</h3>
        {service.category ? (
          <p className="text-xs text-text-sec">{service.category.title}</p>
        ) : null}
      </div>

      {/* Price block */}
      <div className="flex items-baseline gap-2">
        {isFreeForModel ? (
          <span className="font-display text-2xl text-primary">{T.priceFreeForModel}</span>
        ) : (
          <>
            <span className="font-display text-2xl text-primary tabular-nums">
              {formatRub(price)}
            </span>
            {originalPrice && originalPrice > price ? (
              <>
                <span className="text-sm text-text-sec line-through tabular-nums">
                  {formatRub(originalPrice)}
                </span>
                {discountPercent !== null ? (
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    −{discountPercent}%
                  </span>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Time breakdown — the critical product block */}
      <dl className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-text-sec">{T.dateLabel}</dt>
          <dd className="text-text-main tabular-nums">
            {formatDateLocal(dateLocal)} · {timeRangeStartLocal}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-text-sec">{T.durationServiceLabel}</dt>
          <dd className="text-text-main tabular-nums">{formatDuration(serviceMin)}</dd>
        </div>
        {showContentRow ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-sec">{T.durationContentLabel}</dt>
              <dd className="text-text-main tabular-nums">~{formatDuration(contentMin)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border-subtle/40 pt-1.5 font-medium">
              <dt className="text-text-main">{T.durationTotalLabel}</dt>
              <dd className="text-text-main tabular-nums">~{formatDuration(totalMin)}</dd>
            </div>
          </>
        ) : null}
      </dl>

      <Button asChild variant="primary" className="mt-auto">
        <Link href={`/models/${offer.publicCode}`}>{T.detailsCta}</Link>
      </Button>
    </article>
  );
}
