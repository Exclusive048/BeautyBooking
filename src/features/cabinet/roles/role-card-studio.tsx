import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { FocalImage } from "@/components/ui/focal-image";

type StudioActiveData = {
  name: string;
  logoUrl?: string | null;
  logoFocalX?: number | null;
  logoFocalY?: number | null;
  metrics?: string[];
  actionLabel?: string;
  actionHref?: string;
};

type Props =
  | {
      mode: "empty";
      actionLabel: string;
      actionHref?: string;
      actionMethod?: "GET" | "POST";
    }
  | {
      mode: "upsell";
      actionLabel: string;
      actionHref?: string;
      actionMethod?: "GET" | "POST";
    }
  | { mode: "active"; data: StudioActiveData };

export function RoleCardStudio(props: Props) {
  if (props.mode === "empty") {
    return (
      <Card className="h-full border-dashed">
        <CardContent className="flex h-full flex-col justify-between p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-bg-input text-3xl text-text-sec">
              +
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="text-base font-semibold text-text-main">У меня студия</div>
              <div className="text-sm text-text-sec">
                Управляйте командой мастеров, филиалами и общим расписанием
              </div>
            </div>
          </div>
          <div className="mt-5">
            {props.actionHref && props.actionMethod === "POST" ? (
              <form action={props.actionHref} method="post">
                <Button type="submit" className="w-full">
                  {props.actionLabel}
                </Button>
              </form>
            ) : props.actionHref ? (
              <Button asChild className="w-full">
                <Link href={props.actionHref}>{props.actionLabel}</Link>
              </Button>
            ) : (
              <Button className="w-full">{props.actionLabel}</Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (props.mode === "upsell") {
    return (
      <Card className="h-full opacity-70">
        <CardContent className="flex h-full flex-col justify-between p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-bg-input text-3xl text-text-sec">
              +
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="text-base font-semibold text-text-main">Расширяйтесь до студии</div>
              <div className="text-sm text-text-sec">
                Добавьте команду мастеров и управляйте расписанием в одном месте
              </div>
            </div>
          </div>
          <div className="mt-5">
            {props.actionHref && props.actionMethod === "POST" ? (
              <form action={props.actionHref} method="post">
                <Button type="submit" className="w-full">
                  {props.actionLabel}
                </Button>
              </form>
            ) : props.actionHref ? (
              <Button asChild className="w-full">
                <Link href={props.actionHref}>{props.actionLabel}</Link>
              </Button>
            ) : (
              <Button className="w-full">{props.actionLabel}</Button>
            )}
          </div>
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
    <Card className="h-full">
      <CardContent className="flex h-full flex-col justify-between p-5">
        <div className="flex items-center gap-4">
          <div className="h-[60px] w-[60px] shrink-0 overflow-hidden rounded-2xl border border-border-subtle bg-bg-input">
            {data.logoUrl ? (
              <FocalImage
                src={data.logoUrl}
                alt={data.name}
                focalX={data.logoFocalX}
                focalY={data.logoFocalY}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-text-sec">
                Лого
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="truncate text-base font-semibold text-text-main">{data.name}</div>
            <div className="text-sm text-text-sec">Студия</div>
            {statusMetric ? (
              <div className="flex items-center gap-2 text-sm text-text-sec">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    isPublished ? "bg-emerald-400" : "bg-border-subtle"
                  )}
                />
                <span className="truncate">{statusMetric}</span>
              </div>
            ) : null}
            {otherMetrics && otherMetrics.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-sec">
                {otherMetrics.map((metric) => (
                  <span key={metric}>{metric}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-5">
          {data.actionHref ? (
            <Button asChild className="w-full">
              <Link href={data.actionHref}>{data.actionLabel ?? "Открыть кабинет"}</Link>
            </Button>
          ) : (
            <Button className="w-full">{data.actionLabel ?? "Открыть кабинет"}</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
