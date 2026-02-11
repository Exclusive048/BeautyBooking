import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type StudioActiveData = {
  name: string;
  logoUrl?: string | null;
  metrics?: string[];
  actionLabel?: string;
  actionHref?: string;
};

type Props =
  | { mode: "empty"; actionLabel: string; actionHref?: string }
  | { mode: "upsell"; actionLabel: string; actionHref?: string }
  | { mode: "active"; data: StudioActiveData };

export function RoleCardStudio(props: Props) {
  if (props.mode === "empty") {
    return (
      <Card className="border-dashed">
        <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border-subtle text-3xl text-text-sec">
            +
          </div>
          <div className="text-lg font-semibold text-text-main">У меня студия</div>
          <div className="max-w-xs text-sm text-text-sec">
            Управляйте командой мастеров, филиалами и общим расписанием
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

  if (props.mode === "upsell") {
    return (
      <Card className="opacity-70">
        <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-lg font-semibold text-text-main">Расширяйтесь до студии</div>
          <div className="max-w-xs text-sm text-text-sec">
            Добавьте команду мастеров и управляйте расписанием в одном месте
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
  const statusMetric =
    data.metrics?.find((metric) => metric === "Опубликована" || metric === "Черновик") ?? null;
  const otherMetrics = statusMetric
    ? data.metrics?.filter((metric) => metric !== statusMetric)
    : data.metrics;
  const isPublished = statusMetric === "Опубликована";

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:gap-6 md:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-border-subtle bg-bg-input">
            {data.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.logoUrl} alt={data.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-text-sec">
                Лого
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-base font-semibold text-text-main">{data.name}</div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-sec">
              <span className="truncate">Студия</span>
              {statusMetric ? <span className="text-text-sec/80">•</span> : null}
              {statusMetric ? (
                <span className="inline-flex items-center gap-1">
                  <span
                    className={cn(
                      "text-xs",
                      isPublished ? "text-emerald-300" : "text-text-sec"
                    )}
                  >
                    ●
                  </span>
                  <span>{statusMetric}</span>
                </span>
              ) : null}
            </div>
            {otherMetrics && otherMetrics.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-sec">
                {otherMetrics.map((metric) => (
                  <span key={metric}>{metric}</span>
                ))}
              </div>
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
