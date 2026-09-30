import "server-only";

import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { SCHEDULE_SNAPSHOT_TX_OPTIONS } from "@/lib/schedule/editor";
import { findPatternConflicts, type PatternConflict } from "@/lib/schedule/pattern-conflicts";
import {
  normalizeRequestTemplates,
  patternRequestSchema,
  patternWithTemplateRefs,
  type PatternRequest,
} from "@/lib/schedule/pattern-request";
import {
  deleteUnusedAutoTemplatesTx,
  normalizePatternInput,
  setScheduleEndTx,
  writeSchedulePeriodTx,
} from "@/lib/schedule/patterns";
import { ensureAutoTemplateTx, ensurePaletteTemplateTx } from "@/lib/schedule/patterns-core";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";
import { toLocalDateKey } from "@/lib/schedule/timezone";

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — применение и предпросмотр графика из
 * пошагового окна. Роуты (`/api/cabinet/master/schedule/pattern`) отвечают за
 * доступ; здесь — одна транзакция на шаблоны и период, инвалидация кэша после
 * коммита и список записей, которые новый график оставил на выходных или вне
 * часов (записи не трогаются — решение владельца).
 */

async function loadTimezone(providerId: string): Promise<string> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { timezone: true },
  });
  if (!provider) throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  return provider.timezone;
}

function prepare(request: PatternRequest, timezone: string, now: Date) {
  const todayKey = toLocalDateKey(now, timezone);
  const templates = normalizeRequestTemplates(request);
  const pattern = normalizePatternInput(patternWithTemplateRefs(request), todayKey);
  return { templates, pattern, todayKey };
}

/** Какие записи окажутся на выходных или вне часов — без записи графика. */
export async function previewSchedulePattern(
  providerId: string,
  request: PatternRequest,
  now = new Date(),
): Promise<{ conflicts: PatternConflict[] }> {
  const timezone = await loadTimezone(providerId);
  const { templates, pattern } = prepare(request, timezone, now);
  const conflicts = await findPatternConflicts({
    providerId,
    timezone,
    pattern,
    templateFor: (ref) => templates[Number(ref)] ?? null,
    afterEndCloses: !request.pattern.resumePrevious,
    now,
  });
  return { conflicts };
}

/** Рабочие дни и период графика из запроса — внутри транзакции вызывающего. */
async function writePatternTx(
  tx: Prisma.TransactionClient,
  providerId: string,
  request: PatternRequest,
  templates: ReturnType<typeof normalizeRequestTemplates>,
  pattern: ReturnType<typeof normalizePatternInput>,
): Promise<void> {
  const ids: string[] = [];
  for (const [index, template] of templates.entries()) {
    const label = request.templates[index]?.label;
    ids.push(
      label
        ? await ensurePaletteTemplateTx(tx, providerId, {
            ...template,
            label,
            color: request.templates[index]?.color ?? null,
          })
        : await ensureAutoTemplateTx(tx, providerId, template),
    );
  }
  await writeSchedulePeriodTx(
    tx,
    providerId,
    {
      ...pattern,
      days: pattern.days.map((ref) => (ref === null ? null : ids[Number(ref)] ?? null)),
    },
    { resumePrevious: request.pattern.resumePrevious },
  );
  await deleteUnusedAutoTemplatesTx(tx, providerId);
}

/**
 * График из запроса внутри ЧУЖОЙ транзакции (одобрение заявки студии пишет
 * график, неделю и дни календаря одной транзакцией, этап 4). Запрос — уже
 * приведённый к сегодняшнему дню (`patternRequestForApproval`).
 */
export async function applyPatternRequestTx(
  tx: Prisma.TransactionClient,
  providerId: string,
  request: PatternRequest,
  todayKey: string,
): Promise<void> {
  const templates = normalizeRequestTemplates(request);
  const pattern = normalizePatternInput(patternWithTemplateRefs(request), todayKey);
  await writePatternTx(tx, providerId, request, templates, pattern);
}

/** Записать график. Возвращает записи, которые он оставил на выходных или вне часов. */
export async function applySchedulePattern(
  providerId: string,
  request: PatternRequest,
  now = new Date(),
): Promise<{ conflicts: PatternConflict[] }> {
  const timezone = await loadTimezone(providerId);
  const { templates, pattern } = prepare(request, timezone, now);

  await prisma.$transaction(
    (tx: Prisma.TransactionClient) => writePatternTx(tx, providerId, request, templates, pattern),
    SCHEDULE_SNAPSHOT_TX_OPTIONS,
  );

  // После коммита: до него сбрасывать нечего, а откат оставил бы кэш вычищенным.
  await invalidateSlotsForMaster(providerId);

  const conflicts = await findPatternConflicts({
    providerId,
    timezone,
    pattern,
    templateFor: (ref) => templates[Number(ref)] ?? null,
    afterEndCloses: !request.pattern.resumePrevious,
    now,
  });
  return { conflicts };
}

/**
 * SCHEDULE-PATTERNS-01 (этап 4) — одобрение заявки мастера в формате графика.
 * Заявка могла пролежать: дата начала в прошлом сдвигается на сегодня (прошлое
 * не переписывается никогда), а график, который кончился до сегодня, применять
 * нечем — 422 с просьбой отправить заявку заново. Проверка тела — той же
 * схемой, что у окна.
 */
export async function approvePatternChangeRequest(
  providerId: string,
  rawRequest: unknown,
  now = new Date(),
): Promise<{ conflicts: PatternConflict[] }> {
  const timezone = await loadTimezone(providerId);
  const request = patternRequestForApproval(rawRequest, toLocalDateKey(now, timezone));
  return applySchedulePattern(providerId, request, now);
}

/** Тело заявки → запрос графика на сегодня (чистая часть одобрения). */
export function patternRequestForApproval(rawRequest: unknown, todayKey: string): PatternRequest {
  const parsed = patternRequestSchema.safeParse(rawRequest);
  if (!parsed.success) {
    throw new AppError("Заявка в старом формате.", 400, "INVALID_BODY");
  }
  const request = parsed.data;
  if (request.pattern.endsOn !== null && request.pattern.endsOn < todayKey) {
    throw new AppError(
      "График в заявке уже закончился. Попросите мастера отправить заявку заново.",
      422,
      "INVALID_REQUEST_PAYLOAD",
    );
  }
  const startsOn = request.pattern.startsOn < todayKey ? todayKey : request.pattern.startsOn;
  return { ...request, pattern: { ...request.pattern, startsOn } };
}

/** «Настроено до» / «Продлевать автоматически» (`endsOn = null`). */
export async function setScheduleEnd(providerId: string, endsOn: string | null, now = new Date()): Promise<void> {
  const timezone = await loadTimezone(providerId);
  const todayKey = toLocalDateKey(now, timezone);
  await prisma.$transaction(
    (tx: Prisma.TransactionClient) => setScheduleEndTx(tx, providerId, endsOn, todayKey),
    SCHEDULE_SNAPSHOT_TX_OPTIONS,
  );
  await invalidateSlotsForMaster(providerId);
}
