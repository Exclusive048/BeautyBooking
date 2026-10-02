"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";
import { ME_SWR_KEY, useMe, type MeUser } from "@/lib/hooks/use-me";
import { fetchJsonWithAuth } from "@/lib/http/client";

/**
 * WELCOME-DIALOG-01 — приветствие этапа тестирования после регистрации.
 *
 * Стоит в root layout, поэтому сам почти ничего не весит: решение «показать»
 * берётся из ответа `/api/me` (его и так читает нижняя навигация — лишнего
 * запроса нет), а окно с текстами и движением догружается отдельным чанком
 * только тому, кому его нужно показать.
 */
const WelcomeDialog = dynamic(
  () => import("@/components/onboarding/welcome-dialog").then((mod) => mod.WelcomeDialog),
  { ssr: false },
);

export function WelcomeGate() {
  const { user } = useMe();
  const { mutate } = useSWRConfig();
  const [dismissed, setDismissed] = useState(false);

  const handleClose = useCallback(() => {
    setDismissed(true);
    // Окно закрывается сразу; отметку сервер ставит фоном. Не дошла (обрыв
    // сети) — окно покажется ещё раз на следующем входе, это не поломка.
    void fetchJsonWithAuth("/api/me/welcome", { method: "POST" })
      .then(() =>
        mutate<{ user: MeUser | null }>(
          ME_SWR_KEY,
          (current) => (current?.user ? { user: { ...current.user, welcomePending: false } } : current),
          { revalidate: false },
        ),
      )
      .catch(() => {});
  }, [mutate]);

  if (!user?.welcomePending || dismissed) return null;
  return <WelcomeDialog onClose={handleClose} />;
}
