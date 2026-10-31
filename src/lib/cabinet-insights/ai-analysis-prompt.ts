import { z } from "zod";

import { wrapUntrusted } from "@/lib/ai/prompts";
import { UI_FMT } from "@/lib/ui/fmt";
import { CABINET_LINK_KEYS, cabinetHref, isCabinetLinkKey } from "./links";
import {
  CABINET_AHEAD_DAYS,
  CABINET_HISTORY_DAYS,
  aheadLoad,
  type CabinetAnalysis,
  type CabinetAnalysisItem,
  type CabinetFacts,
  type CabinetLinkKey,
  type CabinetScope,
} from "./types";

/**
 * AI-CABINET-ANALYSIS — сводка кабинета для модели и разбор её ответа. Модуль
 * чистый: вызов модели, кэш и доступ — в `ai-analysis.ts` и роуте.
 *
 * Сводка — посчитанные кодом числа плюс свободный текст кабинета (название,
 * описание, услуги, имена мастеров, отзывы) в метках `wrapUntrusted`: правило
 * «между метками — данные» стоит в системном промпте (SEC-18). Телефонов, имён
 * клиентов и адресов в сводке нет — модели они не нужны.
 *
 * Ответу модели не доверяем: JSON вырезается из текста, проверяется схемой и
 * режется по длине, а ссылка — только ключ раздела из `links.ts`; адрес
 * подставляет код, поэтому разбор не может увести на чужую страницу.
 */

const MAX_SERVICES_IN_PROMPT = 30;
const MAX_MASTERS_IN_PROMPT = 20;

const WEEKDAY_SHORT: Record<number, string> = { 1: "пн", 2: "вт", 3: "ср", 4: "чт", 5: "пт", 6: "сб", 7: "вс" };

/** Подсказка модели, что за раздел стоит за ключом. */
const LINK_HINTS: Record<CabinetLinkKey, string> = {
  profile: "профиль: название, описание, фото, адрес, соцсети",
  services: "услуги и пакеты услуг",
  schedule: "настройки расписания и график работы",
  rules: "правила записи: за сколько можно записаться, отмена, подтверждение",
  visibility: "видимость страницы и приём новых клиентов",
  freeWindows: "свободные окошки на ближайшие дни",
  portfolio: "портфолио, фото работ",
  bookings: "журнал записей",
  clients: "клиенты",
  reviews: "отзывы и ответы на них",
  messages: "переписка с клиентами",
  analytics: "аналитика",
  billing: "подписка",
  hotSlots: "горящие окошки со скидкой",
  team: "мастера студии",
  teamSchedule: "график команды студии",
  inviteMaster: "пригласить мастера в студию",
};

function yesNo(value: boolean): string {
  return value ? "да" : "нет";
}

function percentOrDash(value: number | null): string {
  return value === null ? "нет данных" : `${Math.round(value * 100)}%`;
}

function hoursLabel(minutes: number): string {
  return `${UI_FMT.decimal(minutes / 60, 0)} ч`;
}

function availableLinks(scope: CabinetScope): CabinetLinkKey[] {
  return CABINET_LINK_KEYS.filter((key) => cabinetHref(scope, key) !== null);
}

export function buildCabinetAnalysisPrompt(facts: CabinetFacts): string {
  const { profile, bookings: b, schedule, rules, reviews } = facts;
  const lines: string[] = [];
  const push = (line: string) => lines.push(line);

  push(`Кабинет: ${facts.scope === "studio" ? "студия" : "мастер"}`);
  push(`Название: ${wrapUntrusted(profile.name, 80)}`);
  push(`Описание: ${profile.description ? wrapUntrusted(profile.description, 1200) : "нет"}`);
  push(
    `Фото профиля: ${yesNo(profile.hasAvatar)}; адрес: ${yesNo(profile.hasAddress)}; страница видна клиентам: ${yesNo(profile.isPublished)}; ссылки на соцсети: ${yesNo(profile.hasSocials)}`,
  );

  push("");
  push(`Услуги (${facts.services.length}):`);
  for (const service of facts.services.slice(0, MAX_SERVICES_IN_PROMPT)) {
    push(
      `- ${wrapUntrusted(service.name, 80)}: ${UI_FMT.priceLabel(service.priceKopeks)}, ${UI_FMT.durationLabel(service.durationMin)}, описание: ${yesNo(service.hasDescription)}, записей за ${CABINET_HISTORY_DAYS} дней: ${service.bookings}`,
    );
  }
  if (facts.services.length > MAX_SERVICES_IN_PROMPT) {
    push(`- и ещё ${facts.services.length - MAX_SERVICES_IN_PROMPT}`);
  }
  push(`Пакетов услуг: ${facts.packagesCount}`);
  push(`Работ в портфолио: ${facts.portfolioCount}`);

  push("");
  push(`Расписание на ${CABINET_AHEAD_DAYS} дней вперёд: рабочих дней ${schedule.workingDaysAhead}, рабочего времени ${hoursLabel(schedule.workMinutesAhead)}, занято записями ${percentOrDash(aheadLoad(schedule))}`);
  push(`Расписание настроено до: ${schedule.configuredUntil ?? "без даты окончания"}`);
  push(
    `Правила записи: записаться можно не позже чем за ${rules.minBookingHoursAhead} ч и не дальше чем на ${rules.maxBookingDaysAhead} дн. вперёд; бесплатная отмена: ${rules.cancellationDeadlineHours === null ? "в любой момент" : `за ${rules.cancellationDeadlineHours} ч`}; записи подтверждаются автоматически: ${yesNo(rules.autoConfirmBookings)}; напоминания клиентам: ${yesNo(rules.remindersEnabled)}; новые клиенты принимаются: ${yesNo(rules.acceptNewClients)}`,
  );
  if (facts.scope === "master") {
    push(`Горящие окошки со скидкой: доступны в тарифе: ${yesNo(facts.hotSlots.allowed)}, включены: ${yesNo(facts.hotSlots.enabled)}`);
  }

  push("");
  push(`Записи за ${CABINET_HISTORY_DAYS} дней: всего ${b.past}, состоялись ${b.completed}, отменил клиент ${b.cancelledByClient}, отменили вы ${b.cancelledByProvider}, отменились без подтверждения ${b.expiredUnconfirmed}, неявки ${b.noShow}`);
  push(`Предстоящих записей на ${CABINET_AHEAD_DAYS} дней: ${b.upcoming}`);
  push(
    `Онлайн-записей: ${percentOrDash(b.onlineShare)}; записываются в среднем за ${b.avgLeadHours === null ? "нет данных" : `${Math.round(b.avgLeadHours)} ч`} до визита; в последние сутки: ${percentOrDash(b.lastMinuteShare)}`,
  );
  push(`Клиентов: ${b.uniqueClients}, пришли повторно: ${b.returningClients}`);
  if (b.busiestWeekdays.length > 0) {
    push(`Самые загруженные дни: ${b.busiestWeekdays.map((day) => WEEKDAY_SHORT[day] ?? String(day)).join(", ")}`);
  }
  push(`Время визитов: утро ${b.timeOfDay.morning}, день ${b.timeOfDay.day}, вечер ${b.timeOfDay.evening}`);

  push("");
  push(`Отзывы: ${reviews.count}, средняя оценка: ${reviews.avg === null ? "нет" : UI_FMT.decimal(reviews.avg, 1)}, без ответа: ${reviews.unanswered}`);
  for (const review of reviews.recent) {
    push(`- [${review.rating}/5] ${wrapUntrusted(review.text, 300)}`);
  }

  if (facts.scope === "studio") {
    push("");
    push(`Мастера студии (${facts.masters.length}):`);
    for (const master of facts.masters.slice(0, MAX_MASTERS_IN_PROMPT)) {
      push(
        `- ${wrapUntrusted(master.name, 60)}: услуг ${master.servicesCount}, рабочих дней на ${CABINET_AHEAD_DAYS} дней ${master.workingDaysAhead}, занято ${percentOrDash(aheadLoad(master))}, визитов за ${CABINET_HISTORY_DAYS} дней ${master.completed}`,
      );
    }
    push(`Приглашений без ответа: ${facts.pendingInvites}`);
    push(`Фото студии без подписи, кто из мастеров делал работу: ${facts.photosWithoutPerformer}`);
  }

  push("");
  push("Разделы для поля link (ключ — что там):");
  for (const key of availableLinks(facts.scope)) {
    push(`- ${key} — ${LINK_HINTS[key]}`);
  }

  return lines.join("\n");
}

// ── Ответ модели ─────────────────────────────────────────────────────────────

const MAX_SUMMARY = 700;
const MAX_STRENGTHS = 4;
const MAX_STRENGTH = 300;
const MAX_IMPROVEMENTS = 6;
const MAX_TITLE = 120;
const MAX_TEXT = 700;

const responseSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.unknown()).optional(),
  improvements: z.array(z.unknown()),
});

const improvementSchema = z.object({
  title: z.string(),
  text: z.string(),
  link: z.unknown().optional(),
});

/** Убирает разметку, которую модель иногда дописывает, и подделку меток данных. */
function cleanText(value: string, max: number): string {
  return value
    .replace(/<<<\/?[^>]*>>>/g, " ")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function resolveItemHref(scope: CabinetScope, link: unknown): string | null {
  return isCabinetLinkKey(link) ? cabinetHref(scope, link) : null;
}

/** `null` — ответ непригоден: нет JSON, нет итога или ни одного совета. */
export function parseCabinetAnalysis(raw: string, scope: CabinetScope, now: Date = new Date()): CabinetAnalysis | null {
  const parsed = responseSchema.safeParse(extractJsonObject(raw));
  if (!parsed.success) return null;

  const summary = cleanText(parsed.data.summary, MAX_SUMMARY);
  const strengths = (parsed.data.strengths ?? [])
    .filter((item): item is string => typeof item === "string")
    .map((item) => cleanText(item, MAX_STRENGTH))
    .filter((item) => item.length > 0)
    .slice(0, MAX_STRENGTHS);

  const improvements: CabinetAnalysisItem[] = [];
  for (const item of parsed.data.improvements) {
    const one = improvementSchema.safeParse(item);
    if (!one.success) continue;
    const title = cleanText(one.data.title, MAX_TITLE);
    const text = cleanText(one.data.text, MAX_TEXT);
    if (!title || !text) continue;
    improvements.push({ title, text, href: resolveItemHref(scope, one.data.link) });
    if (improvements.length >= MAX_IMPROVEMENTS) break;
  }

  if (!summary || improvements.length === 0) return null;
  return { summary, strengths, improvements, generatedAt: now.toISOString() };
}

const cachedSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  // Ссылка — только раздел кабинета: в кэше могла лежать строка любой формы.
  improvements: z.array(
    z.object({ title: z.string(), text: z.string(), href: z.string().startsWith("/cabinet/").nullable() }),
  ),
  generatedAt: z.string(),
});

/** Разбор из кэша — проверяется формой, чтобы прежняя версия не уронила главную. */
export function readCachedCabinetAnalysis(value: unknown): CabinetAnalysis | null {
  const parsed = cachedSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
