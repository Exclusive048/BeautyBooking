"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { FocalImage } from "@/components/ui/focal-image";
import { UI_TEXT } from "@/lib/ui/text";

type MasterActiveData = {
  name: string;
  specialization?: string | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  isActive?: boolean | null;
  isPublished?: boolean | null;
  statusLabel?: string | null;
  avatarUrl?: string | null;
  avatarFocalX?: number | null;
  avatarFocalY?: number | null;
  coverUrl?: string | null;
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
  | { mode: "active"; data: MasterActiveData; onDelete?: () => void };

export function RoleCardMaster(props: Props) {
  if (props.mode === "empty") {
    return (
      <Card className="h-full border-dashed">
        <CardContent className="flex h-full flex-col justify-between p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-bg-input text-3xl text-text-sec">
              +
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="text-base font-semibold text-text-main">{UI_TEXT.cabinetRoles.master.title}</div>
              <div className="text-sm text-text-sec">
                {UI_TEXT.cabinetRoles.master.description}
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
  const statusText =
    data.statusLabel ??
    (data.isActive === null || data.isActive === undefined
      ? null
      : data.isActive
        ? UI_TEXT.cabinetRoles.master.working
        : UI_TEXT.cabinetRoles.master.notWorking);
  const isPublished = Boolean(data.isPublished);
  const ratingAvg = typeof data.ratingAvg === "number" ? data.ratingAvg : null;
  const ratingCount = typeof data.ratingCount === "number" ? data.ratingCount : 0;
  const showRating = ratingAvg !== null && ratingCount > 0;
  const ratingLabel = showRating
    ? UI_TEXT.cabinetRoles.master.reviewsTemplate(ratingAvg.toFixed(1), ratingCount)
    : null;

  return (
    <Card
      className={cn("relative h-full overflow-hidden")}
      style={
        data.coverUrl
          ? { backgroundImage: `url(${data.coverUrl})`, backgroundSize: "cover" }
          : undefined
      }
    >
      {data.coverUrl ? <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" /> : null}
      <CardContent className="relative flex h-full flex-col justify-between p-5">
        <div className="flex items-center gap-4">
          <div className="h-[60px] w-[60px] shrink-0 overflow-hidden rounded-2xl border border-border-subtle bg-bg-input">
            {data.avatarUrl ? (
              <FocalImage
                src={data.avatarUrl}
                alt={data.name}
                focalX={data.avatarFocalX}
                focalY={data.avatarFocalY}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-text-sec">
                {UI_TEXT.cabinetRoles.master.photoFallback}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="truncate text-base font-semibold text-text-main">{data.name}</div>
            {data.specialization ? (
              <div className="truncate text-sm text-text-sec">{data.specialization}</div>
            ) : null}
            {statusText ? (
              <div className="flex items-center gap-2 text-sm text-text-sec">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    isPublished ? "bg-emerald-400" : "bg-border-subtle"
                  )}
                />
                <span className="truncate">{statusText}</span>
              </div>
            ) : null}
            {ratingLabel ? <div className="text-xs text-text-sec">{ratingLabel}</div> : null}
          </div>
        </div>
        <div className="mt-5">
          {data.actionHref ? (
            <Button asChild className="w-full">
              <Link href={data.actionHref}>
                {data.actionLabel ?? UI_TEXT.cabinetRoles.master.openCabinet}
              </Link>
            </Button>
          ) : (
            <Button className="w-full">{data.actionLabel ?? UI_TEXT.cabinetRoles.master.openCabinet}</Button>
          )}
          {"onDelete" in props && props.onDelete ? (
            <button
              type="button"
              onClick={props.onDelete}
              className="mt-4 text-xs text-text-sec transition-colors underline-offset-2 hover:text-red-500 hover:underline"
            >
              {UI_TEXT.cabinetRoles.master.deleteCabinet}
            </button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
