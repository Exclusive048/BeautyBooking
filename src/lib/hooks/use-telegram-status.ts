"use client";

import { useCallback } from "react";
import useSWR from "swr";
import type { ApiResponse } from "@/lib/types/api";

export type TelegramStatus = {
  linked: boolean;
  enabled: boolean;
  botUsername: string;
};

const TELEGRAM_STATUS_ERROR = "Не удалось загрузить статус Telegram";

async function fetchTelegramStatus(url: string): Promise<TelegramStatus> {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as ApiResponse<TelegramStatus> | null;
  if (!res.ok || !json || json.ok !== true) {
    const message =
      json && json.ok === false ? json.error.message ?? TELEGRAM_STATUS_ERROR : TELEGRAM_STATUS_ERROR;
    throw new Error(message);
  }
  return json.data;
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

