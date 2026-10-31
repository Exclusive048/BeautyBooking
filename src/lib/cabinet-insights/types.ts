/**
 * AI-CABINET-ANALYSIS — факты кабинета для главной: из них строятся советы
 * (`tips.ts`, правила) и ИИ-разбор (`ai-analysis.ts`). Модуль без `server-only`:
 * типы и чистые функции читают и клиентские компоненты главной.
 *
 * Факты — то, что известно наверняка, без оценок: оценку даёт правило совета
 * или модель. Время — salon-tz кабинета (rule 17): дни недели и время суток
 * записей считаются в поясе салона.
 */

export type CabinetScope = "master" | "studio";

/** Окно истории записей, по которому считаются доли и средние. */
export const CABINET_HISTORY_DAYS = 90;
/** Окно «впереди»: загрузка и предстоящие записи. */
export const CABINET_AHEAD_DAYS = 14;

export type CabinetServiceFact = {
  name: string;
  priceKopeks: number;
  durationMin: number;
  hasDescription: boolean;
  /** Записей на услугу за окно истории (кроме отменённых). */
  bookings: number;
};

export type CabinetBookingFacts = {
  /** Записи, чьё начало уже наступило, за окно истории — все статусы. */
  past: number;
  /** Состоялись: завершённые и подтверждённые, чей визит прошёл. */
  completed: number;
  cancelledByClient: number;
  cancelledByProvider: number;
  /** Отменились сами: их не подтвердили вовремя (PENDING-EXPIRY). */
  expiredUnconfirmed: number;
  noShow: number;
  /** Живые записи на окно «впереди». */
  upcoming: number;
  /** Доля онлайн-записей (страница, приложение) среди прошедших. */
  onlineShare: number | null;
  /** Средний срок «записался → визит», часы; только онлайн-записи. */
  avgLeadHours: number | null;
  /** Доля онлайн-записей, сделанных меньше чем за сутки до визита. */
  lastMinuteShare: number | null;
  uniqueClients: number;
  /** Клиенты с двумя и больше состоявшимися визитами за окно. */
  returningClients: number;
  /** Самые занятые дни недели салона, 1 = пн … 7 = вс; до двух. */
  busiestWeekdays: number[];
  /** Время суток начала состоявшихся визитов (salon-tz). */
  timeOfDay: { morning: number; day: number; evening: number };
};

export type CabinetScheduleFacts = {
  /** Рабочих дней в окне «впереди» по движку расписания. */
  workingDaysAhead: number;
  /** Рабочих минут в окне «впереди». */
  workMinutesAhead: number;
  /** Минут, занятых живыми записями в окне «впереди». */
  bookedMinutesAhead: number;
  /** Дата салона, до которой настроено расписание; `null` — продлевается само или графика нет. */
  configuredUntil: string | null;
};

export type CabinetReviewFacts = {
  count: number;
  avg: number | null;
  unanswered: number;
  /** Последние отзывы с текстом — только для ИИ-разбора, в промпт идут метками. */
  recent: Array<{ rating: number; text: string }>;
};

export type CabinetRulesFacts = {
  minBookingHoursAhead: number;
  maxBookingDaysAhead: number;
  cancellationDeadlineHours: number | null;
  autoConfirmBookings: boolean;
  remindersEnabled: boolean;
  acceptNewClients: boolean;
};

export type CabinetProfileFacts = {
  name: string;
  /** Описание целиком — только для ИИ-разбора. */
  description: string | null;
  hasAvatar: boolean;
  hasAddress: boolean;
  isPublished: boolean;
  hasSocials: boolean;
};

type CommonFacts = {
  timeZone: string;
  profile: CabinetProfileFacts;
  services: CabinetServiceFact[];
  packagesCount: number;
  portfolioCount: number;
  bookings: CabinetBookingFacts;
  schedule: CabinetScheduleFacts;
  reviews: CabinetReviewFacts;
  rules: CabinetRulesFacts;
};

export type MasterCabinetFacts = CommonFacts & {
  scope: "master";
  hotSlots: { allowed: boolean; enabled: boolean };
};

export type StudioMasterFact = {
  name: string;
  servicesCount: number;
  workingDaysAhead: number;
  workMinutesAhead: number;
  bookedMinutesAhead: number;
  completed: number;
};

export type StudioCabinetFacts = CommonFacts & {
  scope: "studio";
  masters: StudioMasterFact[];
  pendingInvites: number;
  /** Фото студии без подписи «кто из мастеров делал». */
  photosWithoutPerformer: number;
};

export type CabinetFacts = MasterCabinetFacts | StudioCabinetFacts;

/** Доля занятого рабочего времени в окне «впереди», 0..1; `null` — рабочих часов нет. */
export function aheadLoad(schedule: Pick<CabinetScheduleFacts, "workMinutesAhead" | "bookedMinutesAhead">): number | null {
  if (schedule.workMinutesAhead <= 0) return null;
  return Math.min(1, schedule.bookedMinutesAhead / schedule.workMinutesAhead);
}

// ── Советы и разбор: форма, которую видит главная ────────────────────────────

/** Куда ведёт совет или пункт разбора — только разделы кабинета, без внешних ссылок. */
export type CabinetLinkKey =
  | "profile"
  | "services"
  | "schedule"
  | "rules"
  | "visibility"
  | "freeWindows"
  | "portfolio"
  | "bookings"
  | "clients"
  | "reviews"
  | "messages"
  | "analytics"
  | "billing"
  | "hotSlots"
  | "team"
  | "teamSchedule"
  | "inviteMaster";

export type CabinetTip = {
  id: string;
  title: string;
  text: string;
  action: { label: string; href: string };
};

export type CabinetAnalysisItem = {
  title: string;
  text: string;
  href: string | null;
};

export type CabinetAnalysis = {
  summary: string;
  strengths: string[];
  improvements: CabinetAnalysisItem[];
  /** ISO-момент генерации. */
  generatedAt: string;
};
