"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DeleteAccountModal } from "@/components/deletion/DeleteAccountModal";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  phone: string | null;
  /** 29.09 доработки · 26: политика отзывов — USER_CHOICE (решает сервер). */
  offerDeleteReviews: boolean;
};

const T = UI_TEXT.deletion;

/** Число записей из `error.details` отказа (`{ count }`), если сервер его прислал. */
function bookingsCount(error: ApiClientError): number | null {
  const details = error.details as { count?: unknown } | undefined;
  return typeof details?.count === "number" ? details.count : null;
}

export function DeleteAccountSection({ phone, offerDeleteReviews }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorLink, setErrorLink] = useState<{ href: string; label: string } | null>(null);

  const handleDelete = async ({ deleteReviews }: { deleteReviews: boolean }) => {
    setLoading(true);
    setError(null);
    setErrorLink(null);
    try {
      const query = deleteReviews ? "?deleteReviews=1" : "";
      await fetchJsonWithAuth<{ deleted: boolean }>(`/api/me/delete${query}`, { method: "DELETE" });
      setOpen(false);
      router.push("/?deleted=1");
      router.refresh();
    } catch (err) {
      // Решение 26.1: предстоящие записи клиента — действенный отказ, с путём
      // к записям. Записи кабинетов — отказ со своим числом.
      if (err instanceof ApiClientError && err.code === "CLIENT_ACTIVE_BOOKINGS") {
        setError(serverMessageOr(err, T.accountClientBookings(bookingsCount(err) ?? 0)));
        setErrorLink({ href: "/cabinet/bookings", label: T.accountClientBookingsLink });
      } else if (err instanceof ApiClientError && err.code === "ACTIVE_BOOKINGS") {
        setError(T.accountCabinetBookings(bookingsCount(err) ?? 0));
      } else {
        setError(serverMessageOr(err, T.accountDeleteFailed));
      }
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
        <h2 className="text-sm font-semibold text-danger-text">{T.accountSectionTitle}</h2>
        <p className="mt-1 text-xs text-text-sec">{T.accountSectionDescription}</p>
        <Button
          variant="danger"
          onClick={() => {
            setError(null);
            setErrorLink(null);
            setOpen(true);
          }}
          className="mt-4"
        >
          {T.accountDeleteButton}
        </Button>
      </section>

      <DeleteAccountModal
        open={open}
        phone={phone}
        onCancel={() => setOpen(false)}
        onConfirm={handleDelete}
        loading={loading}
        error={error}
        errorLink={errorLink}
        offerDeleteReviews={offerDeleteReviews}
      />
    </>
  );
}
