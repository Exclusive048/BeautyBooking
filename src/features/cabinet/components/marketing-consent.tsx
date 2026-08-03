"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Megaphone, ShieldAlert } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * RKN-FIX-18 — отзыв согласия на маркетинговые коммуникации.
 *
 * ОДИН компонент на все роли. Согласие — акт уровня личности, а не настройка
 * конкретного кабинета: держать три расходящиеся копии (клиент / мастер /
 * студия) значило бы завести три источника правды об одном юридическом факте.
 * Тот же вывод, что и у CONSOLIDATE-EXTERNAL-LINKING-01 про линковку.
 *
 * Чего этот тумблер НЕ делает — сказано в тексте прямо: подтверждения записей,
 * напоминания и сообщения мастера маркетинговым согласием не управляются и
 * никуда не деваются. Обещать обратное — быстрый способ получить отзыв
 * согласия от человека, который просто хотел меньше писем.
 *
 * Отзыв ПДн/оферты сюда не вынесен: он маршрутизируется в удаление аккаунта и
 * поддержку (граница продублирована на сервере — `isSelfRevocable`).
 */

type State = {
  enabled: boolean;
  agreedAt: string | null;
};

export function MarketingConsentSection() {
  const t = UI_TEXT.legal.withdrawal;
  /**
   * SKILL-TZ-01 (CLAUDE.md rule 17) — tz-источник этой поверхности:
   * **viewer-tz**. Это не время записи и не время салона, а момент СОБСТВЕННОГО
   * действия пользователя над своим согласием, поэтому показываем его в
   * часовом поясе зрителя, без метки города (метка тут только запутала бы —
   * салон к этому факту отношения не имеет).
   */
  const viewerTimeZone = useViewerTimeZoneContext();

  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Гасит гонку: пока запрос в полёте, повторный клик игнорируется. */
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/me/consents/marketing", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<State> | null;
      if (json?.ok) setState({ enabled: json.data.enabled, agreedAt: json.data.agreedAt });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (next: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      setError(null);
      // Оптимистично — но источником правды остаётся ответ сервера.
      setState((prev) => (prev ? { ...prev, enabled: next } : prev));
      try {
        const res = await fetchWithAuth("/api/me/consents/marketing", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<State> | null;
        if (json?.ok) {
          setState({ enabled: json.data.enabled, agreedAt: json.data.agreedAt });
        } else {
          setError(t.error);
          await load();
        }
      } catch {
        setError(t.error);
        await load();
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [load, t.error],
  );

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
          <Megaphone className="h-5 w-5 text-accent-text" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base text-text-main">{t.title}</h3>
          <p className="mt-1 text-sm text-text-sec">{t.description}</p>

          <div className="mt-4 flex items-center justify-between gap-4">
            <label htmlFor="marketing-consent" className="text-sm text-text-main">
              {t.toggleLabel}
            </label>
            <Switch
              id="marketing-consent"
              checked={state?.enabled ?? false}
              disabled={loading || pending}
              onCheckedChange={(next) => void toggle(next)}
            />
          </div>

          {!loading && state ? (
            <p className="mt-2 text-xs text-text-sec">
              {state.enabled
                ? `${t.activeSince}: ${state.agreedAt ? UI_FMT.dateTimeLong(state.agreedAt, { timeZone: viewerTimeZone }) : "—"}`
                : t.revoked}
            </p>
          ) : null}

          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>
      </div>

      {/* Граница скоупа — объяснённая, а не умолчанная. */}
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-border-subtle bg-bg-input p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-text-sec" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-main">{t.pdNoticeTitle}</p>
          <p className="mt-1 text-xs text-text-sec">{t.pdNoticeBody}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="#delete-account" className="text-xs text-accent-text hover:underline">
              {t.pdNoticeDeleteCta}
            </Link>
            <Link href="/support" className="text-xs text-accent-text hover:underline">
              {t.pdNoticeSupportCta}
            </Link>
            <Link
              href={LEGAL_DOCUMENTS.PD_CONSENT.href}
              className="text-xs text-accent-text hover:underline"
            >
              {UI_TEXT.legal.consent.pdLink}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
