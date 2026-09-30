"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { fetchJson, serverMessageOr } from "@/lib/http/client";

export type TelegramStatus = {
  linked: boolean;
  enabled: boolean;
  botUsername: string;
};

const TELEGRAM_STATUS_ERROR = "Не удалось проверить подключение Telegram. Попробуйте ещё раз.";

async function fetchTelegramStatus(url: string): Promise<TelegramStatus> {
  try {
    return await fetchJson<TelegramStatus>(url, { cache: "no-store" });
  } catch (error) {
    // Хук отдаёт `error.message` строкой — решение принимается здесь.
    throw new Error(serverMessageOr(error, TELEGRAM_STATUS_ERROR));
  }
}

export function useTelegramStatus() {
  const { data, error, isLoading, mutate } = useSWR<TelegramStatus>(
    "/api/telegram/status",
    fetchTelegramStatus,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    }
  );

  const reload = useCallback(async () => {
    const next = await mutate();
    return next ?? null;
  }, [mutate]);

  return {
    status: data ?? null,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    reload,
  };
}

