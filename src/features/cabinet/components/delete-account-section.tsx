"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DeleteAccountModal } from "@/components/deletion/DeleteAccountModal";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";

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
      await fetchJsonWithAuth<{ deleted: boolean }>("/api/me/delete", { method: "DELETE" });
      setOpen(false);
      router.push("/?deleted=1");
      router.refresh();
    } catch (err) {
      setError(serverMessageOr(err, "Не удалось удалить аккаунт. Попробуйте ещё раз."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* RKN-FIX-18: якорь — сюда ведёт указатель из блока согласий, где отзыв
          ПДн намеренно НЕ сделан тумблером. */}
      <section
        id="delete-account"
        className="mt-12 scroll-mt-24 border-t border-danger-border pt-8"
      >
        <h2 className="text-sm font-semibold text-danger-text">Удаление аккаунта</h2>
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
