import type { StudioMasterDisplayStatus } from "@/features/studio-cabinet/masters/lib/status-display";
import type {
  StudioMasterDetail,
  StudioMasterListItem,
} from "@/features/studio-cabinet/masters/server/types";

/**
 * MOBILE-STUDIO-C (team) — чистые преобразования для JSON-чтений команды
 * студии в приложении (`/api/cabinet/studio/masters*`). Данные — те же
 * загрузчики, что у веб-страницы «Мастера студии»; здесь только форма ответа:
 * без веб-ссылок и веб-токенов, с разрешёнными действиями по правилу веб-шапки
 * карточки мастера и с матрицей услуг.
 *
 * Id мастера везде один — `Provider.id` профиля мастера В СТУДИИ: его ждут
 * `/api/studio/masters/{id}`, `/api/cabinet/studio/members/{memberId}/remove`,
 * `?masterId=` редактора расписания и `entityId` аватара.
 */

export type StudioMasterListItemJson = {
  id: string;
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  servicesSummary: string;
  status: StudioMasterDisplayStatus;
  isCurrentUser: boolean;
  metrics: StudioMasterListItem["metrics"];
};

/** Элемент списка: `urlHandle`/`providerId` веба не нужны (`providerId` = `id`). */
export function toStudioMasterListItemJson(item: StudioMasterListItem): StudioMasterListItemJson {
  return {
    id: item.id,
    userId: item.userId,
    displayName: item.displayName,
    avatarUrl: item.avatarUrl,
    servicesSummary: item.servicesSummary,
    status: item.status,
    isCurrentUser: item.isCurrentUser,
    metrics: item.metrics,
  };
}

export type StudioMasterActions = {
  pause: boolean;
  activate: boolean;
  remove: boolean;
  revokeInvite: boolean;
  resendInvite: boolean;
  editSchedule: boolean;
};

/**
 * Что можно сделать с мастером — правило веб-шапки карточки
 * (`master-detail-header.tsx`): приглашённого не ставят на паузу и не
 * исключают — его приглашение отзывают; работающего ставят на паузу, на паузе —
 * возвращают. Отозвать и повторить можно только заготовку без аккаунта (иначе
 * сервер ответит 409 `MASTER_NOT_INVITED`).
 */
export function studioMasterActions(input: {
  status: StudioMasterDisplayStatus;
  userId: string | null;
}): StudioMasterActions {
  const invited = input.status === "INVITED";
  const pendingStub = invited && input.userId === null;
  return {
    pause: input.status === "ACTIVE",
    activate: input.status === "DISABLED",
    remove: !invited,
    revokeInvite: pendingStub,
    resendInvite: pendingStub,
    editSchedule: !invited,
  };
}

export type StudioMasterDetailJson = StudioMasterListItemJson & {
  phone: string | null;
  email: string | null;
  joinedAt: string;
  clientsCount: number;
  averageCheckKopeks: number;
  weekSchedule: StudioMasterDetail["weekSchedule"];
  profile: StudioMasterDetail["profile"];
  blockingStudioBookings: number;
  actions: StudioMasterActions;
};

/** Карточка: без `viewToken` (веб-календарь) и `publicProfileUrl` (веб-ссылка). */
export function toStudioMasterDetailJson(detail: StudioMasterDetail): StudioMasterDetailJson {
  return {
    ...toStudioMasterListItemJson(detail),
    phone: detail.phone,
    email: detail.email,
    joinedAt: detail.joinedAt,
    clientsCount: detail.clientsCount,
    averageCheckKopeks: detail.averageCheckKopeks,
    weekSchedule: detail.weekSchedule,
    profile: detail.profile,
    blockingStudioBookings: detail.blockingStudioBookings,
    actions: studioMasterActions({ status: detail.status, userId: detail.userId }),
  };
}

/** Строка матрицы «услуга студии × мастер». Деньги — копейки. */
export type StudioMasterServicesMatrixRow = {
  serviceId: string;
  title: string;
  /** Услуга студии включена (выключенная — на паузе в каталоге студии). */
  isActive: boolean;
  basePriceKopeks: number;
  baseDurationMin: number;
  /** Мастер выполняет услугу. */
  isEnabled: boolean;
  priceOverrideKopeks: number | null;
  durationOverrideMin: number | null;
  commissionPct: number | null;
  /** Что заплатит клиент: своя цена мастера, иначе цена студии (как `booking-core`). */
  effectivePriceKopeks: number;
  effectiveDurationMin: number;
};

type MatrixService = {
  id: string;
  name: string;
  title: string | null;
  isActive: boolean;
  price: number;
  basePrice: number | null;
  durationMin: number;
  baseDurationMin: number | null;
};

type MatrixMasterRow = {
  serviceId: string;
  isEnabled: boolean;
  priceOverride: number | null;
  durationOverrideMin: number | null;
  commissionPct: number | null;
};

/**
 * Каждая услуга студии (в порядке каталога) со строкой мастера, если она есть.
 * Нет строки — мастер услугу не выполняет, своих цен нет. База — как в списке
 * услуг студии: `basePrice ?? price`, `baseDurationMin ?? durationMin`.
 */
export function buildStudioMasterServicesMatrix(
  services: readonly MatrixService[],
  masterRows: readonly MatrixMasterRow[],
): StudioMasterServicesMatrixRow[] {
  const byService = new Map(masterRows.map((row) => [row.serviceId, row]));
  return services.map((service) => {
    const row = byService.get(service.id);
    const basePriceKopeks = service.basePrice ?? service.price;
    const baseDurationMin = service.baseDurationMin ?? service.durationMin;
    const priceOverrideKopeks = row?.priceOverride ?? null;
    const durationOverrideMin = row?.durationOverrideMin ?? null;
    return {
      serviceId: service.id,
      title: service.title?.trim() || service.name,
      isActive: service.isActive,
      basePriceKopeks,
      baseDurationMin,
      isEnabled: row?.isEnabled ?? false,
      priceOverrideKopeks,
      durationOverrideMin,
      commissionPct: row?.commissionPct ?? null,
      effectivePriceKopeks: priceOverrideKopeks ?? basePriceKopeks,
      effectiveDurationMin: durationOverrideMin ?? baseDurationMin,
    };
  });
}
