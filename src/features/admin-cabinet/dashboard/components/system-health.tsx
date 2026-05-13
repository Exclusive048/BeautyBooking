"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SystemHealthRow } from "@/features/admin-cabinet/dashboard/components/system-health-row";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminHealth,
} from "@/features/admin-cabinet/dashboard/types";

const POLL_MS = 30_000;

type Props = {
  initial: AdminHealth;
};

const T = UI_TEXT.adminPanel.dashboard.health;

/** Polls `/api/admin/dashboard/health` every 30 seconds — fast enough
 * that a queue spike or worker hiccup surfaces during a single admin
 * session, slow enough not to spam Redis with `LLEN` calls. */
export function SystemHealth({ initial }: Props) {
  const [health, setHealth] = useState<AdminHealth>(initial);
  const isVisible = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard/health", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { ok: boolean; data?: AdminHealth };
      if (json.ok && json.data) setHealth(json.data);
    } catch {
      // Silent — keep stale data on transient errors.
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      isVisible.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!isVisible.current) return;
      void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card">
      <h3 className="mb-3 font-display text-base font-semibold text-text-main">
        {T.title}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {health.stats.map((stat) => (
          <SystemHealthRow key={stat.key} stat={stat} />
        ))}
      </ul>
    </section>
  );
}
