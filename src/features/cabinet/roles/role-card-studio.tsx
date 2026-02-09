import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-2xl border border-border-subtle bg-bg-input">
            {data.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.logoUrl} alt={data.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-text-sec">
                Лого
              </div>
            )}
          </div>
          <div>
            <div className="text-lg font-semibold text-text-main">{data.name}</div>
            {data.metrics && data.metrics.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-text-sec">
                {data.metrics.map((metric) => (
                  <span key={metric}>{metric}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {data.actionHref ? (
          <Button asChild className="self-start md:self-center">
            <Link href={data.actionHref}>{data.actionLabel ?? "Открыть кабинет"}</Link>
          </Button>
        ) : (
          <Button className="self-start md:self-center">
            {data.actionLabel ?? "Открыть кабинет"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
