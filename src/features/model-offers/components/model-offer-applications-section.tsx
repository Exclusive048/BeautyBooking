"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import type { ApiResponse } from "@/lib/types/api";
import { UI_FMT } from "@/lib/ui/fmt";

type ModelApplicationStatus =
  | "PENDING"
  | "REJECTED"
  | "APPROVED_WAITING_CLIENT"
  | "CONFIRMED"
  | "ACCEPTED";

type ModelOfferApplication = {
  id: string;
  status: ModelApplicationStatus;
  clientNote: string | null;
  consentToShoot: boolean;
  proposedTimeLocal: string | null;
  confirmedStartAt: string | null;
  bookingId: string | null;
  createdAt: string;
  client: {
    id: string;
    displayName: string;
  };
  photos: Array<{ id: string; url: string }>;
};

type OfferApplicationsData = {
  offer: {
    id: string;
    dateLocal: string;
    timeRangeStartLocal: string;
    timeRangeEndLocal: string;
    status: string;
  };
  applications: ModelOfferApplication[];
};

type Props = {
  offerId: string;
  applicationsCount: number;
};

type ProposeTimeModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
  submitting: boolean;
  initialValue?: string | null;
  timeRange: { start: string; end: string } | null;
};

function extractApiError<T>(json: ApiResponse<T> | null, fallback: string): string {
  if (json && !json.ok) return json.error.message || fallback;
  return fallback;
}

function statusMeta(status: ModelApplicationStatus): { label: string; className: string } {
  if (status === "PENDING") {
    return {
      label: "На рассмотрении",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (status === "APPROVED_WAITING_CLIENT" || status === "ACCEPTED") {
    return {
      label: "Принята",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (status === "REJECTED") {
    return {
      label: "Отклонена",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }
  if (status === "CONFIRMED") {
    return {
      label: "Подтверждена",
      className: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }
  return {
    label: status,
    className: "border-border-subtle bg-bg-input text-text-main",
  };
}

function ProposeTimeModal({ open, onClose, onSubmit, submitting, initialValue, timeRange }: ProposeTimeModalProps) {
  const [value, setValue] = useState(initialValue?.trim() || timeRange?.start || "");
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalSurface open={open} onClose={onClose} title="Предложить время" className="max-w-md">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const normalized = value.trim();
          if (!normalized) {
            setError("Укажите время");
            return;
          }
          setError(null);
          await onSubmit(normalized);
        }}
      >
        <div>
          <label className="text-sm text-text-sec">Время встречи</label>
          <Input
            type="time"
            step={900}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-2"
            required
          />
          {timeRange ? (
            <p className="mt-2 text-xs text-text-sec">
              Доступный диапазон: {timeRange.start}-{timeRange.end}
            </p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-rose-500">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Сохраняем..." : "Предложить"}
          </Button>
        </div>
      </form>
    </ModalSurface>
  );
}

type ApplicationCardProps = {
  application: ModelOfferApplication;
  onPropose: (application: ModelOfferApplication) => void;
  onReject: (application: ModelOfferApplication) => Promise<void>;
  rejecting: boolean;
  proposing: boolean;
};

function ApplicationCard({ application, onPropose, onReject, rejecting, proposing }: ApplicationCardProps) {
  const status = statusMeta(application.status);
  const photo = application.photos[0]?.url ?? null;
  const isPending = application.status === "PENDING";
  const consentClass = application.consentToShoot
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <article className="rounded-2xl border border-border-subtle/80 bg-bg-card/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {photo ? (
            <Image
              src={photo}
              alt=""
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-input text-sm font-semibold text-text-sec">
              {application.client.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-main">{application.client.displayName}</p>
            <p className="text-xs text-text-sec">Отклик: {UI_FMT.dateTimeShort(application.createdAt)}</p>
          </div>
        </div>
        <Badge className={status.className}>{status.label}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge className={consentClass}>
          {application.consentToShoot ? "Согласие на съемку" : "Без согласия на съемку"}
        </Badge>
        {application.proposedTimeLocal ? (
          <Badge className="border-blue-200 bg-blue-50 text-blue-700">
            Предложено: {application.proposedTimeLocal}
          </Badge>
        ) : null}
        {application.confirmedStartAt ? (
          <Badge className="border-blue-200 bg-blue-50 text-blue-700">
            Подтверждено: {UI_FMT.dateTimeShort(application.confirmedStartAt)}
          </Badge>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl bg-bg-input/60 p-3">
        <p className="text-xs text-text-sec">Пожелания модели</p>
        <p className="mt-1 text-sm text-text-main">{application.clientNote?.trim() || "Без комментария"}</p>
      </div>

      {isPending ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => onPropose(application)} disabled={proposing || rejecting}>
            Предложить время
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void onReject(application)}
            disabled={proposing || rejecting}
            className="text-rose-500 hover:bg-rose-50 hover:text-rose-600"
          >
            {rejecting ? "Отклоняем..." : "Отклонить"}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export function ModelOfferApplicationsSection({ offerId, applicationsCount }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applications, setApplications] = useState<ModelOfferApplication[]>([]);
  const [timeRange, setTimeRange] = useState<{ start: string; end: string } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [selected, setSelected] = useState<ModelOfferApplication | null>(null);

  const visibleCount = loaded ? applications.length : applicationsCount;

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/master/model-offers/${offerId}/applications`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<OfferApplicationsData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(extractApiError(json, "Не удалось загрузить отклики"));
      }
      setApplications(Array.isArray(json.data.applications) ? json.data.applications : []);
      setTimeRange({
        start: json.data.offer.timeRangeStartLocal,
        end: json.data.offer.timeRangeEndLocal,
      });
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить отклики");
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useEffect(() => {
    if (!open || loaded || loading) return;
    void loadApplications();
  }, [loadApplications, loaded, loading, open]);

  const handleReject = useCallback(
    async (application: ModelOfferApplication) => {
      if (!window.confirm("Отклонить отклик?")) return;
      setRejectingId(application.id);
      setError(null);
      try {
        const res = await fetchWithAuth(`/api/master/model-applications/${application.id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ application: { id: string; status: string } }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(extractApiError(json, "Не удалось отклонить отклик"));
        }
        await loadApplications();
      } catch (rejectError) {
        setError(rejectError instanceof Error ? rejectError.message : "Не удалось отклонить отклик");
      } finally {
        setRejectingId(null);
      }
    },
    [loadApplications]
  );

  const handleProposeSubmit = useCallback(
    async (proposedTimeLocal: string) => {
      if (!selected) return;
      setProposing(true);
      setError(null);
      try {
        const res = await fetchWithAuth(`/api/master/model-applications/${selected.id}/propose-time`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposedTimeLocal }),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ application: { id: string; status: string } }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(extractApiError(json, "Не удалось предложить время"));
        }
        setSelected(null);
        await loadApplications();
      } catch (proposeError) {
        setError(proposeError instanceof Error ? proposeError.message : "Не удалось предложить время");
      } finally {
        setProposing(false);
      }
    },
    [loadApplications, selected]
  );

  const pendingCount = useMemo(
    () => applications.filter((application) => application.status === "PENDING").length,
    [applications]
  );

  return (
    <div className="rounded-2xl border border-border-subtle/80 bg-bg-card/60 p-3">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-main">Отклики ({visibleCount})</span>
          {loaded && pendingCount > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              Новые: {pendingCount}
            </span>
          ) : null}
        </div>
        <span className="text-xs text-text-sec">{open ? "Свернуть" : "Развернуть"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          {loading ? <p className="text-sm text-text-sec">Загружаем отклики...</p> : null}
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm text-rose-700">{error}</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => void loadApplications()} disabled={loading}>
                Повторить
              </Button>
            </div>
          ) : null}
          {!loading && !error && applications.length === 0 ? (
            <p className="text-sm text-text-sec">Пока нет откликов</p>
          ) : null}
          {!loading && !error
            ? applications.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  onPropose={setSelected}
                  onReject={handleReject}
                  rejecting={rejectingId === application.id}
                  proposing={proposing}
                />
              ))
            : null}
        </div>
      ) : null}

      <ProposeTimeModal
        key={`${selected?.id ?? "none"}:${selected?.proposedTimeLocal ?? ""}:${timeRange?.start ?? ""}`}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onSubmit={handleProposeSubmit}
        submitting={proposing}
        initialValue={selected?.proposedTimeLocal}
        timeRange={timeRange}
      />
    </div>
  );
}
