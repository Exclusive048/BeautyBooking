"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Check } from "lucide-react";
import { useMe } from "@/lib/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/cn";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

type SubscriptionItem = {
  providerId: string;
};

type Props = {
  providerId: string;
  enabled: boolean;
  className?: string;
};

/**
 * Subscribe-to-hot-slots toggle (fix-03).
 *
 * Visual: solid brand-gradient pill when unsubscribed (a CTA — opt-in
 * action master wants the user to take), neutral secondary state when
 * already subscribed (informational confirmation). Theme-aware: the
 * brand gradient softens in dark mode so it doesn't overpower the
 * aurora background. Previously the button used `frost-panel` +
 * `text-white` which was readable on the legacy dark cover-photo
 * hero but invisible on the 32a aurora cream gradient.
 *
 * Functionality is end-to-end:
 *   - POST/DELETE `/api/hot-slots/subscribe` toggles
 *     `HotSlotSubscription`
 *   - `notifyHotSlotSubscribers` in `lib/hot-slots/notifications.ts`
 *     fires when the `smart-price-job` mints a new hot slot for the
 *     provider — push + telegram via existing delivery pipeline.
 */
export function HotSlotsSubscribeButton({ providerId, enabled, className }: Props) {
  const { user } = useMe();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 29.09 доработки · 16 (Ю1, вариант В): скидочные «горящие окошки» — реклама
  // и приходят только с согласием на акции (38-ФЗ ст. 18). Нет согласия — рядом
  // с кнопкой чекбокс; отметка идёт тем же писателем, что переключатель в
  // настройках (`PATCH /api/me/consents/marketing`, инв. #37). `null` — ещё не
  // знаем (или не удалось узнать): чекбокс не показываем.
  const [marketingConsent, setMarketingConsent] = useState<boolean | null>(null);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const optInId = useId();

  useEffect(() => {
    if (!user || !enabled) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [data, consent] = await Promise.all([
          fetchJson<{ items: SubscriptionItem[] }>("/api/hot-slots/subscribe", { cache: "no-store" }),
          fetchJson<{ enabled: boolean }>("/api/me/consents/marketing", { cache: "no-store" }).catch(() => null),
        ]);
        if (!cancelled) {
          setSubscribed(data.items.some((item) => item.providerId === providerId));
          setMarketingConsent(consent ? consent.enabled : null);
        }
      } catch {
        // Начальное чтение состояния молчит намеренно: пользователь ничего не
        // просил, показывать ему отказ фонового запроса не за что. Кнопка
        // остаётся в состоянии «не подписан» — то есть предлагает действие,
        // а не врёт об успехе.
      } finally {
        if (!cancelled) {
          setInitialized(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, providerId, user]);

  if (!enabled) return null;

  const handleClick = async () => {
    if (!user) {
      // Обычный переход на страницу входа — мягкой навигацией (29.09 · 06);
      // после входа `login-client.tsx` сам делает полную загрузку.
      const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      router.push(`/login?next=${next}`);
      return;
    }
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      if (!subscribed && marketingConsent === false && marketingOptIn && !(await saveMarketingConsent())) {
        return;
      }
      await fetchJson("/api/hot-slots/subscribe", {
        method: subscribed ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      setSubscribed(!subscribed);
    } catch (caught) {
      // FIX-C8 · fromServer = ПОКАЗАТЬ СЕРВЕРНОЕ, и здесь это не «улучшение
      // текста», а появление обратной связи как таковой: прежняя ветка
      // `if (!res.ok …) return;` глотала отказ ЦЕЛИКОМ. Пользователь жал
      // «Уведомить о горящих окошках», кнопка не переключалась, и не
      // появлялось ничего — ни сообщения, ни признака отказа; неотличимо от
      // залипшего интерфейса. Отказы при этом действенные и все с
      // курируемыми строками: «Достигнут лимит подписок.» (`LIMIT_REACHED` —
      // отпишитесь от кого-то), «Горящие окошки не активны.», «Мастер не
      // найден.».
      setError(serverMessageOr(caught, UI_TEXT.publicProfile.slots.subscribeFailed));
    } finally {
      setInitialized(true);
      setLoading(false);
    }
  };

  // Отказ показывает свою строку и не бросает: подписка без согласия всё равно
  // полезна («окошко освободилось» приходит по подписке).
  async function saveMarketingConsent(): Promise<boolean> {
    try {
      await fetchJson("/api/me/consents/marketing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      setMarketingConsent(true);
      return true;
    } catch (caught) {
      setError(serverMessageOr(caught, UI_TEXT.publicProfile.slots.marketingOptInFailed));
      return false;
    }
  }

  // Уже подписан, а согласия нет: отметка сохраняется сразу (автосохранение).
  const handleOptInChange = (next: boolean) => {
    setMarketingOptIn(next);
    if (!subscribed || !next || loading) return;
    setLoading(true);
    setError(null);
    void saveMarketingConsent()
      .then((saved) => {
        if (!saved) setMarketingOptIn(false);
      })
      .finally(() => setLoading(false));
  };

  const label = subscribed
    ? UI_TEXT.publicProfile.slots.unsubscribeHot
    : UI_TEXT.publicProfile.slots.subscribeHot;
  const isLoadingPostMount = loading && initialized;

  return (
    // FIX-C8: обёртка нужна, чтобы отказу было где появиться. Без ошибки внутри
    // ровно один потомок — кнопка, — поэтому в обычном состоянии ряд hero-блока
    // выглядит как прежде.
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={subscribed ? "secondary" : "primary"}
        size="sm"
        onClick={() => void handleClick()}
        disabled={loading}
        className={cn(
          "gap-1.5 rounded-xl",
          subscribed
            ? // Subscribed → neutral confirmation chip
              "border-success-border bg-success-surface text-success-text hover:brightness-95"
            : // Unsubscribed → brand-gradient CTA. Softer in dark mode
              // so it doesn't overpower the aurora background: the dark
              // branch switches back to the variant's left-to-right gradient
              // with rose stops (`bg-brand-gradient` is a fixed image, stops
              // alone would not reach it — it only worked while `cn` was a
              // plain join and the variant's gradient won by bundle order).
              // dark-ok: единственная мягкая версия бренд-градиента на авроре тёмной темы
              "bg-brand-gradient text-white shadow-md hover:opacity-95 dark:bg-gradient-to-r dark:from-rose-600/90 dark:to-rose-700/90",
          className,
        )}
      >
        {subscribed ? (
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2} />
        ) : (
          <BellRing className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.8} />
        )}
        <span>{isLoadingPostMount ? UI_TEXT.publicProfile.slots.subscribeLoading : label}</span>
      </Button>
      {user && marketingConsent === false ? (
        <div className="flex max-w-[18rem] items-start gap-2 pt-1">
          <Checkbox
            id={optInId}
            size="sm"
            checked={marketingOptIn}
            disabled={loading}
            onChange={(event) => handleOptInChange(event.target.checked)}
            className="mt-0.5"
          />
          <label htmlFor={optInId} className="cursor-pointer text-xs leading-snug text-text-sec">
            {UI_TEXT.publicProfile.slots.marketingOptIn}
          </label>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="max-w-[16rem] text-xs leading-snug text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
