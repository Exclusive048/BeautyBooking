import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type MasterActiveData = {
  name: string;
  specialization?: string | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  isActive?: boolean | null;
  statusLabel?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  actionLabel?: string;
  actionHref?: string;
};

type Props =
  | { mode: "empty"; actionLabel: string; actionHref?: string }
  | { mode: "active"; data: MasterActiveData };

export function RoleCardMaster(props: Props) {
  if (props.mode === "empty") {
    return (
      <Card className="border-dashed">
        <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border-subtle text-3xl text-text-sec">
            +
          </div>
          <div className="text-lg font-semibold text-text-main">Я — мастер</div>
          <div className="max-w-xs text-sm text-text-sec">
            Создайте профиль, добавьте услуги и принимайте клиентов
          </div>
          {props.actionHref ? (
            <Button asChild>
              <Link href={props.actionHref}>{props.actionLabel}</Link>
            </Button>
          ) : (
            <Button>{props.actionLabel}</Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const { data } = props;
  const statusText =
    data.statusLabel ??
    (data.isActive === null || data.isActive === undefined
      ? null
      : data.isActive
        ? "Принимаю заказы"
        : "Не работаю");
  const isPublished =
    statusText !== null &&
    statusText !== undefined &&
    statusText.includes("опубликован") &&
    !statusText.includes("не опубликован");
  const ratingAvg = typeof data.ratingAvg === "number" ? data.ratingAvg : null;
  const ratingCount = typeof data.ratingCount === "number" ? data.ratingCount : 0;
  const showRating = ratingAvg !== null && ratingCount > 0;
  const ratingLabel = showRating ? `★ ${ratingAvg.toFixed(1)} (${ratingCount} отзывов)` : null;

  return (
    <Card
      className={cn("relative overflow-hidden")}
      style={
        data.coverUrl
          ? { backgroundImage: `url(${data.coverUrl})`, backgroundSize: "cover" }
          : undefined
      }
    >
      {data.coverUrl ? <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" /> : null}
      <CardContent className="relative flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:gap-6 md:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-border-subtle bg-bg-input">
            {data.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.avatarUrl} alt={data.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-text-sec">
                Фото
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-base font-semibold text-text-main">{data.name}</div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-sec">
              {data.specialization ? (
                <span className="truncate">{data.specialization}</span>
              ) : null}
              {data.specialization && statusText ? <span className="text-text-sec/80">•</span> : null}
              {statusText ? (
                <span className="inline-flex items-center gap-1">
                  <span
                    className={cn(
                      "text-xs",
                      isPublished ? "text-emerald-300" : "text-text-sec"
                    )}
                  >
                    ●
                  </span>
                  <span>{statusText}</span>
                </span>
              ) : null}
            </div>
            {ratingLabel ? (
              <div className="mt-2 text-xs text-text-sec">{ratingLabel}</div>
            ) : null}
          </div>
        </div>
        <div className="md:ml-6">
          {data.actionHref ? (
            <Button asChild className="w-full md:w-auto">
              <Link href={data.actionHref}>{data.actionLabel ?? "Открыть кабинет"}</Link>
            </Button>
          ) : (
            <Button className="w-full md:w-auto">{data.actionLabel ?? "Открыть кабинет"}</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
