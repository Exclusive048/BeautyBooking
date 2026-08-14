"use client";

import { useState } from "react";
import { FormDialog } from "@/components/ui/form-dialog";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  open: boolean;
  onClose: () => void;
  requestId: string;
  providerName: string;
  onResolved: () => void;
};

const T = UI_TEXT.studioCabinet.scheduleRequests.approveDialog;
const E = UI_TEXT.studioCabinet.scheduleRequests.errors;

export function ApproveDialog({ open, onClose, requestId, providerName, onResolved }: Props) {
  const [error, setError] = useState<string | null>(null);

  /**
   * FIX-C8 · fromServer = ПОКАЗАТЬ СЕРВЕРНОЕ, и попутно закрыт живой дефект
   * рендера.
   *
   * 🔴 Прежний код читал тело как `{ error?: string }`, но конверт проекта
   * держит в `error` ОБЪЕКТ (`{ message, code }` — `lib/api/contracts.ts`).
   * Значит `body?.error ?? E.approveFailed` никогда не подставлял запасную
   * строку (объект истинный) и клал объект в проп `error?: string | null`
   * `FormDialog`, который печатает его прямо в JSX. То есть ЛЮБОЙ отказ этого
   * эндпоинта не «показывал не тот текст», а ронял диалог в error boundary
   * («Objects are not valid as a React child»). Каст скрывал это от
   * `typecheck`. Второй такой сайт был ровно один — `reject-dialog.tsx`.
   *
   * Показывать сервер тут правильно по существу: одобрение заявки на смену
   * расписания отбивается конкретными причинами (`BREAK_OVERLAP`,
   * `BREAK_RANGE`, `BREAKS_LIMIT`, `TIME_RANGE_INVALID`, `DAY_INVALID`), и
   * админ студии без них не знает, ЧТО в присланном мастером расписании
   * поправить.
   */
  async function handleSubmit() {
    setError(null);
    try {
      await fetchJson(`/api/studio/schedule/requests/${requestId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
    } catch (caught) {
      setError(serverMessageOr(caught, E.approveFailed));
      return;
    }
    onResolved();
    onClose();
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={T.title}
      submitLabel={T.confirm}
      cancelLabel={T.cancel}
      onSubmit={handleSubmit}
      error={error}
    >
      <p className="text-sm text-text-sec">
        {T.body.replace("{provider}", providerName)}
      </p>
    </FormDialog>
  );
}
