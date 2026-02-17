"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";

const MasterProfilePage = dynamic(
  () => import("@/features/master/components/master-profile-page").then((mod) => mod.MasterProfilePage),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl bg-bg-card/90 p-5">
        <Skeleton className="h-5 w-40" />
        <div className="mt-4 grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`tab-skeleton-${index}`} className="h-10 w-full rounded-xl" />
            ))}
          </div>
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    ),
  }
);

export default function MasterProfileClient() {
  return <MasterProfilePage />;
}
