import type { ScheduleRequestListItem } from "../server/list.service";
import {
  buildReviewPreview,
  buildSchedulePayloadPreview,
  type SchedulePayloadPreview,
} from "./payload-display";

/**
 * MOBILE-STUDIO-C (team) — заявка мастера на расписание для приложения
 * (`GET /api/cabinet/studio/schedule-requests`). Текст «что просит мастер» и
 * «было → стало» собирают те же форматтеры, что карточку на вебе
 * (`request-card.tsx`), — приложению не нужно переносить ~300 строк русского
 * форматирования. Сырые `payload`/`review` не отдаются.
 */

export type ScheduleReviewPreviewJson = {
  /** Сводка графика, действующего сейчас; `null` — графика нет. */
  current: string | null;
  days: Array<{ date: string; dateLabel: string; before: string; after: string }>;
};

export type ScheduleRequestJson = {
  id: string;
  status: ScheduleRequestListItem["status"];
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  provider: ScheduleRequestListItem["provider"];
  /** Открытая заявка, формат которой одобрение умеет применить. */
  canApprove: boolean;
  canReject: boolean;
  preview: SchedulePayloadPreview;
  reviewPreview: ScheduleReviewPreviewJson | null;
};

/** Форматы, которые применяет `POST …/requests/{id}/approve`; прочие — 422. */
const APPLICABLE_FORMATS: ReadonlySet<SchedulePayloadPreview["format"]> = new Set([
  "CHANGES_V1",
  "PATTERN_V1",
  "EDITOR_V1",
]);

export function toScheduleRequestJson(item: ScheduleRequestListItem): ScheduleRequestJson {
  const preview = buildSchedulePayloadPreview(item.payload);
  const pending = item.status === "PENDING";
  let reviewPreview: ScheduleReviewPreviewJson | null = null;
  if (item.review) {
    const built = buildReviewPreview(item.review);
    reviewPreview = {
      current: built.current,
      // Подпись даты — веба («07.10»), ключ — для приложения.
      days: item.review.days.map((day, index) => ({
        date: day.date,
        dateLabel: built.days[index]?.date ?? day.date,
        before: built.days[index]?.before ?? "",
        after: built.days[index]?.after ?? "",
      })),
    };
  }
  return {
    id: item.id,
    status: item.status,
    comment: item.comment,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    provider: item.provider,
    canApprove: pending && APPLICABLE_FORMATS.has(preview.format),
    canReject: pending,
    preview,
    reviewPreview,
  };
}
