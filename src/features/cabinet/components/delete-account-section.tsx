"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types/api";
import { DeleteAccountModal } from "@/components/deletion/DeleteAccountModal";

type Props = {
  phone: string | null;
};

export function DeleteAccountSection({ phone }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/delete", { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ deleted: boolean }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `Ошибка: ${res.status}`);
      }
      setOpen(false);
      router.push("/?deleted=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить аккаунт.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="mt-12 border-t border-red-200/40 pt-8 dark:border-red-400/20">
        <h2 className="text-sm font-semibold text-red-500 dark:text-red-400">Удаление аккаунта</h2>
        <p className="mt-1 text-xs text-text-sec">
          Все ваши личные данные будут удалены с платформы безвозвратно в соответствии с
          Федеральным законом №152-ФЗ «О персональных данных». История платежей и
          завершённых записей хранится в обезличенном виде согласно требованиям налогового
          законодательства (5 лет).
        </p>
        <Button
          variant="danger"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="mt-4"
        >
          Удалить аккаунт
        </Button>
      </section>

      <DeleteAccountModal
        open={open}
        phone={phone}
        onCancel={() => setOpen(false)}
        onConfirm={handleDelete}
        loading={loading}
        error={error}
      />
    </>
  );
}
