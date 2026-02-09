"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

type Props = {
  active: "all" | "working_today";
  allCount: number;
  workingCount: number;
};

export function TeamTabs({ active, allCount, workingCount }: Props) {
  const base = "relative rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300";
  const on =
    "bg-bg-card/80 pl-4 text-text-main shadow-card before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary before:to-primary-magenta";
  const off = "text-text-sec hover:bg-bg-input/70 hover:text-text-main";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/cabinet/studio/team" className={cn(base, active === "all" ? on : off)}>
        Все мастера ({allCount})
      </Link>
      <Link
        href="/cabinet/studio/team?filter=working_today"
        className={cn(base, active === "working_today" ? on : off)}
      >
        Работают сегодня ({workingCount})
      </Link>
    </div>
  );
}
