"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ApiResponse } from "@/lib/types/api";

function normalizePhone(input: string) {
  const cleaned = input.replace(/[()\s-]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  return `+${cleaned}`;
}

function safeNext(nextRaw: string | null) {
  // Защита от open-redirect: разрешаем только относительные пути
  if (!nextRaw) return null;
  if (!nextRaw.startsWith("/")) return null;
  if (nextRaw.startsWith("//")) return null;
  return nextRaw;
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(() => safeNext(searchParams.get("next")), [searchParams]);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function sendCode() {
    setErrorText(null);
    const normalized = normalizePhone(phone);

    if (!normalized || normalized.length < 8) {
      setErrorText("Введите телефон в международном формате, например +77001234567");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });

      const json = (await res.json().catch(() => null)) as ApiResponse<Record<string, never>> | null;

      if (!res.ok) {
        setErrorText("Не удалось отправить код");
        return;
      }

      if (!json || !json.ok) {
        setErrorText(json?.error?.message ?? "Не удалось отправить код");
        return;
      }

      setStep("code");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setErrorText(null);
    const normalized = normalizePhone(phone);

    if (!code || code.length < 4) {
      setErrorText("Введите код");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized, code }),
      });

      const json = (await res.json().catch(() => null)) as ApiResponse<Record<string, never>> | null;

      if (!res.ok) {
        setErrorText("Неверный код");
        return;
      }

      if (!json || !json.ok) {
        setErrorText(json?.error?.message ?? "Неверный код");
        return;
      }

      // ✅ редирект туда, куда просили
      router.replace(nextPath ?? "/cabinet");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm bg-white">
        <h1 className="text-xl font-semibold">Вход по телефону</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Мы отправим код подтверждения.
          <span className="block mt-1 text-xs">
            (Пока код выводится в консоль сервера; позже подключим SMS-агрегатор.)
          </span>
        </p>

        {errorText ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorText}
          </div>
        ) : null}

        {step === "phone" ? (
          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium">Телефон</label>
            <input
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2"
              placeholder="+77001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
            />

            <button
              onClick={sendCode}
              disabled={loading}
              className="w-full rounded-xl bg-black text-white py-2 font-medium disabled:opacity-60"
            >
              {loading ? "Отправляем..." : "Получить код"}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <div className="text-sm text-neutral-700">
              Код отправлен на <span className="font-medium">{normalizePhone(phone)}</span>
            </div>

            <label className="block text-sm font-medium">Код</label>
            <input
              className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 tracking-widest"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
              inputMode="numeric"
              autoComplete="one-time-code"
            />

            <button
              onClick={verifyCode}
              disabled={loading}
              className="w-full rounded-xl bg-black text-white py-2 font-medium disabled:opacity-60"
            >
              {loading ? "Проверяем..." : "Войти"}
            </button>

            <button
              onClick={() => setStep("phone")}
              disabled={loading}
              className="w-full rounded-xl border py-2 font-medium disabled:opacity-60"
            >
              Изменить телефон
            </button>
          </div>
        )}

        {nextPath ? (
          <div className="mt-6 text-xs text-neutral-500">
            После входа вы вернётесь на: <span className="font-mono">{nextPath}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}