"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AccountType = "CLIENT" | "MASTER" | "STUDIO";

type ApiOk = {
  ok: true;
  data: {
    redirect?: string;
  };
};

type ApiError = {
  ok: false;
  error: {
    message: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiOk(value: unknown): value is ApiOk {
  if (!isRecord(value) || value.ok !== true) return false;
  if (!isRecord(value.data)) return false;
  return value.data.redirect === undefined || typeof value.data.redirect === "string";
}

function isApiError(value: unknown): value is ApiError {
  if (!isRecord(value) || value.ok !== false) return false;
  if (!isRecord(value.error)) return false;
  return typeof value.error.message === "string";
}

export function AccountTypeCard({
  type,
  title,
  desc,
}: {
  type: AccountType;
  title: string;
  desc: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSelect = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/auth/account-type/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (isApiOk(payload)) {
        router.replace(payload.data.redirect ?? "/");
        return;
      }

      if (isApiError(payload)) {
        setError(payload.error.message);
        return;
      }

      setError("Неожиданный ответ сервера.");
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={onSelect}
        disabled={isPending}
        className="w-full rounded-2xl border p-4 text-left hover:bg-neutral-50 transition disabled:opacity-60"
      >
        <div className="font-medium">{title}</div>
        <div className="mt-1 text-sm text-neutral-600">{desc}</div>
      </button>
      {error ? <div className="mt-2 text-sm text-rose-600">{error}</div> : null}
    </div>
  );
}
