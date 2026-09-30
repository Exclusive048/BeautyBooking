"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DeleteCabinetModal } from "@/components/deletion/DeleteCabinetModal";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.account;

/**
 * Необратимое действие кабинета мастера — удаление КАБИНЕТА, а не аккаунта.
 *
 * CABINET-DELETE-SCOPE-01: раньше здесь стояло удаление аккаунта целиком
 * (`/api/me/delete`). Внутри кабинета мастера человек ждёт, что удалится этот
 * кабинет, — а уходило всё: клиентская история, студия, если она есть, сам
 * вход. Кабинет студии уже был устроен правильно (удаляет только студию), так
 * что мастер был единственным расхождением. Теперь карточка зовёт тот же
 * `DELETE /api/cabinet/master/delete` и тот же `DeleteCabinetModal`, что и
 * страница «Мои кабинеты», а удаление аккаунта целиком живёт в одном месте —
 * `/cabinet/settings`, куда ведёт ссылка под кнопкой.
 */
export function DangerZoneCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBookingsCount, setActiveBookingsCount] = useState<number | null>(null);

  const openModal = () => {
    setError(null);
    setActiveBookingsCount(null);
    setOpen(true);
  };

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    setActiveBookingsCount(null);
    try {
      await fetchJsonWithAuth<{ deleted: boolean }>("/api/cabinet/master/delete", { method: "DELETE" });
      setOpen(false);
      router.push("/cabinet/roles");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "ACTIVE_BOOKINGS") {
        const details = error.details as { count?: number } | undefined;
        setActiveBookingsCount(typeof details?.count === "number" ? details.count : 0);
      } else {
        // Серверная строка курируемая (например, «Слишком часто…») и говорит
        // больше канона; своя — только когда тела нет.
        setError(serverMessageOr(error, UI_TEXT.cabinetRolesPage.deleteFailed));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-danger-border bg-danger-surface p-5">
        <header className="mb-3 flex items-center gap-2">
          <AlertTriangle
            className="h-4 w-4 text-danger-text"
            aria-hidden
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-danger-text">
            {T.dangerZoneHeading}
          </p>
        </header>
        <h3 className="font-display text-base text-text-main">{T.dangerZoneTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-sec">{T.dangerZoneBody}</p>
        <div className="mt-4">
          {/* `wrapper`, а не `ghost`: цвет текста варианта перебивал красный. */}
          <Button
            variant="wrapper"
            size="none"
            onClick={openModal}
            className="inline-flex h-9 items-center justify-center rounded-2xl px-3 text-sm font-medium text-danger-text transition-colors hover:bg-danger-surface gap-1.5 border border-danger-border"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {T.dangerZoneCta}
          </Button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-text-sec">
          {T.accountDeletionHint}{" "}
          <Link
            href="/cabinet/settings"
            className="font-medium text-text-main underline decoration-border-subtle underline-offset-4 transition hover:decoration-text-main"
          >
            {T.accountDeletionLink}
          </Link>
        </p>
      </section>

      <DeleteCabinetModal
        open={open}
        type="master"
        onCancel={() => setOpen(false)}
        onConfirm={handleDelete}
        loading={loading}
        activeBookingsCount={activeBookingsCount}
        error={error}
      />
    </>
  );
}
