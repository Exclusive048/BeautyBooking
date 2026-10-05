import type {
  ContentReportReason,
  ContentReportStatus,
  ContentReportTargetType,
} from "@prisma/client";

/** Вкладка очереди жалоб: `?status=new|resolved|dismissed|all`, по умолчанию — новые. */
export type AdminReportStatusTab = "new" | "resolved" | "dismissed" | "all";

/** Фильтр по типу цели: `?type=PROVIDER|…`, пусто — все. */
export type AdminReportTypeFilter = ContentReportTargetType | "all";

export type AdminReportRow = {
  id: string;
  targetType: ContentReportTargetType;
  reason: ContentReportReason;
  comment: string | null;
  status: ContentReportStatus;
  createdAt: string;
  /** NEW и старше 24 часов — срок ответа на жалобу вышел. */
  isOverdue: boolean;
  reporter: {
    userId: string;
    /** «Анна И.» — узнаваемо, без полного имени на экране. */
    display: string;
  };
  target: {
    /** Что это: имя мастера, «Отзыв ★2 о …», подпись работы, дата предложения. */
    title: string;
    /** Текст отзыва / сообщения / подпись — то, что модератор оценивает. */
    excerpt: string | null;
    /** Фото работы (только PORTFOLIO_ITEM). */
    imageUrl: string | null;
    /** Публичная страница цели на сайте, если она есть. */
    publicUrl: string | null;
    /** Цель удалена или скрыта после жалобы. */
    missing: boolean;
  };
  /** Автор контента — ссылка на «Пользователи» (блокировка аккаунта). */
  offender: {
    userId: string;
    display: string;
  } | null;
  /** REVIEW: отзыв в разделе «Отзывы» (там его удаляют). */
  reviewModerationUrl: string | null;
  resolution: {
    at: string;
    byDisplay: string | null;
    note: string | null;
  } | null;
};

export type AdminReportsCounts = {
  new: number;
  resolved: number;
  dismissed: number;
  all: number;
  /** NEW старше 24 часов. */
  overdue: number;
  /** Жалобы мастеров на отзывы о себе — живут в «Отзывах». */
  reportedReviews: number;
};

export type AdminReportsListResponse = {
  items: AdminReportRow[];
  nextCursor: string | null;
};
