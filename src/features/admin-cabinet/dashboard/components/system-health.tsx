"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SystemHealthRow } from "@/features/admin-cabinet/dashboard/components/system-health-row";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import * as UI_TEXT from "@/lib/ui/text";
import { UI_FMT, VIEWER_TZ } from "@/lib/ui/fmt";
import type {
  AdminHealth,
  AdminHealthSection,
} from "@/features/admin-cabinet/dashboard/types";

const SECTIONS: AdminHealthSection[] = ["platform", "queue", "integrations", "moderation"];

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
  // Время по часам зрителя — только после гидратации (VIEWER-DATE-HYDRATION-MIDNIGHT).
  const hydrated = useIsHydrated();
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
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base font-semibold text-text-main">{T.title}</h3>
        <span className="text-2xs tabular-nums text-text-sec">
          {hydrated ? T.checkedAt(UI_FMT.timeShort(new Date(health.checkedAt), { timeZone: VIEWER_TZ })) : null}
        </span>
      </div>
      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => {
          const stats = health.stats.filter((stat) => stat.section === section);
          if (stats.length === 0) return null;
          return (
            <div key={section}>
              <p className="eyebrow mb-1.5">{T.sections[section]}</p>
              <ul className="flex flex-col gap-1.5">
                {stats.map((stat) => (
                  <SystemHealthRow key={stat.key} stat={stat} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
