type SchemaObject = {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  properties?: Record<string, SchemaObject>;
  required?: readonly string[];
  items?: SchemaObject;
  enum?: readonly (string | number | boolean)[];
  format?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  /** MOBILE-AUTH-A2: форма PKCE-челленджа и verifier (`codeChallenge`, `codeVerifier`). */
  minLength?: number;
  pattern?: string;
  description?: string;
  /** GATES-FIX-01: валидный OpenAPI-ключ, понадобился для GuestConsentInput.marketing. */
  default?: string | number | boolean;
  /** MOBILE-MASTER-C: размер массива (`serviceIds` пакета — 2…20). */
  minItems?: number;
  maxItems?: number;
  nullable?: boolean;
  oneOf?: SchemaObject[];
  allOf?: SchemaObject[];
  $ref?: string;
  additionalProperties?: boolean | SchemaObject;
};

type ParameterObject = {
  name: string;
  /** MOBILE-AUTH-A: `header` — заголовки метаданных клиента (`X-App-Version` и пр.). */
  in: "path" | "query" | "header";
  required?: boolean;
  schema: SchemaObject;
  description?: string;
};

/** MOBILE-AUTH-A: схемы аутентификации (`components.securitySchemes`). */
type SecuritySchemeObject = {
  type: "http" | "apiKey";
  scheme?: string;
  bearerFormat?: string;
  in?: "cookie" | "header" | "query";
  name?: string;
  description?: string;
};

type SecurityRequirementObject = Record<string, string[]>;

type RequestBodyObject = {
  required?: boolean;
  content: Record<string, { schema: SchemaObject }>;
};

type ResponseObject = {
  description: string;
  content?: {
    "application/json": {
      schema: SchemaObject;
    };
  };
};

type OperationObject = {
  /** MOBILE-AUTH-A: стабильное имя операции для генераторов клиентов (Flutter). */
  operationId?: string;
  summary?: string;
  /**
   * GATES-FIX-01: длинное пояснение к эндпоинту. `summary` — одна строка для
   * списка, `description` — место, где можно сказать то, что клиент обязан
   * знать (например: «consent обязателен для гостя, хотя поле optional»).
   */
  description?: string;
  tags?: string[];
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject>;
  /** Пустой объект в списке = «можно и без аутентификации». */
  security?: SecurityRequirementObject[];
};

type PathItemObject = {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
};

type OpenApiSpec = {
  openapi: "3.0.0" | "3.0.1" | "3.0.2" | "3.0.3" | "3.0.4";
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: { url: string; description?: string }[];
  tags?: { name: string; description?: string }[];
  paths: Record<string, PathItemObject>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    securitySchemes?: Record<string, SecuritySchemeObject>;
  };
};

const jsonResponse = (schema: SchemaObject, description = "OK"): ResponseObject => ({
  description,
  content: { "application/json": { schema } },
});

const okResponse = (dataSchema: SchemaObject, description = "OK"): ResponseObject =>
  jsonResponse(
    {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccess" },
        {
          type: "object",
          properties: { data: dataSchema },
          required: ["data"],
        },
      ],
    },
    description
  );

const errorResponse = (description = "Error"): ResponseObject =>
  jsonResponse({ $ref: "#/components/schemas/ApiError" }, description);

const providerIdParam: ParameterObject = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Provider or master id",
};

/** MOBILE-B3: ключ `/api/public/providers/{providerId}/…` — адрес профиля или CUID. */
const publicProviderKeyParam: ParameterObject = {
  name: "providerId",
  in: "path",
  required: true,
  schema: { type: "string", maxLength: 64 },
  description:
    "Адрес профиля (`publicUsername`; регистр не важен, старый адрес ведёт на текущий — как `/u/{username}`) " +
    "или CUID провайдера. Только опубликованные, иначе 404 `PROVIDER_NOT_FOUND`.",
};

const masterIdParam: ParameterObject = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Master provider id",
};

const serviceIdQuery: ParameterObject = {
  name: "serviceId",
  in: "query",
  required: true,
  schema: { type: "string" },
};

const fromQuery: ParameterObject = {
  name: "from",
  in: "query",
  required: true,
  schema: { type: "string", format: "date" },
  description: "Local date key (YYYY-MM-DD) in provider timezone, start inclusive.",
};

const toQuery: ParameterObject = {
  name: "to",
  in: "query",
  required: false,
  schema: { type: "string", format: "date" },
  description: "Local date key (YYYY-MM-DD), end exclusive.",
};

const limitQuery: ParameterObject = {
  name: "limit",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: 14 },
  description: "Page size (days).",
};

// RESCHEDULE-SELF-SLOT: окно этой брони не считается занятым (перенос).
// Только для сторон брони — её клиента либо владельца кабинета/админа
// студии; посторонний — 403, чужой исполнитель — 404, без сессии — 401.
const excludeBookingIdQuery: ParameterObject = {
  name: "excludeBookingId",
  in: "query",
  required: false,
  schema: { type: "string" },
  description:
    "Booking being rescheduled: its own window (and buffer) is not treated as occupied, and slots use that booking's own length (service snapshots). Requires a session of a party to that booking.",
};

// SCHEDULE-PATTERNS-01: чьё расписание (`resolveScheduleActor`) — личное по
// умолчанию, профиль в студии (`profile`) или мастер студии для её админа.
const SCHEDULE_ACTOR_PARAMETERS: ParameterObject[] = [
  { name: "profile", in: "query", required: false, schema: { type: "string" }, description: "Own studio profile id" },
  { name: "studioId", in: "query", required: false, schema: { type: "string" }, description: "Studio id (studio admin)" },
  { name: "masterId", in: "query", required: false, schema: { type: "string" }, description: "Master of that studio (studio admin)" },
];

const SCHEDULE_TIME: SchemaObject = { type: "string", description: "HH:MM, salon time" };

const SCHEDULE_PATTERN_REQUEST_SCHEMA: SchemaObject = {
  type: "object",
  properties: {
    templates: {
      type: "array",
      description:
        "Working days used by this schedule (0–28; none for the manual mode); pattern days reference them by index",
      items: {
        type: "object",
        properties: {
          label: {
            type: "string",
            maxLength: 40,
            description: "Palette name; a named day stays in the palette when unused",
          },
          color: { type: "string", enum: ["1", "2", "3", "4", "5", "6"], description: "Muted palette colour key" },
          startTime: SCHEDULE_TIME,
          endTime: SCHEDULE_TIME,
          breaks: {
            type: "array",
            items: {
              type: "object",
              properties: { start: SCHEDULE_TIME, end: SCHEDULE_TIME, title: { type: "string", nullable: true } },
              required: ["start", "end"],
            },
          },
          scheduleMode: { type: "string", enum: ["FLEXIBLE", "FIXED"] },
          fixedSlotTimes: { type: "array", items: SCHEDULE_TIME },
        },
        required: ["startTime", "endTime", "scheduleMode"],
      },
    },
    pattern: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["WEEK", "WEEKS", "CYCLE"] },
        cycleDays: { type: "integer", minimum: 1, maximum: 28 },
        anchorOn: { type: "string", format: "date", description: "Salon date of position 0 (a Monday for weeks)" },
        startsOn: { type: "string", format: "date", description: "First day, not in the past" },
        endsOn: {
          type: "string",
          format: "date",
          nullable: true,
          description: "Last day (at most 3 months ahead); null — extend automatically",
        },
        days: {
          type: "array",
          description: "Per position: index into templates, or null for a day off",
          items: { type: "integer", nullable: true },
        },
        resumePrevious: {
          type: "boolean",
          default: false,
          description: "After endsOn: false — no schedule; true — the previous schedule resumes",
        },
      },
      required: ["kind", "cycleDays", "anchorOn", "startsOn", "endsOn", "days"],
    },
  },
  required: ["templates", "pattern"],
};

const SCHEDULE_BREAKS_SCHEMA: SchemaObject = {
  type: "array",
  items: {
    type: "object",
    properties: { start: SCHEDULE_TIME, end: SCHEDULE_TIME, title: { type: "string", nullable: true } },
    required: ["start", "end"],
  },
};

const SCHEDULE_CALENDAR_SCHEMA: SchemaObject = {
  type: "object",
  properties: {
    timezone: { type: "string" },
    pending: {
      type: "object",
      nullable: true,
      description:
        "Studio-profile calendar: what the master already sent to the studio in the open request (null for other actors)",
      properties: {
        hasWeek: { type: "boolean" },
        hasPattern: { type: "boolean" },
        days: {
          type: "array",
          items: { type: "object", properties: { date: { type: "string", format: "date" }, action: { type: "object" } } },
        },
      },
    },
    studio: {
      type: "object",
      nullable: true,
      description:
        "Personal calendar of a master who also works in a studio: studio working days by date (read-only)",
      properties: { name: { type: "string" }, days: { type: "object" } },
    },
    todayKey: { type: "string", format: "date" },
    fromKey: { type: "string", format: "date" },
    lastKey: { type: "string", format: "date", description: "Last configurable day (today + 3 months)" },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
          past: { type: "boolean" },
          beyond: { type: "boolean" },
          isWorking: { type: "boolean" },
          start: { type: "string", nullable: true },
          end: { type: "string", nullable: true },
          fixed: { type: "boolean" },
          templateId: { type: "string", nullable: true },
          painted: { type: "boolean", description: "Changed in the calendar rather than taken from the schedule" },
          bookings: { type: "integer" },
        },
        required: ["date", "past", "beyond", "isWorking", "fixed", "painted", "bookings"],
      },
    },
  },
  required: ["timezone", "todayKey", "fromKey", "lastKey", "days"],
};

const SCHEDULE_PALETTE_DAY_SCHEMA: SchemaObject = {
  type: "object",
  properties: {
    label: { type: "string", maxLength: 40 },
    color: { type: "string", enum: ["1", "2", "3", "4", "5", "6"] },
    startTime: SCHEDULE_TIME,
    endTime: SCHEDULE_TIME,
    breaks: SCHEDULE_BREAKS_SCHEMA,
    scheduleMode: { type: "string", enum: ["FLEXIBLE", "FIXED"] },
    fixedSlotTimes: { type: "array", items: SCHEDULE_TIME },
  },
  required: ["label", "color", "startTime", "endTime", "scheduleMode"],
};

const SCHEDULE_PATTERN_CONFLICT_SCHEMA: SchemaObject = {
  type: "object",
  properties: {
    bookingId: { type: "string" },
    startAtUtc: { type: "string", format: "date-time" },
    endAtUtc: { type: "string", format: "date-time" },
    clientName: { type: "string", nullable: true },
    reason: { type: "string", enum: ["DAY_OFF", "OUTSIDE_HOURS"] },
  },
  required: ["bookingId", "startAtUtc", "endAtUtc", "clientName", "reason"],
};

// MOVE-PICKER-DURATION: студийный перенос этой записи к запрошенному мастеру.
const moveBookingIdQuery: ParameterObject = {
  name: "moveBookingId",
  in: "query",
  required: false,
  schema: { type: "string" },
  description:
    "Studio booking being moved to this master: slots use the window length the move will validate (all booking services, this master's durations); for the booking's own master its window is not occupied. Studio owner/admin only; foreign booking or master of another studio — 404.",
};

const manualWindowQuery: ParameterObject = {
  name: "manual",
  in: "query",
  required: false,
  schema: { type: "string", enum: ["1"] },
  description:
    "Operator window for manual booking (master / studio admin): minBookingHoursAhead is not applied, only past slots are hidden. Honoured only for the provider's own side; ignored otherwise.",
};

// MOBILE-STUDIO-C (ops) — общие схемы чтений кабинета студии для приложения
// (`/api/cabinet/studio/{dashboard,calendar,bookings,booking-options,notifications}`).
const STUDIO_OPS_TIME = (description?: string): SchemaObject => ({ type: "string", format: "date-time", description });
const STUDIO_OPS_TIME_NULLABLE: SchemaObject = { type: "string", format: "date-time", nullable: true };
const STUDIO_OPS_RUNTIME_STATUS: SchemaObject = {
  type: "string",
  enum: ["PENDING", "CONFIRMED", "CHANGE_REQUESTED", "REJECTED", "IN_PROGRESS", "FINISHED"],
  description: "Вычисляемый статус (`resolveBookingRuntimeStatus`): NEW→PENDING, начавшаяся — IN_PROGRESS, конец + 60 мин — FINISHED.",
};
const STUDIO_OPS_BOOKING_STATUS: SchemaObject = {
  type: "string",
  enum: ["NEW", "PENDING", "CONFIRMED", "CHANGE_REQUESTED", "REJECTED", "IN_PROGRESS", "PREPAID", "STARTED", "FINISHED", "CANCELLED", "NO_SHOW"],
};
const STUDIO_OPS_SIDE: SchemaObject = { type: "string", enum: ["CLIENT", "MASTER"], nullable: true };
const STUDIO_OPS_ACTIONS: SchemaObject = {
  type: "object",
  description:
    "Что владелец / администратор студии может сделать с записью сейчас (`lib/bookings/studio-actions.ts`): " +
    "confirm и acceptReschedule — POST /api/bookings/{id}/confirm; declineReschedule — POST /api/bookings/{id}/decline-reschedule; " +
    "move — PATCH /api/studio/bookings/{id}/move; cancel — POST /api/bookings/{id}/cancel, а при wholePackageOnly — " +
    "POST /api/bookings/package/{bookingPackageId}/cancel с обязательной причиной.",
  required: ["confirm", "acceptReschedule", "declineReschedule", "awaitingClient", "move", "cancel", "wholePackageOnly"],
  properties: {
    confirm: { type: "boolean" },
    acceptReschedule: { type: "boolean" },
    declineReschedule: { type: "boolean" },
    awaitingClient: { type: "boolean", description: "Клиенту предложено новое время — ждём его ответа." },
    move: { type: "boolean" },
    cancel: { type: "boolean" },
    wholePackageOnly: { type: "boolean" },
  },
};
const STUDIO_OPS_MASTER_REF: SchemaObject = {
  type: "object",
  required: ["id", "name", "avatarUrl", "specialization"],
  properties: {
    id: { type: "string", description: "Provider.id профиля мастера в студии." },
    name: { type: "string" },
    avatarUrl: { type: "string", nullable: true },
    specialization: { type: "string", nullable: true },
  },
};
const STUDIO_OPS_BOOKING_FIELDS: Record<string, SchemaObject> = {
  id: { type: "string" },
  startAtUtc: STUDIO_OPS_TIME(),
  endAtUtc: STUDIO_OPS_TIME(),
  durationMin: { type: "integer" },
  status: STUDIO_OPS_BOOKING_STATUS,
  runtimeStatus: STUDIO_OPS_RUNTIME_STATUS,
  source: { type: "string", enum: ["MANUAL", "WEB", "APP"] },
  master: STUDIO_OPS_MASTER_REF,
  serviceId: { type: "string" },
  serviceTitle: { type: "string" },
  priceKopeks: { type: "integer" },
  proposedStartAtUtc: STUDIO_OPS_TIME_NULLABLE,
  proposedEndAtUtc: STUDIO_OPS_TIME_NULLABLE,
  actionRequiredBy: STUDIO_OPS_SIDE,
  bookingPackageId: { type: "string", nullable: true },
  needsAnswer: { type: "boolean", description: "confirm || acceptReschedule || declineReschedule." },
  actions: STUDIO_OPS_ACTIONS,
};
const STUDIO_OPS_BOOKING_ITEM: SchemaObject = {
  type: "object",
  description: "Запись студии в списке — без телефона клиента (он только в карточке записи).",
  required: [...Object.keys(STUDIO_OPS_BOOKING_FIELDS), "client"],
  properties: {
    ...STUDIO_OPS_BOOKING_FIELDS,
    client: {
      type: "object",
      required: ["name", "isNewClient", "isVip"],
      properties: { name: { type: "string" }, isNewClient: { type: "boolean" }, isVip: { type: "boolean" } },
    },
  },
};
const STUDIO_OPS_KPI_TILE: SchemaObject = {
  type: "object",
  required: ["current", "previous", "delta", "tone"],
  properties: {
    current: { type: "number" },
    previous: { type: "number" },
    delta: { type: "number", nullable: true, description: "Проценты, п.п. (загрузка) или доля балла (рейтинг); null — сравнивать не с чем." },
    tone: { type: "string", enum: ["positive", "negative", "neutral"] },
  },
};
const STUDIO_OPS_HM_RANGE: SchemaObject = {
  type: "object",
  required: ["start", "end"],
  properties: { start: { type: "string", description: "HH:mm салона" }, end: { type: "string", description: "HH:mm салона" } },
};
const STUDIO_OPS_CHIP: SchemaObject = {
  type: "string",
  enum: ["all", "unread", "bookings", "cancellations", "reschedules", "reviews", "messages", "team", "finance", "system"],
};
const STUDIO_OPS_DATE_QUERY: ParameterObject = {
  name: "date",
  in: "query",
  required: false,
  schema: { type: "string", format: "date" },
  description: "Дата салона YYYY-MM-DD (настоящая); без неё — сегодня по салону.",
};
const STUDIO_OPS_CURSOR_QUERY: ParameterObject = {
  name: "cursor",
  in: "query",
  required: false,
  schema: { type: "string", maxLength: 64 },
  description: "Непрозрачный `nextCursor` предыдущей страницы; чужой — 400 «Список обновился. Загрузите его заново.».",
};
const STUDIO_OPS_LIMIT_QUERY: ParameterObject = {
  name: "limit",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
};
const studioOpsResponses = (data: SchemaObject, extra: Record<string, ResponseObject> = {}): Record<string, ResponseObject> => ({
  "200": okResponse(data),
  "401": errorResponse("UNAUTHORIZED"),
  "403": errorResponse("FORBIDDEN — нет студии или мастер студии («Этот раздел доступен владельцу студии.»)"),
  ...extra,
  "429": errorResponse("RATE_LIMITED"),
  "500": errorResponse("INTERNAL_ERROR"),
});

/**
 * MOBILE-AUTH-A — заголовки метаданных нативного клиента. Необязательны:
 * невалидное или отсутствующее значение просто не попадает в сессию.
 */
/**
 * MOBILE-B1 — город выдачи (`?city=<slug>`), общий для каталога и лент.
 * Разница «кука / явный параметр / CITY_NOT_FOUND» — в `lib/cities/server-city.ts`.
 */
const cityQuery: ParameterObject = {
  name: "city",
  in: "query",
  required: false,
  schema: { type: "string", maxLength: 64 },
  description:
    "MOBILE-B1: slug города из `GET /api/cities` (тот же, что кука `mr-city-slug` веба). Без параметра — " +
    "все города. Неизвестный или погашенный slug → 400 `CITY_NOT_FOUND` (выберите город заново). " +
    "Пустое значение — как отсутствующее.",
};

const catalogCityQuery: ParameterObject = {
  ...cityQuery,
  description:
    "MOBILE-B1: slug города из `GET /api/cities`; ГЛАВНЕЕ куки `mr-city-slug`. Без параметра — город из " +
    "куки (веб), без куки — все города. Неизвестный или погашенный slug → 400 `CITY_NOT_FOUND`.",
};

/** MOBILE-B1: публичные чтения — сессия необязательна (вошедшему — свой бюджет лимитов). */
const optionalAuth: SecurityRequirementObject[] = [{ bearerAuth: [] }, { cookieAuth: [] }, {}];

const mobileClientHeaders: ParameterObject[] = [
  {
    name: "X-Client-Platform",
    in: "header",
    required: false,
    schema: { type: "string", enum: ["ios", "android"] },
    description: "Платформа клиента. Иные значения игнорируются.",
  },
  {
    name: "X-App-Version",
    in: "header",
    required: false,
    schema: { type: "string", maxLength: 32 },
    description: "Версия приложения, напр. `1.0.0+12` (алфавит `[0-9A-Za-z.+-]`).",
  },
  {
    name: "X-Device-Name",
    in: "header",
    required: false,
    schema: { type: "string", maxLength: 100 },
    description:
      "Имя устройства для списка сессий; обрезается до 100 символов. Значение заголовка — Latin-1, " +
      "поэтому не-ASCII имя слать percent-encoded UTF-8 (`Uri.encodeComponent`).",
  },
  {
    name: "X-Installation-Id",
    in: "header",
    required: false,
    schema: { type: "string", maxLength: 64 },
    description: "Идентификатор установки (UUID v4), 8–64 символа `[A-Za-z0-9._-]`.",
  },
];

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "МастерРядом API",
    version: "0.1.0",
    description: "Minimal OpenAPI contract for МастерРядом public API.",
  },
  servers: [{ url: "/" }],
  tags: [
    {
      name: "mobile",
      description:
        "MOBILE-AUTH-A: эндпоинты нативного приложения. Сессия — токены в теле ответа, дальше " +
        "`Authorization: Bearer <accessToken>` на любых роутах (наравне с cookie `bh_session`).",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "MOBILE-AUTH-A: access-токен (HS256, ~2 ч) из /api/mobile/v1/auth/*. Принимается всеми " +
          "роутами наравне с cookie `bh_session`; заявлена схема Bearer — решает заголовок, кука " +
          "не читается. Протухший/отозванный токен → 401; клиент один раз делает refresh и повторяет.",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "bh_session",
        description: "Веб-сессия (httpOnly). Обновляется прокси по cookie `bh_refresh`.",
      },
    },
    schemas: {
      ApiSuccess: {
        type: "object",
        required: ["ok", "data"],
        properties: {
          ok: { type: "boolean", enum: [true] },
          data: {
            oneOf: [
              { $ref: "#/components/schemas/ProviderListData" },
              { $ref: "#/components/schemas/ProviderProfileData" },
              { $ref: "#/components/schemas/ProviderServicesData" },
              { $ref: "#/components/schemas/ProviderServiceData" },
                { $ref: "#/components/schemas/BookingListData" },
                { $ref: "#/components/schemas/BookingData" },
                { $ref: "#/components/schemas/AvailabilitySlotsData" },
                { $ref: "#/components/schemas/HotSlotRuleData" },
                { $ref: "#/components/schemas/HotSlotsData" },
                { $ref: "#/components/schemas/HotSlotsRunData" },
                { $ref: "#/components/schemas/WeeklyScheduleData" },
              { $ref: "#/components/schemas/CountData" },
              { $ref: "#/components/schemas/DeleteResult" },
              { $ref: "#/components/schemas/TelegramLinkData" },
              { $ref: "#/components/schemas/TelegramStatusData" },
              { $ref: "#/components/schemas/TelegramSettingsData" },
              { $ref: "#/components/schemas/TelegramWebhookData" },
              { $ref: "#/components/schemas/VkStatusData" },
              { $ref: "#/components/schemas/VkDisableData" },
              { $ref: "#/components/schemas/MediaAssetData" },
              { $ref: "#/components/schemas/MediaAssetListData" },
              { $ref: "#/components/schemas/ReviewData" },
              { $ref: "#/components/schemas/ReviewListData" },
              { $ref: "#/components/schemas/CanLeaveReviewData" },
              { $ref: "#/components/schemas/TimeBlockData" },
              { $ref: "#/components/schemas/StudioServicesData" },
              { $ref: "#/components/schemas/AssignMasterData" },
              { $ref: "#/components/schemas/StudioMasterData" },
              { $ref: "#/components/schemas/StudioMasterListData" },
              { $ref: "#/components/schemas/BulkUpdatedData" },
              { $ref: "#/components/schemas/StudioCategoryData" },
              { $ref: "#/components/schemas/MasterScheduleData" },
              { $ref: "#/components/schemas/MasterProfileData" },
              { $ref: "#/components/schemas/MasterPortfolioListData" },
              { $ref: "#/components/schemas/PortfolioFeedData" },
              { $ref: "#/components/schemas/PortfolioDetailData" },
              { $ref: "#/components/schemas/CatalogSearchData" },
              { $ref: "#/components/schemas/StudioBookingCreatedData" },
              { $ref: "#/components/schemas/StudioMasterScheduleData" },
              { $ref: "#/components/schemas/MeData" },
            ],
          },
        },
      },
      ApiError: {
        type: "object",
        required: ["ok", "error"],
        properties: {
          ok: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            required: ["message"],
            properties: {
              message: { type: "string" },
              code: { type: "string" },
              details: {
                type: "object",
                nullable: true,
                additionalProperties: true,
              },
            },
          },
        },
      },
      ProviderType: {
        type: "string",
        enum: ["MASTER", "STUDIO"],
      },
      ProviderService: {
        type: "object",
        required: ["id", "name", "durationMin", "price"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          durationMin: { type: "integer" },
          price: { type: "integer" },
        },
      },
      ProviderCard: {
        type: "object",
        required: [
          "id",
          "type",
          "name",
          "avatarUrl",
          "tagline",
          "rating",
          "reviews",
          "priceFrom",
          "address",
          "district",
          "categories",
          "availableToday",
        ],
        properties: {
          id: { type: "string" },
          type: { $ref: "#/components/schemas/ProviderType" },
          name: { type: "string" },
          avatarUrl: { type: "string", nullable: true },
          tagline: { type: "string" },
          rating: { type: "number" },
          reviews: { type: "integer" },
          priceFrom: { type: "integer" },
          address: { type: "string" },
          district: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          availableToday: { type: "boolean" },
        },
      },
      ProviderProfile: {
        allOf: [
          { $ref: "#/components/schemas/ProviderCard" },
          {
            type: "object",
            required: [
              "services",
              "studioId",
              "bannerUrl",
              "bannerCrop",
              "description",
              "geoLat",
              "geoLng",
              "timezone",
            ],
            properties: {
              services: {
                type: "array",
                items: { $ref: "#/components/schemas/ProviderService" },
              },
              studioId: { type: "string", nullable: true },
              bannerUrl: { type: "string", nullable: true },
              bannerCrop: {
                type: "object",
                nullable: true,
                required: ["x", "y", "width", "height"],
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                  width: { type: "number" },
                  height: { type: "number" },
                },
              },
              description: { type: "string", nullable: true },
              timezone: { type: "string" },
              geoLat: { type: "number", nullable: true },
              geoLng: { type: "number", nullable: true },
            },
          },
        ],
      },
      StudioPrivateProfile: {
        type: "object",
        required: [
          "id",
          "name",
          "tagline",
          "address",
          "district",
          "categories",
          "contactName",
          "contactPhone",
          "contactEmail",
          "description",
          "avatarUrl",
          "geoLat",
          "geoLng",
          "isPublished",
          "timezone",
          "bufferBetweenBookingsMin",
          "bannerAssetId",
          "bannerUrl",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          tagline: { type: "string" },
          address: { type: "string" },
          district: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          contactName: { type: "string", nullable: true },
          contactPhone: { type: "string", nullable: true },
          contactEmail: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          avatarUrl: { type: "string", nullable: true },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          isPublished: { type: "boolean" },
          timezone: { type: "string" },
          bufferBetweenBookingsMin: { type: "integer" },
          bannerAssetId: { type: "string", nullable: true },
          bannerUrl: { type: "string", nullable: true },
        },
      },
      StudioPortfolioAttributionItem: {
        type: "object",
        required: ["assetId", "performerId", "serviceId"],
        properties: {
          assetId: { type: "string" },
          performerId: { type: "string", nullable: true },
          serviceId: { type: "string", nullable: true },
        },
      },
      StudioPortfolioAttributionData: {
        type: "object",
        required: ["items", "masters", "services"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/StudioPortfolioAttributionItem" },
          },
          masters: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "name", "serviceIds"],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                serviceIds: { type: "array", items: { type: "string" } },
              },
            },
          },
          services: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "title"],
              properties: { id: { type: "string" }, title: { type: "string" } },
            },
          },
        },
      },
      StudioPrivateProfileData: {
        type: "object",
        required: ["studio"],
        properties: {
          studio: { $ref: "#/components/schemas/StudioPrivateProfile" },
        },
      },
      StudioPrivateProfileUpdateInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          tagline: { type: "string" },
          address: { type: "string" },
          district: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          contactName: { type: "string", nullable: true },
          contactPhone: { type: "string", nullable: true },
          contactEmail: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          isPublished: { type: "boolean" },
          timezone: { type: "string" },
          bannerAssetId: { type: "string", nullable: true },
          socialVk: { type: "string", nullable: true },
          socialInstagram: { type: "string", nullable: true },
          minBookingHoursAhead: { type: "integer" },
          maxBookingDaysAhead: { type: "integer" },
          cancellationDeadlineHours: { type: "integer", nullable: true },
          lateCancelAction: { type: "string", enum: ["none", "reminder", "fine"] },
          acceptNewClients: { type: "boolean" },
          remindersEnabled: { type: "boolean" },
        },
      },
      Service: {
        type: "object",
        required: ["id", "providerId", "name", "durationMin", "price", "isEnabled", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string" },
          providerId: { type: "string" },
          name: { type: "string" },
          durationMin: { type: "integer" },
          price: { type: "integer" },
          isEnabled: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
        BookingStatus: {
          type: "string",
          enum: [
            "PENDING",
            "CONFIRMED",
            "CHANGE_REQUESTED",
            "REJECTED",
            "IN_PROGRESS",
            "FINISHED",
          ],
        },
        DiscountType: {
          type: "string",
          enum: ["PERCENT", "FIXED"],
        },
        DiscountApplyMode: {
          type: "string",
          enum: ["ALL_SERVICES", "PRICE_FROM", "MANUAL"],
        },
        BookingCancelledBy: {
          type: "string",
          enum: ["CLIENT", "PROVIDER", "SYSTEM"],
        },
      BookingStatusUpdate: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: { type: "string" },
          status: { $ref: "#/components/schemas/BookingStatus" },
        },
      },
      BookingService: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
      BookingDto: {
        type: "object",
        required: [
          "id",
          "slotLabel",
          "status",
          "providerId",
          "service",
          "clientName",
          "clientPhone",
        ],
        properties: {
          id: { type: "string" },
          slotLabel: { type: "string" },
          status: { $ref: "#/components/schemas/BookingStatus" },
          providerId: { type: "string" },
          masterProviderId: { type: "string", nullable: true },
          startAtUtc: { type: "string", format: "date-time", nullable: true },
          endAtUtc: { type: "string", format: "date-time", nullable: true },
          clientName: { type: "string" },
          clientPhone: { type: "string" },
          comment: { type: "string", nullable: true },
          service: { $ref: "#/components/schemas/BookingService" },
        },
      },
        AvailabilitySlot: {
          type: "object",
          required: ["startAtUtc", "endAtUtc", "label"],
          properties: {
            startAtUtc: { type: "string", format: "date-time" },
            endAtUtc: { type: "string", format: "date-time" },
            label: { type: "string" },
            isHot: { type: "boolean" },
            discountType: { $ref: "#/components/schemas/DiscountType" },
            discountValue: { type: "integer" },
          },
        },
      AvailabilitySlotsMeta: {
        type: "object",
        required: ["fromDate", "toDateExclusive", "totalDays", "hasMore", "pageSize"],
        properties: {
          fromDate: { type: "string", format: "date" },
          toDateExclusive: { type: "string", format: "date" },
          totalDays: { type: "integer" },
          hasMore: { type: "boolean" },
          pageSize: { type: "integer" },
          stale: { type: "boolean" },
        },
      },
      ScheduleBreak: {
        type: "object",
        required: ["startLocal", "endLocal"],
        properties: {
          startLocal: { type: "string" },
          endLocal: { type: "string" },
        },
      },
      WeeklyScheduleItem: {
        type: "object",
        required: ["dayOfWeek", "startLocal", "endLocal"],
        properties: {
          dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
          startLocal: { type: "string" },
          endLocal: { type: "string" },
          breaks: { type: "array", items: { $ref: "#/components/schemas/ScheduleBreak" } },
        },
      },
      ProviderListData: {
        type: "object",
        required: ["providers", "nextCursor"],
        properties: {
          providers: { type: "array", items: { $ref: "#/components/schemas/ProviderCard" } },
          nextCursor: { type: "string", nullable: true },
        },
      },
      ProviderProfileData: {
        type: "object",
        required: ["provider"],
        properties: {
          provider: { $ref: "#/components/schemas/ProviderProfile" },
        },
      },
      ProviderServicesData: {
        type: "object",
        required: ["services"],
        properties: {
          services: { type: "array", items: { $ref: "#/components/schemas/ProviderService" } },
        },
      },
      ProviderServiceData: {
        type: "object",
        required: ["service"],
        properties: {
          service: { $ref: "#/components/schemas/ProviderService" },
        },
      },
      ProviderServiceCreateInput: {
        type: "object",
        required: ["name", "durationMin", "price"],
        properties: {
          name: { type: "string" },
          durationMin: { type: "integer" },
          price: { type: "integer" },
        },
      },
      ProviderServiceUpdateInput: {
        type: "object",
        required: ["serviceId"],
        properties: {
          serviceId: { type: "string" },
          name: { type: "string" },
          durationMin: { type: "integer" },
          price: { type: "integer" },
        },
      },
      ProviderServiceDeleteInput: {
        type: "object",
        required: ["serviceId"],
        properties: {
          serviceId: { type: "string" },
        },
      },
      BookingListData: {
        type: "object",
        required: ["bookings"],
        properties: {
          bookings: { type: "array", items: { $ref: "#/components/schemas/BookingDto" } },
        },
      },
      BookingData: {
        type: "object",
        required: ["booking"],
        properties: {
          booking: {
            oneOf: [
              { $ref: "#/components/schemas/BookingStatusUpdate" },
              { $ref: "#/components/schemas/BookingDto" },
            ],
          },
        },
      },
      /**
       * RKN-FIX-02 — согласия гостя. ВАЖНО про «optional»: поле опционально
       * потому, что авторизованные клиенты его не шлют (их согласие снято при
       * регистрации). Для ГОСТЯ оно фактически обязательно — сервер требует
       * его отдельной проверкой и без обязательных целей отвечает
       * 400 CONSENT_REQUIRED **до** создания профиля и брони.
       * Источник истины: `src/lib/legal/consent-flags.ts`.
       */
      MarketingConsentState: {
        type: "object",
        required: ["enabled", "currentVersion"],
        properties: {
          enabled: { type: "boolean", description: "Есть активная (не отозванная) строка согласия" },
          documentVersion: { type: "string", nullable: true, description: "Версия документа действующего согласия" },
          agreedAt: { type: "string", format: "date-time", nullable: true },
          currentVersion: { type: "string", description: "Актуальная версия документа маркетингового согласия" },
        },
      },
      GuestConsentInput: {
        type: "object",
        required: ["terms", "pdProcessing"],
        properties: {
          terms: { type: "boolean", description: "Пользовательское соглашение (оферта) — обязательно" },
          pdProcessing: { type: "boolean", description: "Согласие на обработку персональных данных — обязательно" },
          marketing: {
            type: "boolean",
            default: false,
            description: "Маркетинговые коммуникации — опционально, регистрацию/бронь не гейтит",
          },
        },
      },
      BookingCreateInput: {
        type: "object",
        required: ["providerId", "serviceId", "slotLabel", "clientName", "clientPhone"],
        properties: {
          providerId: { type: "string" },
          serviceId: { type: "string" },
          masterProviderId: { type: "string" },
          startAtUtc: { type: "string", format: "date-time" },
          endAtUtc: { type: "string", format: "date-time" },
          slotLabel: { type: "string" },
          clientName: { type: "string" },
          clientPhone: { type: "string" },
          comment: { type: "string", nullable: true },
          consent: { $ref: "#/components/schemas/GuestConsentInput" },
        },
      },
      PackageBookInput: {
        type: "object",
        required: ["components", "clientName", "clientPhone"],
        properties: {
          components: {
            type: "array",
            description: "Слот на КАЖДЫЙ компонент пакета — размещение выбирает клиент, компоненты могут быть в разные дни",
            items: {
              type: "object",
              required: ["serviceId", "startAtUtc"],
              properties: {
                serviceId: { type: "string" },
                masterProviderId: { type: "string", description: "Только для студийного пакета: мастер на этот компонент" },
                startAtUtc: { type: "string", format: "date-time" },
              },
            },
          },
          clientName: { type: "string" },
          clientPhone: { type: "string" },
          comment: { type: "string", nullable: true },
          consent: { $ref: "#/components/schemas/GuestConsentInput" },
        },
      },
      BookingCancelInput: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
      },
      BookingRescheduleInput: {
        type: "object",
        required: ["startAtUtc", "endAtUtc", "slotLabel"],
        properties: {
          startAtUtc: { type: "string", format: "date-time" },
          endAtUtc: { type: "string", format: "date-time" },
          slotLabel: { type: "string" },
        },
      },
        AvailabilitySlotsData: {
          type: "object",
          required: ["slots", "meta"],
          properties: {
            slots: { type: "array", items: { $ref: "#/components/schemas/AvailabilitySlot" } },
            meta: { $ref: "#/components/schemas/AvailabilitySlotsMeta" },
          },
        },
        HotSlotRule: {
          type: "object",
          required: [
            "isEnabled",
            "triggerHours",
            "discountType",
            "discountValue",
            "applyMode",
            "serviceIds",
          ],
          properties: {
            isEnabled: { type: "boolean" },
            triggerHours: { type: "integer" },
            discountType: { $ref: "#/components/schemas/DiscountType" },
            discountValue: { type: "integer", description: "PERCENT — проценты; FIXED — рубли (не копейки), HOT-SLOT-FIXED-UNIT" },
            applyMode: { $ref: "#/components/schemas/DiscountApplyMode" },
            minPriceFrom: { type: "integer", nullable: true },
            serviceIds: { type: "array", items: { type: "string" } },
          },
        },
        HotSlotRuleData: {
          type: "object",
          required: ["rule"],
          properties: {
            rule: { $ref: "#/components/schemas/HotSlotRule" },
          },
        },
        HotSlotRuleInput: {
          type: "object",
          required: [
            "isEnabled",
            "triggerHours",
            "discountType",
            "discountValue",
            "applyMode",
            "serviceIds",
          ],
          properties: {
            isEnabled: { type: "boolean" },
            triggerHours: { type: "integer" },
            discountType: { $ref: "#/components/schemas/DiscountType" },
            discountValue: { type: "integer", description: "PERCENT — проценты; FIXED — рубли (не копейки), HOT-SLOT-FIXED-UNIT" },
            applyMode: { $ref: "#/components/schemas/DiscountApplyMode" },
            minPriceFrom: { type: "integer", nullable: true },
            serviceIds: { type: "array", items: { type: "string" } },
          },
        },
        HotSlotProvider: {
          type: "object",
          required: [
            "id",
            "publicUsername",
            "name",
            "avatarUrl",
            "address",
            "district",
            "ratingAvg",
            "ratingCount",
            "timezone",
          ],
          properties: {
            id: { type: "string" },
            publicUsername: { type: "string" },
            name: { type: "string" },
            avatarUrl: { type: "string", nullable: true },
            address: { type: "string" },
            district: { type: "string" },
            ratingAvg: { type: "number" },
            ratingCount: { type: "integer" },
            timezone: { type: "string" },
          },
        },
        HotSlotSlot: {
          type: "object",
          required: ["startAtUtc", "endAtUtc", "discountType", "discountValue", "isActive"],
          properties: {
            startAtUtc: { type: "string", format: "date-time" },
            endAtUtc: { type: "string", format: "date-time" },
            discountType: { $ref: "#/components/schemas/DiscountType" },
            discountValue: { type: "integer", description: "PERCENT — проценты; FIXED — рубли (не копейки), HOT-SLOT-FIXED-UNIT" },
            isActive: { type: "boolean" },
          },
        },
        HotSlotService: {
          type: "object",
          required: ["id", "title", "price", "durationMin"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            price: { type: "integer" },
            durationMin: { type: "integer" },
          },
        },
        HotSlotItem: {
          type: "object",
          required: ["id", "provider", "slot"],
          properties: {
            id: { type: "string" },
            provider: { $ref: "#/components/schemas/HotSlotProvider" },
            slot: { $ref: "#/components/schemas/HotSlotSlot" },
            service: { allOf: [{ $ref: "#/components/schemas/HotSlotService" }], nullable: true },
          },
        },
        HotSlotsData: {
          type: "object",
          required: ["items"],
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/HotSlotItem" } },
          },
        },
        HotSlotsJobStats: {
          type: "object",
          required: ["processed", "skipped", "activated"],
          properties: {
            processed: { type: "integer" },
            skipped: { type: "integer" },
            activated: { type: "integer" },
          },
        },
        HotSlotsRunData: {
          type: "object",
          required: ["stats"],
          properties: {
            stats: { $ref: "#/components/schemas/HotSlotsJobStats" },
          },
        },
        WeeklyScheduleData: {
          type: "object",
          required: ["items"],
          properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/WeeklyScheduleItem" } },
        },
      },
      WeeklyScheduleInput: {
        type: "array",
        items: { $ref: "#/components/schemas/WeeklyScheduleItem" },
      },
      CountData: {
        type: "object",
        required: ["count"],
        properties: {
          count: { type: "integer" },
        },
      },
      DeleteResult: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      TelegramLinkData: {
        type: "object",
        required: ["url", "expiresAt"],
        properties: {
          url: { type: "string" },
          expiresAt: { type: "string", format: "date-time" },
          alreadyLinked: { type: "boolean" },
        },
      },
      TelegramStatusData: {
        type: "object",
        required: ["linked", "enabled", "botUsername"],
        properties: {
          linked: { type: "boolean" },
          enabled: { type: "boolean" },
          botUsername: { type: "string" },
        },
      },
      TelegramSettingsInput: {
        type: "object",
        required: ["enabled"],
        properties: {
          enabled: { type: "boolean" },
        },
      },
      TelegramSettingsData: {
        type: "object",
        required: ["enabled"],
        properties: {
          enabled: { type: "boolean" },
        },
      },
      TelegramWebhookData: {
        type: "object",
        nullable: true,
        description: "Empty webhook response",
      },
      VkStatusData: {
        type: "object",
        required: ["linked", "enabled", "available", "messagesAllowed", "chatUrl"],
        properties: {
          linked: { type: "boolean" },
          enabled: { type: "boolean" },
          available: { type: "boolean", description: "Ключ сообщества сохранён в админке — канал ВКонтакте есть" },
          messagesAllowed: {
            type: "boolean",
            nullable: true,
            description: "Разрешил ли пользователь сообщения от сообщества; null — VK не ответил",
          },
          chatUrl: { type: "string", nullable: true, description: "Чат с сообществом (vk.me) — кнопка «Разрешить сообщения»" },
        },
      },
      AdminVkCommunityData: {
        type: "object",
        required: ["communityUrl", "urlRecognized", "configured", "community", "mismatch", "unreadable"],
        properties: {
          communityUrl: { type: "string", nullable: true },
          urlRecognized: { type: "boolean" },
          configured: { type: "boolean" },
          community: {
            type: "object",
            nullable: true,
            required: ["groupId", "screenName", "name", "chatUrl"],
            properties: {
              groupId: { type: "integer" },
              screenName: { type: "string" },
              name: { type: "string" },
              chatUrl: { type: "string" },
            },
          },
          mismatch: { type: "boolean" },
          unreadable: { type: "boolean" },
        },
      },
      AdminVkCommunityInput: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string", description: "Ключ доступа сообщества ВКонтакте, 20–512 символов" },
        },
      },
      VkDisableData: {
        type: "object",
        required: ["enabled"],
        properties: {
          enabled: { type: "boolean" },
        },
      },
      MediaEntityType: {
        type: "string",
        enum: ["USER", "MASTER", "STUDIO", "SITE"],
      },
      MediaKind: {
        type: "string",
        enum: ["AVATAR", "PORTFOLIO"],
      },
      MediaAsset: {
        type: "object",
        required: [
          "id",
          "entityType",
          "entityId",
          "kind",
          "mimeType",
          "sizeBytes",
          "originalFilename",
          "url",
          "createdAt",
        ],
        properties: {
          id: { type: "string" },
          entityType: { $ref: "#/components/schemas/MediaEntityType" },
          entityId: { type: "string" },
          kind: { $ref: "#/components/schemas/MediaKind" },
          mimeType: { type: "string" },
          sizeBytes: { type: "integer" },
          originalFilename: { type: "string" },
          url: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MediaAssetData: {
        type: "object",
        required: ["asset"],
        properties: {
          asset: { $ref: "#/components/schemas/MediaAsset" },
        },
      },
      MediaAssetListData: {
        type: "object",
        required: ["assets"],
        properties: {
          assets: { type: "array", items: { $ref: "#/components/schemas/MediaAsset" } },
        },
      },
      ReviewTargetType: {
        type: "string",
        enum: ["provider", "studio"],
      },
      Review: {
        type: "object",
        required: [
          "id",
          "bookingId",
          "authorId",
          "authorName",
          "targetType",
          "targetId",
          "rating",
          "text",
          "replyText",
          "repliedAt",
          "reportedAt",
          "createdAt",
        ],
        properties: {
          id: { type: "string" },
          bookingId: { type: "string", nullable: true },
          authorId: { type: "string" },
          authorName: { type: "string" },
          targetType: { $ref: "#/components/schemas/ReviewTargetType" },
          targetId: { type: "string" },
          rating: { type: "integer", minimum: 1, maximum: 5 },
          text: { type: "string", nullable: true },
          replyText: { type: "string", nullable: true },
          repliedAt: { type: "string", format: "date-time", nullable: true },
          reportedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ReviewCreateInput: {
        type: "object",
        required: ["bookingId", "rating"],
        properties: {
          bookingId: { type: "string" },
          rating: { type: "integer", minimum: 1, maximum: 5 },
          text: { type: "string", maxLength: 1000 },
        },
      },
      ReviewReplyInput: {
        type: "object",
        required: ["text"],
        properties: {
          text: { type: "string", maxLength: 1500 },
        },
      },
      ReviewReportInput: {
        type: "object",
        required: ["comment"],
        properties: {
          comment: { type: "string", maxLength: 1500 },
        },
      },
      ReviewData: {
        type: "object",
        required: ["review"],
        properties: {
          review: { $ref: "#/components/schemas/Review" },
        },
      },
      ReviewListData: {
        type: "object",
        required: ["reviews"],
        properties: {
          reviews: { type: "array", items: { $ref: "#/components/schemas/Review" } },
        },
      },
      CanLeaveReviewData: {
        type: "object",
        required: ["canLeave", "reviewId", "canDelete"],
        properties: {
          canLeave: { type: "boolean" },
          reviewId: { type: "string", nullable: true },
          canDelete: { type: "boolean" },
        },
      },
      TimeBlock: {
        type: "object",
        required: ["id", "masterId", "startAt", "endAt", "type", "note"],
        properties: {
          id: { type: "string" },
          masterId: { type: "string" },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          type: { type: "string", enum: ["BREAK", "BLOCK"] },
          note: { type: "string", nullable: true },
        },
      },
      CreateTimeBlockInput: {
        type: "object",
        required: ["studioId", "masterId", "startAt", "endAt", "type"],
        properties: {
          studioId: { type: "string" },
          masterId: { type: "string" },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          type: { type: "string", enum: ["BREAK", "BLOCK"] },
          note: { type: "string" },
        },
      },
      TimeBlockData: {
        type: "object",
        required: ["block"],
        properties: {
          block: { $ref: "#/components/schemas/TimeBlock" },
        },
      },
      StudioServiceAssignedMaster: {
        type: "object",
        required: ["masterId", "masterName"],
        properties: {
          masterId: { type: "string" },
          masterName: { type: "string" },
        },
      },
      StudioService: {
        type: "object",
        required: ["id", "categoryId", "title", "basePrice", "baseDurationMin", "sortOrder", "isActive", "masters"],
        properties: {
          id: { type: "string" },
          categoryId: { type: "string", nullable: true },
          title: { type: "string" },
          basePrice: { type: "integer" },
          baseDurationMin: { type: "integer" },
          sortOrder: { type: "integer" },
          isActive: { type: "boolean" },
          masters: { type: "array", items: { $ref: "#/components/schemas/StudioServiceAssignedMaster" } },
        },
      },
      StudioServiceCategory: {
        type: "object",
        required: ["id", "title", "sortOrder", "services"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          sortOrder: { type: "integer" },
          services: { type: "array", items: { $ref: "#/components/schemas/StudioService" } },
        },
      },
      StudioServicesData: {
        type: "object",
        required: ["categories"],
        properties: {
          categories: { type: "array", items: { $ref: "#/components/schemas/StudioServiceCategory" } },
        },
      },
      CreateStudioCategoryInput: {
        type: "object",
        required: ["studioId", "title"],
        properties: {
          studioId: { type: "string" },
          title: { type: "string" },
        },
      },
      StudioCategoryData: {
        type: "object",
        required: ["id", "title", "sortOrder"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          sortOrder: { type: "integer" },
        },
      },
      ReorderIdsInput: {
        type: "object",
        required: ["studioId", "orderedIds"],
        properties: {
          studioId: { type: "string" },
          orderedIds: { type: "array", items: { type: "string" } },
        },
      },
      CreateStudioServiceInput: {
        type: "object",
        required: ["studioId", "categoryId", "title", "basePrice", "baseDurationMin"],
        properties: {
          studioId: { type: "string" },
          categoryId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          basePrice: { type: "integer" },
          baseDurationMin: { type: "integer" },
        },
      },
      UpdateStudioServiceInput: {
        type: "object",
        required: ["studioId"],
        properties: {
          studioId: { type: "string" },
          categoryId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          basePrice: { type: "integer" },
          baseDurationMin: { type: "integer" },
          isActive: { type: "boolean" },
        },
      },
      AssignMasterInput: {
        type: "object",
        required: ["studioId", "masterId"],
        properties: {
          studioId: { type: "string" },
          masterId: { type: "string" },
        },
      },
      AssignMasterData: {
        type: "object",
        required: ["serviceId", "masterId"],
        properties: {
          serviceId: { type: "string" },
          masterId: { type: "string" },
        },
      },
      StudioMasterService: {
        type: "object",
        required: [
          "serviceId",
          "serviceTitle",
          "isEnabled",
          "priceOverride",
          "durationOverrideMin",
          "commissionPct",
        ],
        properties: {
          serviceId: { type: "string" },
          serviceTitle: { type: "string" },
          isEnabled: { type: "boolean" },
          priceOverride: { type: "integer", nullable: true },
          durationOverrideMin: { type: "integer", nullable: true },
          commissionPct: { type: "number", nullable: true },
        },
      },
      StudioMaster: {
        type: "object",
        required: ["id", "name", "isActive", "tagline", "services"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          isActive: { type: "boolean" },
          tagline: { type: "string" },
          services: { type: "array", items: { $ref: "#/components/schemas/StudioMasterService" } },
        },
      },
      StudioMasterData: {
        type: "object",
        required: ["id", "name", "isActive", "tagline", "services"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          isActive: { type: "boolean" },
          tagline: { type: "string" },
          services: { type: "array", items: { $ref: "#/components/schemas/StudioMasterService" } },
        },
      },
      StudioMasterListItem: {
        type: "object",
        required: ["id", "name", "isActive", "title", "status", "phone"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          isActive: { type: "boolean" },
          title: { type: "string" },
          status: { type: "string", enum: ["PENDING", "ACTIVE"] },
          phone: { type: "string", nullable: true },
        },
      },
      StudioMasterListData: {
        type: "object",
        required: ["masters"],
        properties: {
          masters: { type: "array", items: { $ref: "#/components/schemas/StudioMasterListItem" } },
        },
      },
      CreateStudioMasterInput: {
        type: "object",
        required: ["studioId", "displayName", "phone", "title"],
        properties: {
          studioId: { type: "string" },
          displayName: { type: "string" },
          phone: { type: "string" },
          title: { type: "string" },
        },
      },
      UpdateStudioMasterInput: {
        type: "object",
        required: ["studioId"],
        properties: {
          studioId: { type: "string" },
          displayName: { type: "string" },
          tagline: { type: "string" },
          isActive: { type: "boolean" },
        },
      },
      BulkMasterServicesInput: {
        type: "object",
        required: ["studioId", "items"],
        properties: {
          studioId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["serviceId", "isEnabled"],
              properties: {
                serviceId: { type: "string" },
                isEnabled: { type: "boolean" },
                priceOverride: { type: "integer", nullable: true },
                durationOverrideMin: { type: "integer", nullable: true },
                commissionPct: { type: "number", nullable: true },
              },
            },
          },
        },
      },
      BulkUpdatedData: {
        type: "object",
        required: ["updated"],
        properties: {
          updated: { type: "integer" },
        },
      },
      CreateMasterBookingInput: {
        type: "object",
        required: ["startAt", "serviceId", "clientName"],
        properties: {
          startAt: { type: "string", format: "date-time" },
          serviceId: { type: "string" },
          clientName: { type: "string" },
          clientPhone: { type: "string" },
          notes: { type: "string" },
        },
      },
      UpdateMasterBookingStatusInput: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["CONFIRMED", "REJECTED", "CANCELLED", "NO_SHOW"],
          },
          comment: { type: "string", maxLength: 500 },
        },
      },
      MasterScheduleDayLoad: {
        type: "object",
        required: ["date", "count"],
        properties: {
          date: { type: "string" },
          count: { type: "integer" },
        },
      },
      MasterScheduleRequest: {
        type: "object",
        required: ["id", "type", "status", "createdAt"],
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["OFF", "SHIFT", "BLOCK"] },
          status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MasterScheduleData: {
        type: "object",
        required: ["month", "isSolo", "dayLoads", "exceptions", "blocks", "requests", "publishedUntilLocal"],
        properties: {
          month: { type: "string" },
          isSolo: { type: "boolean" },
          dayLoads: { type: "array", items: { $ref: "#/components/schemas/MasterScheduleDayLoad" } },
          exceptions: { type: "array", items: { $ref: "#/components/schemas/WorkException" } },
          blocks: { type: "array", items: { $ref: "#/components/schemas/TimeBlock" } },
          requests: { type: "array", items: { $ref: "#/components/schemas/MasterScheduleRequest" } },
          publishedUntilLocal: { type: "string" },
        },
      },
      CreateMasterScheduleExceptionInput: {
        type: "object",
        required: ["date", "type"],
        properties: {
          date: { type: "string" },
          type: { type: "string", enum: ["OFF", "SHIFT"] },
          startTime: { type: "string" },
          endTime: { type: "string" },
        },
      },
      CreateMasterBlockInput: {
        type: "object",
        required: ["startAt", "endAt", "type"],
        properties: {
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          type: { type: "string", enum: ["BREAK", "BLOCK"] },
          note: { type: "string" },
        },
      },
      MasterApplyOrRequestData: {
        type: "object",
        required: ["applied"],
        properties: {
          applied: { type: "boolean" },
          requestId: { type: "string" },
          exceptionId: { type: "string" },
          blockId: { type: "string" },
        },
      },
      MasterProfile: {
        type: "object",
        required: [
          "id",
          "displayName",
          "tagline",
          "address",
          "geoLat",
          "geoLng",
          "bio",
          "avatarUrl",
          "isPublished",
          "isSolo",
          "ratingAvg",
          "ratingCount",
          "socialVk",
          "socialInstagram",
          "autoPublishStoriesEnabled",
          "cityId",
          "timezone",
          "publicUsername",
          "district",
        ],
        properties: {
          id: { type: "string" },
          displayName: { type: "string" },
          tagline: { type: "string" },
          address: { type: "string" },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          bio: { type: "string", nullable: true },
          avatarUrl: { type: "string", nullable: true },
          isPublished: { type: "boolean" },
          isSolo: { type: "boolean" },
          ratingAvg: { type: "number" },
          ratingCount: { type: "integer" },
          socialVk: { type: "string", nullable: true },
          socialInstagram: { type: "string", nullable: true },
          autoPublishStoriesEnabled: { type: "boolean" },
          cityId: { type: "string", nullable: true },
          timezone: { type: "string", description: "MOBILE-MASTER-C: IANA-пояс салона." },
          publicUsername: {
            type: "string",
            nullable: true,
            description: "MOBILE-MASTER-C: адрес `/u/{publicUsername}`; `null` — ещё не выдан (здесь не генерируется).",
          },
          district: { type: "string", description: "MOBILE-MASTER-C: район, может быть пустой строкой." },
        },
      },
      MasterProfileService: {
        type: "object",
        required: [
          "serviceId",
          "title",
          "isEnabled",
          "basePrice",
          "baseDurationMin",
          "priceOverride",
          "durationOverrideMin",
          "effectivePrice",
          "effectiveDurationMin",
          "canEditPrice",
        ],
        properties: {
          serviceId: { type: "string" },
          title: { type: "string" },
          isEnabled: { type: "boolean" },
          basePrice: { type: "integer" },
          baseDurationMin: { type: "integer" },
          priceOverride: { type: "integer", nullable: true },
          durationOverrideMin: { type: "integer", nullable: true },
          effectivePrice: { type: "integer" },
          effectiveDurationMin: { type: "integer" },
          canEditPrice: { type: "boolean" },
        },
      },
      MasterPortfolioItem: {
        type: "object",
        required: ["id", "mediaUrl", "caption", "serviceIds", "createdAt"],
        properties: {
          id: { type: "string" },
          mediaUrl: { type: "string" },
          caption: { type: "string", nullable: true },
          serviceIds: { type: "array", items: { type: "string" } },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MasterProfileData: {
        type: "object",
        required: ["master", "services", "portfolio"],
        properties: {
          master: { $ref: "#/components/schemas/MasterProfile" },
          services: { type: "array", items: { $ref: "#/components/schemas/MasterProfileService" } },
          portfolio: { type: "array", items: { $ref: "#/components/schemas/MasterPortfolioItem" } },
        },
      },
      UpdateMasterProfileInput: {
        type: "object",
        properties: {
          displayName: { type: "string" },
          tagline: { type: "string" },
          address: { type: "string" },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          bio: { type: "string", nullable: true },
          avatarUrl: { type: "string", nullable: true },
          isPublished: { type: "boolean" },
        },
      },
      UpsertMasterServicesInput: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["serviceId", "isEnabled"],
              properties: {
                serviceId: { type: "string" },
                isEnabled: { type: "boolean" },
                durationOverrideMin: { type: "integer", nullable: true },
                priceOverride: { type: "integer", nullable: true },
              },
            },
          },
        },
      },
      CreateMasterPortfolioInput: {
        type: "object",
        required: ["mediaUrl", "serviceIds"],
        properties: {
          mediaUrl: { type: "string" },
          caption: { type: "string" },
          serviceIds: { type: "array", items: { type: "string" } },
        },
      },
      StudioCabinetContextData: {
        type: "object",
        required: ["studio", "roles", "isOwner", "canAdminister", "todayKey", "counts"],
        properties: {
          studio: {
            type: "object",
            required: ["id", "providerId", "name", "timezone", "mastersCount", "isPublished"],
            properties: {
              id: { type: "string", description: "Studio.id — studioId всех `/api/studio/*`." },
              providerId: { type: "string", description: "Provider студии — для `/api/studios/{id}/**`." },
              name: { type: "string" },
              avatarUrl: { type: "string", nullable: true },
              publicUsername: { type: "string", nullable: true },
              isPublished: { type: "boolean" },
              timezone: { type: "string", description: "IANA-пояс салона." },
              mastersCount: { type: "integer" },
            },
          },
          roles: { type: "array", items: { type: "string", enum: ["OWNER", "ADMIN", "MASTER"] } },
          isOwner: { type: "boolean" },
          canAdminister: { type: "boolean", description: "Владелец или администратор." },
          todayKey: { type: "string", description: "YYYY-MM-DD по поясу салона." },
          counts: {
            type: "object",
            nullable: true,
            properties: {
              scheduleRequestsPending: { type: "integer" },
              reviewsUnanswered: { type: "integer" },
              notificationsUnread: {
                type: "integer",
                description: "MOBILE-STUDIO-C (ops): уведомления канала студии + ожидающие заявки на график.",
              },
            },
          },
        },
      },
      MasterPortfolioListItem: {
        type: "object",
        required: ["id", "mediaUrl", "caption", "serviceIds", "isPublic", "inSearch", "createdAt", "sortOrder"],
        properties: {
          id: { type: "string" },
          mediaUrl: { type: "string" },
          caption: { type: "string", nullable: true },
          serviceIds: { type: "array", items: { type: "string" } },
          globalCategoryId: { type: "string", nullable: true },
          categorySource: { type: "string", nullable: true },
          inSearch: { type: "boolean" },
          isPublic: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          sortOrder: { type: "integer", description: "Позиция ручного порядка (меньше — выше)." },
        },
      },
      MasterPortfolioListData: {
        type: "object",
        required: ["items", "total"],
        properties: {
          items: {
            type: "array",
            description:
              "В порядке показа (sortOrder asc, createdAt desc) — как каталог и публичная страница; до 500 работ.",
            items: { $ref: "#/components/schemas/MasterPortfolioListItem" },
          },
          total: { type: "integer", description: "Всего работ мастера (счётчик лимита тарифа)." },
        },
      },
      MeUser: {
        type: "object",
        required: ["id", "roles"],
        properties: {
          id: { type: "string" },
          roles: { type: "array", items: { type: "string" } },
          displayName: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          externalPhotoUrl: { type: "string", nullable: true },
          firstName: { type: "string", nullable: true },
          lastName: { type: "string", nullable: true },
          middleName: { type: "string", nullable: true },
          birthDate: { type: "string", nullable: true },
          address: { type: "string", nullable: true },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          hasMasterProfile: { type: "boolean" },
          hasStudioProfile: { type: "boolean" },
        },
      },
      MeData: {
        type: "object",
        required: ["user"],
        properties: {
          user: { $ref: "#/components/schemas/MeUser" },
        },
      },
      // LOGIC-24: `displayName` и `address` объявлены здесь не были приняты
      // роутом никогда — он вырезал их дважды; из контракта убраны.
      // PHONE-CLAIM-01: `phone` снова принимается — как ЗАЯВКА без силы
      // (канон +7XXXXXXXXXX либо null; отметку владения ставит только
      // phone-OTP; занятый номер → 409). История: убран был в
      // SECURITY-EXPOSURE-AUDIT-01 #2, возвращён решением владельца
      // 2026-08-31 вместе с claim-моделью (см. lib/auth/phone-claim.ts).
      MeUpdateInput: {
        type: "object",
        properties: {
          phone: { type: "string", nullable: true, description: "Канон +7XXXXXXXXXX; null снимает номер" },
          email: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          middleName: { type: "string" },
          birthDate: { type: "string" },
          // ME-PATCH-CONTRACT-GAPS (2): роут принимал их всегда — спека отставала.
          emailNotificationsEnabled: { type: "boolean" },
          pushNotificationsEnabled: { type: "boolean" },
        },
      },
      MoveStudioBookingInput: {
        type: "object",
        required: ["studioId", "targetMasterId", "targetStartAt", "strategy", "pricing"],
        properties: {
          studioId: { type: "string" },
          targetMasterId: { type: "string" },
          targetStartAt: { type: "string", format: "date-time" },
          strategy: { type: "string", enum: ["KEEP_SERVICE", "CHANGE_SERVICE"] },
          pricing: { type: "string", enum: ["KEEP_PRICE", "APPLY_TARGET"] },
        },
      },
      CreateStudioBookingInput: {
        type: "object",
        required: ["studioId", "masterId", "startAt", "serviceId", "clientName"],
        properties: {
          studioId: { type: "string" },
          masterId: { type: "string" },
          startAt: { type: "string", format: "date-time" },
          serviceId: { type: "string" },
          clientName: { type: "string" },
          clientPhone: { type: "string" },
          notes: { type: "string" },
        },
      },
      StudioBookingCreatedData: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      UpdateTimeBlockInput: {
        type: "object",
        required: ["studioId"],
        properties: {
          studioId: { type: "string" },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          type: { type: "string", enum: ["BREAK", "BLOCK"] },
          note: { type: "string", nullable: true },
        },
      },
      WorkTemplateBreak: {
        type: "object",
        required: ["startTime", "endTime"],
        properties: {
          startTime: { type: "string" },
          endTime: { type: "string" },
        },
      },
      WorkTemplate: {
        type: "object",
        required: ["id", "title", "startTime", "endTime", "breaks"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          breaks: { type: "array", items: { $ref: "#/components/schemas/WorkTemplateBreak" } },
        },
      },
      WorkDayRule: {
        type: "object",
        required: ["id", "weekday", "templateId", "isWorking"],
        properties: {
          id: { type: "string" },
          weekday: { type: "integer" },
          templateId: { type: "string" },
          isWorking: { type: "boolean" },
        },
      },
      WorkException: {
        type: "object",
        required: ["id", "date", "type", "startTime", "endTime"],
        properties: {
          id: { type: "string" },
          date: { type: "string" },
          type: { type: "string", enum: ["OFF", "SHIFT"] },
          startTime: { type: "string", nullable: true },
          endTime: { type: "string", nullable: true },
        },
      },
      StudioMasterScheduleData: {
        type: "object",
        required: ["templates", "dayRules", "exceptions", "blocks"],
        properties: {
          templates: { type: "array", items: { $ref: "#/components/schemas/WorkTemplate" } },
          dayRules: { type: "array", items: { $ref: "#/components/schemas/WorkDayRule" } },
          exceptions: { type: "array", items: { $ref: "#/components/schemas/WorkException" } },
          blocks: { type: "array", items: { $ref: "#/components/schemas/TimeBlock" } },
        },
      },
      CreateWorkTemplateInput: {
        type: "object",
        required: ["studioId", "title", "startTime", "endTime", "breaks"],
        properties: {
          studioId: { type: "string" },
          title: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          breaks: { type: "array", items: { $ref: "#/components/schemas/WorkTemplateBreak" } },
        },
      },
      UpsertDayRulesInput: {
        type: "object",
        required: ["studioId", "items"],
        properties: {
          studioId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["weekday", "templateId", "isWorking"],
              properties: {
                weekday: { type: "integer", minimum: 0, maximum: 6 },
                templateId: { type: "string" },
                isWorking: { type: "boolean" },
              },
            },
          },
        },
      },
      CreateWorkExceptionInput: {
        type: "object",
        required: ["studioId", "date", "type"],
        properties: {
          studioId: { type: "string" },
          date: { type: "string" },
          type: { type: "string", enum: ["OFF", "SHIFT"] },
          startTime: { type: "string" },
          endTime: { type: "string" },
        },
      },
      MasterBookingStatusData: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: { type: "string" },
          status: { type: "string" },
        },
      },
      PortfolioFeedItem: {
        type: "object",
        required: [
          "id",
          "mediaUrl",
          "caption",
          "width",
          "height",
          "masterId",
          "masterName",
          "masterAvatarUrl",
          "studioName",
          "serviceIds",
          "primaryServiceTitle",
          "totalDurationMin",
          "totalPrice",
          "favoritesCount",
          "isFavorited",
        ],
        properties: {
          id: { type: "string" },
          mediaUrl: { type: "string" },
          caption: { type: "string", nullable: true },
          width: { type: "integer", nullable: true },
          height: { type: "integer", nullable: true },
          masterId: { type: "string" },
          masterName: { type: "string" },
          masterAvatarUrl: { type: "string", nullable: true },
          studioName: { type: "string", nullable: true },
          serviceIds: { type: "array", items: { type: "string" } },
          primaryServiceTitle: { type: "string", nullable: true },
          totalDurationMin: { type: "integer" },
          totalPrice: { type: "integer" },
          favoritesCount: { type: "integer" },
          isFavorited: { type: "boolean" },
        },
      },
      NearestSlot: {
        type: "object",
        required: ["startAt"],
        properties: {
          startAt: { type: "string", format: "date-time" },
        },
      },
      SimilarPortfolioItem: {
        type: "object",
        required: ["id", "mediaUrl", "masterName", "totalPrice"],
        properties: {
          id: { type: "string" },
          mediaUrl: { type: "string" },
          masterName: { type: "string" },
          totalPrice: { type: "integer" },
        },
      },
      PortfolioServiceOption: {
        type: "object",
        required: ["serviceId", "title", "durationMin", "price"],
        properties: {
          serviceId: { type: "string" },
          title: { type: "string" },
          durationMin: { type: "integer" },
          price: { type: "integer" },
        },
      },
      PortfolioDetail: {
        allOf: [
          { $ref: "#/components/schemas/PortfolioFeedItem" },
          {
            type: "object",
            required: ["serviceOptions", "nearestSlots", "similarItems"],
            properties: {
              serviceOptions: {
                type: "array",
                items: { $ref: "#/components/schemas/PortfolioServiceOption" },
              },
              nearestSlots: {
                type: "array",
                items: { $ref: "#/components/schemas/NearestSlot" },
              },
              similarItems: {
                type: "array",
                items: { $ref: "#/components/schemas/SimilarPortfolioItem" },
              },
            },
          },
        ],
      },
      ToggleFavoriteData: {
        type: "object",
        required: ["isFavorited", "favoritesCount"],
        properties: {
          isFavorited: { type: "boolean" },
          favoritesCount: { type: "integer" },
        },
      },
      PortfolioFeedData: {
        type: "object",
        required: ["items", "nextCursor"],
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/PortfolioFeedItem" } },
          nextCursor: { type: "string", nullable: true },
        },
      },
      HomeFeedWork: {
        type: "object",
        required: ["id", "mediaUrl", "caption", "performerName", "primaryServiceTitle", "totalPrice"],
        properties: {
          id: { type: "string" },
          mediaUrl: { type: "string" },
          caption: { type: "string", nullable: true },
          performerName: { type: "string", nullable: true },
          primaryServiceTitle: { type: "string", nullable: true },
          totalPrice: { type: "integer" },
        },
      },
      HomeFeedGroup: {
        type: "object",
        required: ["key", "authorName", "authorPublicUsername", "authorRatingAvg", "authorFavorited", "works"],
        properties: {
          key: { type: "string" },
          authorName: { type: "string" },
          authorPublicUsername: { type: "string", nullable: true },
          authorRatingAvg: { type: "number" },
          authorFavorited: { type: "boolean" },
          works: { type: "array", items: { $ref: "#/components/schemas/HomeFeedWork" } },
        },
      },
      HomeFeedData: {
        type: "object",
        required: ["groups", "nextCursor"],
        properties: {
          groups: { type: "array", items: { $ref: "#/components/schemas/HomeFeedGroup" } },
          nextCursor: { type: "string", nullable: true },
        },
      },
      PortfolioDetailData: {
        type: "object",
        required: ["item"],
        properties: {
          item: { $ref: "#/components/schemas/PortfolioDetail" },
        },
      },
      CatalogEntityType: {
        type: "string",
        enum: ["master", "studio"],
      },
      CatalogPrimaryService: {
        type: "object",
        required: ["title", "price", "durationMin"],
        properties: {
          title: { type: "string" },
          price: { type: "integer" },
          durationMin: { type: "integer" },
        },
      },
      CatalogNextSlot: {
        type: "object",
        required: ["startAt"],
        properties: {
          startAt: { type: "string", format: "date-time" },
        },
      },
      CatalogSearchItem: {
        type: "object",
        required: [
          "type",
          "id",
          "publicUsername",
          "title",
          "avatarUrl",
          "ratingAvg",
          "reviewsCount",
          "distanceMeters",
          "photos",
          "geoLat",
          "geoLng",
          "primaryService",
          "minPrice",
          "nextSlot",
        ],
        properties: {
          type: { $ref: "#/components/schemas/CatalogEntityType" },
          id: { type: "string" },
          publicUsername: { type: "string", nullable: true },
          title: { type: "string" },
          avatarUrl: { type: "string", nullable: true },
          ratingAvg: { type: "number" },
          reviewsCount: { type: "integer" },
          distanceMeters: { type: "integer", nullable: true },
          photos: { type: "array", items: { type: "string" } },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          primaryService: { allOf: [{ $ref: "#/components/schemas/CatalogPrimaryService" }], nullable: true },
          minPrice: { type: "integer", nullable: true },
          nextSlot: { allOf: [{ $ref: "#/components/schemas/CatalogNextSlot" }], nullable: true },
          todaySlotsCount: { type: "integer" },
        },
      },
      CatalogSearchData: {
        type: "object",
        required: ["items", "nextCursor"],
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/CatalogSearchItem" } },
          nextCursor: { type: "integer", nullable: true },
        },
      },
      NotificationCenterInviteItem: {
        type: "object",
        required: ["id", "studioId", "studioName", "studioTagline", "studioAvatarUrl", "createdAt"],
        properties: {
          id: { type: "string" },
          studioId: { type: "string" },
          studioName: { type: "string" },
          studioTagline: { type: "string", nullable: true },
          studioAvatarUrl: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      NotificationCenterNotificationItem: {
        type: "object",
        required: ["id", "title", "body", "type", "channel", "readAt", "createdAt"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          body: { type: "string", nullable: true },
          type: { type: "string", enum: ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED", "SCHEDULE_REQUEST"] },
          channel: { type: "string", enum: ["MASTER", "STUDIO", "SYSTEM"] },
          readAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          openHref: { type: "string", nullable: true },
        },
      },
      NotificationCenterData: {
        type: "object",
        required: ["invites", "notifications", "unreadCount", "hasPhone"],
        properties: {
          invites: { type: "array", items: { $ref: "#/components/schemas/NotificationCenterInviteItem" } },
          notifications: { type: "array", items: { $ref: "#/components/schemas/NotificationCenterNotificationItem" } },
          unreadCount: { type: "integer" },
          hasPhone: { type: "boolean" },
        },
      },
      // ── MOBILE-AUTH-A ────────────────────────────────────────────────────
      MobileSessionTokens: {
        type: "object",
        required: ["accessToken", "accessTokenExpiresAt", "refreshToken", "refreshTokenExpiresAt"],
        properties: {
          accessToken: { type: "string", description: "HS256 JWT, ~2 ч. Шлётся как `Authorization: Bearer`." },
          accessTokenExpiresAt: { type: "string", format: "date-time" },
          refreshToken: {
            type: "string",
            description: "Одноразовый, ротируемый, ~30 дн. Хранить в защищённом хранилище устройства.",
          },
          refreshTokenExpiresAt: { type: "string", format: "date-time" },
        },
      },
      MeIdentity: {
        type: "object",
        description: "Форма `data.user` в `GET /api/me`.",
        required: [
          "id",
          "roles",
          "displayName",
          "phone",
          "email",
          "externalPhotoUrl",
          "avatarUrl",
          "phoneVerified",
          "emailNotificationsEnabled",
          "pushNotificationsEnabled",
        ],
        properties: {
          id: { type: "string" },
          roles: {
            type: "array",
            items: { type: "string", enum: ["CLIENT", "MASTER", "STUDIO", "STUDIO_ADMIN", "ADMIN", "SUPERADMIN"] },
          },
          displayName: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          externalPhotoUrl: { type: "string", nullable: true },
          avatarUrl: {
            type: "string",
            nullable: true,
            description:
              "MOBILE-CLIENT-01: аватар клиента — то же правило, что `avatar.url` кабинетного профиля: " +
              "загруженный (`/api/media/file/{id}`, относительный, приватный — грузить с `Authorization`, " +
              "без кропа), иначе `externalPhotoUrl` (абсолютный), иначе null.",
          },
          phoneVerified: {
            type: "boolean",
            description: "MOBILE-CLIENT-01: владение номером доказано (phone-OTP, VK / Яндекс). `phone` без него — заявка.",
          },
          emailNotificationsEnabled: { type: "boolean" },
          emailVerified: {
            type: "boolean",
            description: "Может отсутствовать (старый кадр кэша) — трактовать как «неизвестно».",
          },
          pushNotificationsEnabled: { type: "boolean" },
          welcomePending: { type: "boolean", description: "Может отсутствовать — трактовать как false." },
        },
      },
      MeIdentityData: {
        type: "object",
        required: ["user"],
        properties: {
          user: { allOf: [{ $ref: "#/components/schemas/MeIdentity" }], nullable: true },
        },
      },
      MobileAuthData: {
        type: "object",
        required: ["tokens", "user"],
        properties: {
          tokens: { $ref: "#/components/schemas/MobileSessionTokens" },
          user: { $ref: "#/components/schemas/MeIdentity" },
        },
      },
      MobileTokensData: {
        type: "object",
        required: ["tokens"],
        properties: {
          tokens: { $ref: "#/components/schemas/MobileSessionTokens" },
        },
      },
      MobileOtpVerifyInput: {
        type: "object",
        required: ["phone", "code"],
        properties: {
          phone: { type: "string", description: "+7XXXXXXXXXX (нормализуется сервером)" },
          code: { type: "string" },
          consent: {
            $ref: "#/components/schemas/GuestConsentInput",
            description: "Обязателен, когда вход создаёт аккаунт (иначе 400 CONSENT_REQUIRED).",
          },
        },
      },
      MobileOtpEmailVerifyInput: {
        type: "object",
        required: ["email", "code"],
        properties: {
          email: { type: "string", format: "email" },
          code: { type: "string" },
          consent: {
            $ref: "#/components/schemas/GuestConsentInput",
            description: "Обязателен, когда вход создаёт аккаунт (иначе 400 CONSENT_REQUIRED).",
          },
        },
      },
      MobileRefreshTokenInput: {
        type: "object",
        required: ["refreshToken"],
        properties: {
          refreshToken: { type: "string", maxLength: 4096 },
        },
      },
      MobileEmptyData: {
        type: "object",
        additionalProperties: false,
      },
      // ── MOBILE-B2: native push ────────────────────────────────────────────
      MobilePushDeviceInput: {
        type: "object",
        required: ["provider", "token"],
        properties: {
          provider: {
            type: "string",
            enum: ["fcm", "apns", "rustore"],
            description: "`apns` — только iOS, `rustore` — только Android, `fcm` — обе платформы.",
          },
          token: {
            type: "string",
            maxLength: 1024,
            description: "Push-токен устройства (видимые ASCII; у APNs — hex 32–200 символов).",
          },
          apnsEnvironment: {
            type: "string",
            enum: ["sandbox", "production"],
            description: "Только для `apns`: сборка из Xcode/TestFlight — `sandbox`, App Store — `production` (по умолчанию).",
          },
        },
      },
      MobilePushDeviceRegisteredData: {
        type: "object",
        required: ["registered"],
        properties: { registered: { type: "boolean", enum: [true] } },
      },
      MobilePushData: {
        type: "object",
        description:
          "MOBILE-B2: `data` push-уведомления (FCM/RuStore — `message.data`, APNs — ключи рядом с `aps`). " +
          "Все значения — строки. Без ПДн: заголовок и текст общие по типу события, только id сущностей. " +
          "`actions = BOOKING_DECISION` — новая запись ждёт решения мастера: iOS — `aps.category`, " +
          "Android — сообщение без блока notification, уведомление с кнопками строит приложение.",
        required: ["v", "type", "link", "title", "body", "channelId"],
        properties: {
          v: { type: "string", enum: ["1"], description: "Версия формы `data`." },
          type: { type: "string", description: "`NotificationType` (как в `GET /api/notifications`)." },
          link: { type: "string", description: "Путь экрана приложения, напр. `/master/bookings/{bookingId}`." },
          title: { type: "string" },
          body: { type: "string" },
          channelId: { type: "string", enum: ["bookings", "messages", "general", "promo"], description: "Канал Android." },
          notificationId: { type: "string", description: "Id уведомления — отметить прочитанным." },
          actions: { type: "string", enum: ["BOOKING_DECISION"] },
          badge: { type: "string", description: "Число непрочитанных (строкой)." },
          bookingId: { type: "string" },
          chatId: { type: "string" },
          conversationSlug: { type: "string" },
          reviewId: { type: "string" },
          offerId: { type: "string" },
          applicationId: { type: "string" },
          hotSlotId: { type: "string" },
        },
      },
      // ── MOBILE-B1: платформа (город, истории, онбординг) ─────────────────
      CityItem: {
        type: "object",
        required: ["id", "slug", "name", "nameGenitive", "latitude", "longitude"],
        properties: {
          id: { type: "string" },
          slug: { type: "string", description: "Идентификатор для `?city=` и куки `mr-city-slug`" },
          name: { type: "string" },
          nameGenitive: { type: "string", nullable: true, description: "«Казани» — для заголовков «в …»" },
          latitude: { type: "number" },
          longitude: { type: "number" },
        },
      },
      CityListData: {
        type: "object",
        required: ["items"],
        properties: { items: { type: "array", items: { $ref: "#/components/schemas/CityItem" } } },
      },
      PublicPackageComponent: {
        type: "object",
        required: ["serviceId", "name", "price", "durationMin"],
        properties: {
          serviceId: {
            type: "string",
            description:
              "CUID услуги (booking-flow исключение правила 12): `serviceId` для `/slots` (соло) или " +
              "`/api/masters/{id}/availability` (студия) и для тела propose/book.",
          },
          name: { type: "string", description: "`title`, иначе `name` услуги" },
          price: {
            type: "integer",
            description: "Копейки. Студия — базовая цена каталога: у мастера может быть своя, точную даёт `studio/propose`.",
          },
          durationMin: { type: "integer", description: "Минуты. Студия — базовая длительность (у мастера может быть своя)." },
        },
      },
      PublicPackage: {
        type: "object",
        required: [
          "id",
          "name",
          "serviceNames",
          "components",
          "totalDurationMin",
          "totalPrice",
          "finalPrice",
          "discountAmount",
        ],
        properties: {
          id: {
            type: "string",
            description: "CUID пакета для `/api/public/packages/{id}/…` (booking-flow исключение правила 12).",
          },
          name: { type: "string" },
          serviceNames: { type: "array", items: { type: "string" } },
          components: {
            type: "array",
            items: { $ref: "#/components/schemas/PublicPackageComponent" },
            description: "В порядке пакета — в этом порядке веб и предлагает выбирать время.",
          },
          totalDurationMin: { type: "integer" },
          totalPrice: { type: "integer", description: "Копейки: сумма услуг" },
          finalPrice: { type: "integer", description: "Копейки: цена пакета со скидкой" },
          discountAmount: { type: "integer", description: "Копейки" },
        },
      },
      PublicProviderPackagesData: {
        type: "object",
        required: ["kind", "bufferMin", "packages"],
        properties: {
          kind: {
            type: "string",
            enum: ["solo", "studio", "none"],
            description:
              "`solo` — запись через `/api/public/packages/{id}/{propose,book}`; `studio` — через " +
              "`…/studio/{propose,book}` (мастер на каждую услугу); `none` — пакеты на этой странице не продаются " +
              "(мастер студии), `packages` пуст.",
          },
          bufferMin: {
            type: "integer",
            minimum: 0,
            description:
              "`solo`: перерыв мастера между записями (нормализован как в ядре записи) — следующая услуга пакета " +
              "не раньше `конец предыдущей + bufferMin`. `studio`/`none`: 0 (буфер мастера студии — в " +
              "`GET /api/providers/{id}/masters`).",
          },
          packages: { type: "array", items: { $ref: "#/components/schemas/PublicPackage" } },
        },
      },
      ProviderAvailabilityHint: {
        type: "object",
        required: ["kind"],
        properties: {
          kind: { type: "string", enum: ["today", "later", "none"] },
          time: { type: "string", description: "`kind=today`: `HH:MM` в поясе салона (`provider.timezone`)" },
          dateKey: { type: "string", format: "date", description: "`kind=later`: `YYYY-MM-DD` в поясе салона" },
        },
      },
      PublicProviderOverviewData: {
        type: "object",
        required: ["planTier", "experienceMonths", "availability", "studio", "viewer"],
        properties: {
          planTier: {
            type: "string",
            enum: ["FREE", "PRO", "PREMIUM"],
            nullable: true,
            description: "Тариф владельца (кольцо и бейдж — у `PREMIUM`); `null` — неизвестен.",
          },
          experienceMonths: {
            type: "integer",
            nullable: true,
            description: "Мастер: месяцев на платформе. Студия: `null`.",
          },
          availability: {
            allOf: [{ $ref: "#/components/schemas/ProviderAvailabilityHint" }],
            nullable: true,
            description:
              "Мастер: ближайшее окошко (зонд на 8 дней, услуга 30 мин; подсказка, кэш 60 с). Студия: `null`.",
          },
          studio: {
            type: "object",
            nullable: true,
            required: ["id", "name", "publicUsername"],
            description: "Мастер в студии; иначе `null`.",
            properties: {
              id: { type: "string", description: "`Provider.id` студии — то же, что `provider.studioId` профиля" },
              name: { type: "string" },
              publicUsername: { type: "string", nullable: true, description: "`null` — страница студии не публична" },
            },
          },
          viewer: {
            type: "object",
            required: ["isFavorited", "isOwner", "reviewableBookingId"],
            description: "Флаги зрителя; гостю — `false`/`null`. Не кэшируются.",
            properties: {
              isFavorited: { type: "boolean" },
              isOwner: { type: "boolean", description: "Своя страница — запись не предлагать (сервер её отклонит)" },
              reviewableBookingId: {
                type: "string",
                nullable: true,
                description: "Своя запись зрителя, на которую можно оставить отзыв (`POST /api/reviews`)",
              },
            },
          },
        },
      },
      FeedStoriesItem: {
        type: "object",
        required: ["id", "mediaUrl", "createdAt", "performerName", "serviceTitle"],
        properties: {
          id: { type: "string", description: "Непрозрачный токен (не id работы)" },
          mediaUrl: { type: "string", description: "Относительная ссылка `/api/media/file/{id}` — понимает `?w=`" },
          createdAt: { type: "string", format: "date-time" },
          performerName: { type: "string", nullable: true },
          serviceTitle: { type: "string", nullable: true },
        },
      },
      FeedStoriesGroup: {
        type: "object",
        required: ["masterId", "providerName", "providerType", "username", "avatarUrl", "items"],
        properties: {
          masterId: { type: "string", description: "Непрозрачный токен группы (не id провайдера)" },
          providerName: { type: "string" },
          providerType: { type: "string", enum: ["MASTER", "STUDIO"] },
          username: { type: "string", nullable: true, description: "publicUsername — профиль `/u/{username}`" },
          avatarUrl: { type: "string", nullable: true },
          items: { type: "array", items: { $ref: "#/components/schemas/FeedStoriesItem" } },
        },
      },
      FeedStoriesData: {
        type: "object",
        required: ["groups", "cachedAt"],
        properties: {
          groups: { type: "array", items: { $ref: "#/components/schemas/FeedStoriesGroup" } },
          cachedAt: { type: "string", format: "date-time" },
        },
      },
      CatalogAutocompleteData: {
        type: "object",
        required: ["categories", "providers"],
        properties: {
          categories: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Публичный токен — фильтр `globalCategoryId` каталога" },
                name: { type: "string" },
                icon: { type: "string", nullable: true },
                slug: { type: "string", nullable: true },
                parentId: { type: "string", nullable: true },
              },
            },
          },
          providers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                publicUsername: { type: "string", nullable: true },
                type: { type: "string", enum: ["master", "studio"] },
                ratingAvg: { type: "number" },
                ratingCount: { type: "integer" },
                avatarUrl: { type: "string", nullable: true },
              },
            },
          },
        },
      },
      AvailabilitySearchData: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: { type: "object", description: "Провайдер с ближайшими окнами (`AvailabilityProviderItem`)" },
          },
        },
      },
      PublicModelOffersData: {
        type: "object",
        required: ["items", "nextPage"],
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/PublicModelOfferItem" } },
          nextPage: { type: "integer", nullable: true },
        },
      },
      ProfessionalOnboardingData: {
        type: "object",
        required: ["role", "status", "providerId", "next"],
        properties: {
          role: { type: "string", enum: ["MASTER", "STUDIO"] },
          status: {
            type: "string",
            enum: ["created", "already-exists"],
            description: "`already-exists` — кабинет уже был; повтор безопасен (идемпотентно)",
          },
          providerId: { type: "string", description: "Внутренний id провайдера кабинета (для кабинетных API)" },
          masterProfileId: { type: "string", description: "Только для MASTER" },
          studioId: { type: "string", description: "Только для STUDIO" },
          next: {
            type: "string",
            enum: ["/cabinet/master", "/cabinet/studio"],
            description: "Куда ведёт веб; подсказка, у приложения своя навигация",
          },
        },
      },
      // ── MOBILE-AUTH-A2: вход через VK ID / Яндекс ID ─────────────────────
      MobileOAuthExchangeInput: {
        type: "object",
        required: ["code", "codeVerifier"],
        properties: {
          code: {
            type: "string",
            maxLength: 256,
            description: "Одноразовый код из `masterryadom://auth/callback?code=…` (живёт 60 с).",
          },
          codeVerifier: {
            type: "string",
            minLength: 43,
            maxLength: 128,
            pattern: "^[A-Za-z0-9._~-]{43,128}$",
            description: "PKCE verifier приложения (RFC 7636), чей S256-челлендж ушёл на старт.",
          },
        },
      },
      MobileOAuthLinkIntentData: {
        type: "object",
        required: ["intent"],
        properties: {
          intent: {
            type: "string",
            description:
              "Одноразовый токен привязки (5 мин): передать в `…/oauth/{provider}/start?intent=…`. " +
              "Привязан к пользователю и провайдеру.",
          },
        },
      },
      // ── MOBILE-AUTH-A3: список сессий ───────────────────────────────────
      SessionFamily: {
        type: "object",
        required: [
          "id",
          "clientType",
          "platform",
          "deviceName",
          "appVersion",
          "browser",
          "createdAt",
          "lastUsedAt",
          "current",
        ],
        properties: {
          id: { type: "string", description: "Id семьи сессий — его принимает `DELETE /api/me/sessions/{id}`." },
          clientType: { type: "string", enum: ["WEB", "MOBILE"] },
          platform: { type: "string", nullable: true, description: "`ios` / `android` у приложения; у веба null." },
          deviceName: { type: "string", nullable: true },
          appVersion: { type: "string", nullable: true },
          browser: {
            type: "string",
            nullable: true,
            description: "Сводка User-Agent веб-сессии («Chrome, Windows»); у приложения и старых веб-сессий null.",
          },
          createdAt: { type: "string", format: "date-time" },
          lastUsedAt: { type: "string", format: "date-time", nullable: true },
          current: { type: "boolean", description: "Сессия, которой сделан этот запрос." },
        },
      },
      SessionFamilyListData: {
        type: "object",
        required: ["sessions"],
        properties: {
          sessions: { type: "array", items: { $ref: "#/components/schemas/SessionFamily" } },
        },
      },
      SessionRevokeOthersData: {
        type: "object",
        required: ["revoked"],
        properties: {
          revoked: { type: "integer", minimum: 0, description: "Сколько активных сессий завершено." },
        },
      },
      ProviderUnlinkData: {
        type: "object",
        required: ["unlinked"],
        properties: {
          unlinked: { type: "boolean", enum: [true] },
        },
      },
      // Клиентский профиль (`/api/cabinet/user/profile`) — источник флагов
      // «VK/Яндекс привязан» для приложения.
      ClientProfileLinkedVk: {
        type: "object",
        required: ["linked", "deliveryEnabled", "connectedAt"],
        properties: {
          linked: { type: "boolean", description: "Аккаунт VK привязан (identity)." },
          deliveryEnabled: {
            type: "boolean",
            description:
              "Уведомления через VK включены. Выключает `POST /api/integrations/vk/disable`; " +
              "`POST /api/auth/vk/unlink` удаляет связку целиком (`linked = false`).",
          },
          connectedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      ClientProfileLinkedYandex: {
        type: "object",
        required: ["linked", "enabled", "connectedAt"],
        properties: {
          linked: { type: "boolean", description: "Аккаунт Яндекс ID привязан (identity)." },
          enabled: {
            type: "boolean",
            description:
              "Связка включена (флаг из прежней мягкой отвязки). `POST /api/auth/yandex/unlink` теперь " +
              "удаляет связку целиком (`linked = false`).",
          },
          connectedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      ClientProfileData: {
        type: "object",
        required: ["personal", "contacts", "avatar", "linked", "stats", "completion"],
        properties: {
          personal: {
            type: "object",
            required: ["firstName", "lastName", "city", "birthDate", "hideAgeYear"],
            properties: {
              firstName: { type: "string", nullable: true },
              lastName: { type: "string", nullable: true },
              city: { type: "string", nullable: true },
              birthDate: { type: "string", format: "date", nullable: true },
              hideAgeYear: { type: "boolean" },
            },
          },
          contacts: {
            type: "object",
            required: ["phone", "phoneVerified", "email", "emailVerified"],
            properties: {
              phone: { type: "string", nullable: true },
              phoneVerified: { type: "boolean" },
              email: { type: "string", nullable: true },
              emailVerified: { type: "boolean" },
            },
          },
          avatar: {
            type: "object",
            required: ["url"],
            properties: { url: { type: "string", nullable: true } },
          },
          linked: {
            type: "object",
            required: ["telegram", "vk", "yandex"],
            properties: {
              telegram: {
                type: "object",
                required: ["linked", "deliveryEnabled", "username", "connectedAt"],
                properties: {
                  linked: { type: "boolean" },
                  deliveryEnabled: { type: "boolean" },
                  username: { type: "string", nullable: true },
                  connectedAt: { type: "string", format: "date-time", nullable: true },
                },
              },
              vk: { $ref: "#/components/schemas/ClientProfileLinkedVk" },
              yandex: { $ref: "#/components/schemas/ClientProfileLinkedYandex" },
            },
          },
          stats: {
            type: "object",
            required: ["visitsCount", "favoritesCount", "memberSince"],
            properties: {
              visitsCount: { type: "integer" },
              favoritesCount: { type: "integer" },
              memberSince: { type: "string", format: "date-time" },
            },
          },
          completion: {
            type: "object",
            required: ["percent", "items"],
            properties: {
              percent: { type: "integer", minimum: 0, maximum: 100 },
              items: {
                type: "object",
                required: ["nameLastname", "phoneVerified", "emailVerified", "birthday", "tgLinked", "vkLinked"],
                properties: {
                  nameLastname: { type: "boolean" },
                  phoneVerified: { type: "boolean", description: "Исторический ключ: номер указан (не владение)." },
                  emailVerified: { type: "boolean" },
                  birthday: { type: "boolean" },
                  tgLinked: { type: "boolean" },
                  vkLinked: { type: "boolean" },
                },
              },
            },
          },
        },
      },
      ClientProfileUpdateInput: {
        type: "object",
        description: "Частичное обновление: отсутствующее поле не меняется, `null` — очищает.",
        properties: {
          firstName: { type: "string", maxLength: 100, nullable: true },
          lastName: { type: "string", maxLength: 100, nullable: true },
          phone: {
            type: "string",
            maxLength: 40,
            nullable: true,
            description: "Российский номер, нормализуется в +7XXXXXXXXXX.",
          },
          city: { type: "string", maxLength: 200, nullable: true },
          birthDate: { type: "string", format: "date", nullable: true },
          hideAgeYear: { type: "boolean" },
          email: { type: "string", format: "email", maxLength: 255, nullable: true },
        },
      },
      // ── MOBILE-CLIENT-01: «Мои записи», «Мои отзывы», предложение для моделей ──
      ClientBooking: {
        type: "object",
        description:
          "Элемент «Моих записей» (`ClientBookingDTO`) — одна форма у списка и у карточки записи. " +
          "Мгновения — UTC ISO, показывать в `provider.timezone` (часовой пояс салона); деньги — копейки; " +
          "id — внутренние CUID (кабинет, правило 12 не действует).",
        required: [
          "id", "status", "createdAt", "startAtUtc", "endAtUtc", "durationMin", "slotLabel",
          "isUpcoming", "isFinished", "isCancelled", "isToday", "canReview", "hasReview",
          "reviewDeadlineUtc", "chatSlug", "proposedStartAt", "proposedEndAt", "actionRequiredBy",
          "changeComment", "clientChangeRequestsCount", "changeRequestLimit", "bookingPackageId",
          "cancelledBy", "cancelReason", "cancellationDeadlineHours", "comment", "silentMode",
          "isOnSite", "address", "provider", "studio", "service",
        ],
        properties: {
          id: { type: "string" },
          status: {
            type: "string",
            enum: [
              "NEW", "PENDING", "CONFIRMED", "CHANGE_REQUESTED", "REJECTED", "IN_PROGRESS",
              "PREPAID", "STARTED", "FINISHED", "CANCELLED", "NO_SHOW",
            ],
            description: "ХРАНИМЫЙ статус (не runtime): группу брать из `isUpcoming`/`isFinished`/`isCancelled`.",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "Создание записи; неподтверждённая отменяется через 24 ч от него (или в момент начала).",
          },
          startAtUtc: { type: "string", format: "date-time", nullable: true },
          endAtUtc: { type: "string", format: "date-time", nullable: true },
          durationMin: { type: "integer" },
          slotLabel: { type: "string", description: "Служебная подпись — не показывать." },
          isUpcoming: { type: "boolean" },
          isFinished: { type: "boolean" },
          isCancelled: { type: "boolean" },
          isToday: { type: "boolean", description: "Начало — сегодня по часам салона." },
          canReview: { type: "boolean", description: "Тот же предикат, что у `POST /api/reviews`." },
          hasReview: { type: "boolean", description: "Отзыв есть (в том числе удалённый)." },
          reviewDeadlineUtc: {
            type: "string",
            format: "date-time",
            nullable: true,
            description:
              "Конец окна отзыва (начало + длительность + 60 мин + 3 дня). null — отзыва по записи уже не будет: " +
              "отзыв есть, запись отменена или окно прошло. У будущей записи — конец её будущего окна.",
          },
          chatSlug: {
            type: "string",
            nullable: true,
            description:
              "Переписка (`/api/chat/threads/{slug}`). Только у записи к мастеру; у студийной записи всегда null " +
              "(мессенджер студийные записи не показывает).",
          },
          proposedStartAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Только при CHANGE_REQUESTED.",
          },
          proposedEndAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Только при CHANGE_REQUESTED.",
          },
          actionRequiredBy: {
            type: "string",
            enum: ["CLIENT", "MASTER"],
            nullable: true,
            description: "Только при CHANGE_REQUESTED: CLIENT — мастер предложил время и ждёт вас, MASTER — ждёте мастера.",
          },
          changeComment: {
            type: "string",
            nullable: true,
            description: "Комментарий мастера к предложенному переносу; только при CHANGE_REQUESTED.",
          },
          clientChangeRequestsCount: { type: "integer", description: "Сколько раз вы уже просили перенос." },
          changeRequestLimit: {
            type: "integer",
            description: "Предел запросов переноса (сейчас 3): при `clientChangeRequestsCount >= changeRequestLimit` перенос — 409.",
          },
          bookingPackageId: {
            type: "string",
            nullable: true,
            description: "Часть пакета: отменяется только целиком (`/api/bookings/package/{id}/cancel`).",
          },
          cancelledBy: {
            type: "string",
            enum: ["CLIENT", "PROVIDER", "SYSTEM"],
            nullable: true,
            description: "Кто отменил; только у отменённой записи (`isCancelled`).",
          },
          cancelReason: { type: "string", nullable: true, description: "Причина отмены мастером/студией (только PROVIDER)." },
          cancellationDeadlineHours: {
            type: "integer",
            minimum: 1,
            nullable: true,
            description:
              "Срок бесплатной отмены записанного провайдера (у студийной записи — студии), часов до начала; " +
              "null — срока нет. Позже — отмена 423 CANCELLATION_DEADLINE_PASSED.",
          },
          comment: { type: "string", nullable: true, description: "Ваш комментарий к записи." },
          silentMode: { type: "boolean", description: "«Хочу помолчать»." },
          isOnSite: { type: "boolean", description: "Есть адрес — можно строить маршрут." },
          address: {
            type: "string",
            nullable: true,
            description: "Первый непустой из адреса мастера и адреса записанного провайдера (у студийной — студии).",
          },
          provider: {
            type: "object",
            description:
              "Кто оказывает услугу: мастер (у студийной записи — профиль мастера в студии), без мастера — сама студия.",
            required: ["id", "name", "publicUsername", "type", "avatarUrl", "timezone"],
            properties: {
              id: { type: "string", description: "Provider CUID (слоты переноса)." },
              name: { type: "string" },
              publicUsername: { type: "string", nullable: true },
              type: { type: "string", enum: ["MASTER", "STUDIO"] },
              avatarUrl: { type: "string", nullable: true },
              timezone: { type: "string", description: "IANA-пояс салона — в нём показывать все времена записи." },
            },
          },
          studio: {
            type: "object",
            nullable: true,
            description: "Студия, через которую записались, когда `provider` — мастер в ней; иначе null.",
            required: ["id", "name", "publicUsername", "address"],
            properties: {
              id: { type: "string", description: "Provider CUID студии." },
              name: { type: "string" },
              publicUsername: { type: "string", nullable: true },
              address: { type: "string", nullable: true },
            },
          },
          service: {
            type: "object",
            required: ["id", "name", "priceSnapshot", "durationSnapshotMin"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              priceSnapshot: { type: "integer", description: "Копейки, цена на момент записи (со скидками)." },
              durationSnapshotMin: { type: "integer" },
            },
          },
        },
      },
      ClientBookingsData: {
        type: "object",
        required: ["bookings", "kpi"],
        properties: {
          bookings: {
            type: "array",
            description: "До 300 последних записей: предстоящие по возрастанию, затем завершённые и отменённые по убыванию.",
            items: { $ref: "#/components/schemas/ClientBooking" },
          },
          kpi: {
            type: "object",
            description: "Считается по всем загруженным записям, без фильтров.",
            required: ["totalCount", "upcomingNext", "finishedCount", "spentLast90dKopeks"],
            properties: {
              totalCount: { type: "integer" },
              upcomingNext: {
                type: "object",
                nullable: true,
                required: ["whenIso", "providerName", "serviceName", "timeZone"],
                properties: {
                  whenIso: { type: "string", format: "date-time" },
                  providerName: { type: "string" },
                  serviceName: { type: "string" },
                  timeZone: { type: "string" },
                },
              },
              finishedCount: { type: "integer" },
              spentLast90dKopeks: { type: "integer" },
            },
          },
        },
      },
      ClientBookingData: {
        type: "object",
        required: ["booking"],
        properties: { booking: { $ref: "#/components/schemas/ClientBooking" } },
      },
      RevenueSplit: {
        type: "object",
        description: "Выручка по контекстам, копейки: личные записи мастера и записи в студии.",
        required: ["personal", "studio"],
        properties: {
          personal: { type: "integer" },
          studio: { type: "integer" },
        },
      },
      BookingWorkContext: {
        type: "object",
        description: "Где выполняется запись: личный профиль мастера или студия (`studioName` только у STUDIO).",
        required: ["kind"],
        properties: {
          kind: { type: "string", enum: ["PERSONAL", "STUDIO"] },
          studioName: { type: "string" },
        },
      },
      MasterBookingActions: {
        type: "object",
        description:
          "MOBILE-MASTER-C: что мастер может сделать с записью прямо сейчас (`bookings/master-actions.ts`, " +
          "те же проверки, что у сервера).",
        required: [
          "confirm",
          "decline",
          "declineReschedule",
          "cancel",
          "reschedule",
          "noShow",
          "awaitingClient",
          "modifyWindowClosed",
          "wholePackageOnly",
          "rescheduleLimitReached",
        ],
        properties: {
          confirm: {
            type: "boolean",
            description: "`PATCH /api/master/bookings/{id}/status {status:CONFIRMED}`: подтвердить запись или принять перенос от клиента.",
          },
          decline: {
            type: "boolean",
            description: "`…/status {status:REJECTED, comment}`: отклонить неподтверждённую запись, причина обязательна.",
          },
          declineReschedule: {
            type: "boolean",
            description: "`…/status {status:REJECTED}` без причины: отказать в переносе, запись остаётся на прежнем времени.",
          },
          cancel: {
            type: "boolean",
            description: "`…/status {status:CANCELLED, comment}`: отменить подтверждённую запись, причина обязательна.",
          },
          reschedule: { type: "boolean", description: "`POST /api/bookings/{id}/reschedule`: предложить другое время." },
          noShow: { type: "boolean", description: "`…/status {status:NO_SHOW}`: приём идёт или закончился меньше часа назад." },
          awaitingClient: { type: "boolean", description: "Мастер предложил перенос и ждёт ответа клиента." },
          modifyWindowClosed: {
            type: "boolean",
            description: "До начала меньше 60 минут (или время не задано): отказ, отмена и перенос закрыты.",
          },
          wholePackageOnly: {
            type: "boolean",
            description: "Запись из пакета: отказ и отмена только пакетом, `POST /api/bookings/package/{bookingPackageId}/cancel`.",
          },
          rescheduleLimitReached: { type: "boolean", description: "Мастер уже переносил запись 3 раза." },
        },
      },
      MasterBookingItem: {
        type: "object",
        description:
          "MOBILE-MASTER-C: запись в списках кабинета мастера (главная, канбан, неделя). Телефона клиента нет: " +
          "он только в карточке `GET /api/cabinet/master/bookings/{id}`.",
        required: [
          "id",
          "status",
          "runtimeStatus",
          "source",
          "startAtUtc",
          "endAtUtc",
          "durationMin",
          "timezone",
          "proposedStartAtUtc",
          "proposedEndAtUtc",
          "requestedBy",
          "actionRequiredBy",
          "changeComment",
          "needsAnswer",
          "clientName",
          "clientUserId",
          "clientAvatarUrl",
          "finishedVisitsCount",
          "isNewClient",
          "serviceTitle",
          "services",
          "price",
          "bookingPackageId",
          "workContext",
          "chatSlug",
          "actions",
        ],
        properties: {
          id: { type: "string" },
          status: {
            type: "string",
            description: "Статус в БД.",
            enum: [
              "NEW",
              "PENDING",
              "CONFIRMED",
              "CHANGE_REQUESTED",
              "REJECTED",
              "IN_PROGRESS",
              "PREPAID",
              "STARTED",
              "FINISHED",
              "CANCELLED",
              "NO_SHOW",
            ],
          },
          runtimeStatus: {
            type: "string",
            description: "Вычисляемый статус: начавшаяся — IN_PROGRESS, через 60 минут после конца — FINISHED.",
            enum: ["PENDING", "CONFIRMED", "CHANGE_REQUESTED", "REJECTED", "IN_PROGRESS", "FINISHED"],
          },
          source: { type: "string", enum: ["MANUAL", "WEB", "APP"] },
          startAtUtc: { type: "string", format: "date-time", nullable: true },
          endAtUtc: { type: "string", format: "date-time", nullable: true },
          durationMin: { type: "integer" },
          timezone: { type: "string", description: "IANA-пояс салона записи: в нём показывать её время." },
          proposedStartAtUtc: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Предложенное время переноса, только при CHANGE_REQUESTED.",
          },
          proposedEndAtUtc: { type: "string", format: "date-time", nullable: true },
          requestedBy: { type: "string", enum: ["CLIENT", "MASTER"], nullable: true },
          actionRequiredBy: { type: "string", enum: ["CLIENT", "MASTER"], nullable: true },
          changeComment: { type: "string", nullable: true, description: "Комментарий к переносу или причина отмены." },
          needsAnswer: { type: "boolean", description: "Ждёт ответа мастера: новая запись или перенос от клиента." },
          clientName: { type: "string" },
          clientUserId: { type: "string", nullable: true },
          clientAvatarUrl: { type: "string", nullable: true },
          finishedVisitsCount: {
            type: "integer",
            nullable: true,
            description: "Завершённых визитов клиента к мастеру по всем его профилям; `null` у гостя.",
          },
          isNewClient: { type: "boolean", description: "Зарегистрированный клиент без завершённых визитов." },
          serviceTitle: { type: "string" },
          services: {
            type: "array",
            items: {
              type: "object",
              required: ["title", "price", "durationMin"],
              properties: {
                title: { type: "string" },
                price: { type: "integer", description: "Копейки." },
                durationMin: { type: "integer" },
              },
            },
          },
          price: { type: "integer", description: "Копейки: сумма услуг записи." },
          bookingPackageId: { type: "string", nullable: true },
          workContext: { $ref: "#/components/schemas/BookingWorkContext" },
          chatSlug: {
            type: "string",
            nullable: true,
            description: "Переписка с клиентом; только у записи к личному профилю мастера с аккаунтом клиента.",
          },
          actions: { $ref: "#/components/schemas/MasterBookingActions" },
        },
      },
      MasterBookingDetail: {
        description: "MOBILE-MASTER-C: карточка записи для мастера, элемент списка плюс подробности.",
        allOf: [
          { $ref: "#/components/schemas/MasterBookingItem" },
          {
            type: "object",
            required: [
              "createdAt",
              "client",
              "comment",
              "silentMode",
              "answers",
              "clientChangeRequestsCount",
              "masterChangeRequestsCount",
              "changeRequestLimit",
              "cancelledBy",
              "cancelReason",
              "cancelledAtUtc",
              "review",
            ],
            properties: {
              createdAt: { type: "string", format: "date-time" },
              client: {
                type: "object",
                required: ["name", "phone", "userId", "key", "historyToken"],
                properties: {
                  name: { type: "string" },
                  phone: { type: "string", nullable: true, description: "Телефон из записи, нормализованный, если разбирается." },
                  userId: { type: "string", nullable: true },
                  key: {
                    type: "string",
                    nullable: true,
                    description: "Ключ CRM-карточки (`/api/master/clients/{key}/detail|card`, в `encodeURIComponent`).",
                  },
                  historyToken: {
                    type: "string",
                    nullable: true,
                    description: "Для `GET /api/cabinet/master/bookings?client=`.",
                  },
                },
              },
              comment: { type: "string", nullable: true },
              silentMode: { type: "boolean" },
              answers: {
                type: "array",
                items: {
                  type: "object",
                  required: ["question", "answer"],
                  properties: { question: { type: "string" }, answer: { type: "string" } },
                },
              },
              clientChangeRequestsCount: { type: "integer" },
              masterChangeRequestsCount: { type: "integer" },
              changeRequestLimit: { type: "integer" },
              cancelledBy: { type: "string", enum: ["CLIENT", "PROVIDER", "SYSTEM"], nullable: true },
              cancelReason: { type: "string", nullable: true },
              cancelledAtUtc: { type: "string", format: "date-time", nullable: true },
              review: {
                type: "object",
                nullable: true,
                required: ["id", "rating", "text", "replyText", "repliedAt", "createdAt", "canReply"],
                properties: {
                  id: { type: "string", description: "Публичный токен отзыва для `/api/reviews/{id}/…`." },
                  rating: { type: "integer", minimum: 1, maximum: 5 },
                  text: { type: "string", nullable: true },
                  replyText: { type: "string", nullable: true },
                  repliedAt: { type: "string", format: "date-time", nullable: true },
                  createdAt: { type: "string", format: "date-time" },
                  canReply: { type: "boolean", description: "`false`: отзыв о визите в студию, отвечает студия." },
                },
              },
            },
          },
        ],
      },
      MasterBookingDetailData: {
        type: "object",
        required: ["booking"],
        properties: { booking: { $ref: "#/components/schemas/MasterBookingDetail" } },
      },
      MasterCabinetDashboardData: {
        type: "object",
        required: [
          "timezone",
          "todayKey",
          "master",
          "isSolo",
          "showWorkContext",
          "scheduleEndsOn",
          "kpis",
          "freeSlot",
          "attention",
          "today",
        ],
        properties: {
          timezone: { type: "string", description: "IANA-пояс салона." },
          todayKey: { type: "string", format: "date", description: "Сегодня по часам салона." },
          master: {
            type: "object",
            required: ["id", "name", "avatarUrl", "publicUsername", "studio"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              avatarUrl: { type: "string", nullable: true },
              publicUsername: { type: "string", nullable: true },
              studio: {
                type: "object",
                nullable: true,
                required: ["name"],
                properties: { name: { type: "string" } },
              },
            },
          },
          isSolo: { type: "boolean" },
          showWorkContext: { type: "boolean", description: "Показывать пометку «Личная / Студия»." },
          scheduleEndsOn: {
            type: "string",
            format: "date",
            nullable: true,
            description: "Последний день настроенного графика, если он кончается в ближайшие 7 дней.",
          },
          kpis: {
            type: "object",
            required: [
              "todayRevenue",
              "todayRevenueSplit",
              "todayBookingsCount",
              "todayCapacityHours",
              "weekRevenue",
              "weekRevenueSplit",
              "newClientsCount",
              "returningClientsCount",
            ],
            properties: {
              todayRevenue: { type: "integer", description: "Копейки." },
              todayRevenueSplit: { $ref: "#/components/schemas/RevenueSplit" },
              todayBookingsCount: { type: "integer" },
              todayCapacityHours: { type: "integer" },
              weekRevenue: { type: "integer", description: "Копейки, последние 7 дней салона." },
              weekRevenueSplit: { $ref: "#/components/schemas/RevenueSplit" },
              newClientsCount: { type: "integer" },
              returningClientsCount: { type: "integer" },
            },
          },
          freeSlot: {
            type: "object",
            nullable: true,
            description: "Первое свободное окно от 60 минут сегодня.",
            required: ["startAtUtc", "endAtUtc", "durationMin"],
            properties: {
              startAtUtc: { type: "string", format: "date-time" },
              endAtUtc: { type: "string", format: "date-time" },
              durationMin: { type: "integer" },
            },
          },
          attention: {
            type: "object",
            required: [
              "bookingsCount",
              "pendingConfirmationCount",
              "rescheduleRequestsCount",
              "unansweredReviewsCount",
              "bookings",
              "reviews",
            ],
            properties: {
              bookingsCount: { type: "integer", description: "Ждут ответа мастера, как бейдж «Записи»." },
              pendingConfirmationCount: { type: "integer" },
              rescheduleRequestsCount: { type: "integer" },
              unansweredReviewsCount: { type: "integer" },
              bookings: {
                type: "array",
                description: "До 3 ближайших записей, ждущих ответа.",
                items: { $ref: "#/components/schemas/MasterBookingItem" },
              },
              reviews: {
                type: "array",
                description: "До 2 последних отзывов без ответа.",
                items: {
                  type: "object",
                  required: ["id", "authorName", "rating", "text", "createdAt"],
                  properties: {
                    id: { type: "string", description: "Публичный токен отзыва." },
                    authorName: { type: "string" },
                    rating: { type: "integer", minimum: 1, maximum: 5 },
                    text: { type: "string", nullable: true },
                    createdAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          today: {
            type: "array",
            description: "Записи сегодняшних суток салона, по времени.",
            items: {
              allOf: [
                { $ref: "#/components/schemas/MasterBookingItem" },
                {
                  type: "object",
                  required: ["isCurrent", "isNext"],
                  properties: { isCurrent: { type: "boolean" }, isNext: { type: "boolean" } },
                },
              ],
            },
          },
        },
      },
      MasterKanbanPageData: {
        type: "object",
        required: ["column", "timezone", "showWorkContext", "counts", "stats", "items", "nextCursor", "total"],
        properties: {
          column: { type: "string", enum: ["pending", "confirmed", "today", "done", "cancelled"] },
          timezone: { type: "string" },
          showWorkContext: { type: "boolean" },
          counts: {
            type: "object",
            description: "Размер каждой колонки после фильтров.",
            required: ["pending", "confirmed", "today", "done", "cancelled"],
            properties: {
              pending: { type: "integer" },
              confirmed: { type: "integer" },
              today: { type: "integer" },
              done: { type: "integer" },
              cancelled: { type: "integer" },
            },
          },
          stats: {
            type: "object",
            required: ["total", "pendingSum", "confirmedSum"],
            properties: {
              total: { type: "integer" },
              pendingSum: { type: "integer", description: "Копейки." },
              confirmedSum: { type: "integer", description: "Копейки: подтверждённые и идущие." },
            },
          },
          items: {
            type: "array",
            items: {
              allOf: [
                { $ref: "#/components/schemas/MasterBookingItem" },
                {
                  type: "object",
                  required: ["reviewRating"],
                  properties: { reviewRating: { type: "integer", nullable: true } },
                },
              ],
            },
          },
          nextCursor: { type: "string", nullable: true },
          total: { type: "integer", description: "Размер колонки." },
        },
      },
      MasterScheduleWeekJsonData: {
        type: "object",
        required: ["timezone", "from", "to", "todayKey", "showWorkContext", "hourRange", "kpi", "days"],
        properties: {
          timezone: { type: "string" },
          from: { type: "string", format: "date" },
          to: { type: "string", format: "date", description: "Последний день недели, включительно." },
          todayKey: { type: "string", format: "date" },
          showWorkContext: { type: "boolean" },
          hourRange: {
            type: "object",
            description: "Часы сетки (0–24) по рабочим часам, записям и блокам недели.",
            required: ["start", "end"],
            properties: { start: { type: "integer" }, end: { type: "integer" } },
          },
          kpi: {
            type: "object",
            required: [
              "weekBookingsCount",
              "weekRevenue",
              "weekRevenueSplit",
              "loadPct",
              "totalWorkingHours",
              "freeSlotsToday",
              "firstFreeAfter",
            ],
            properties: {
              weekBookingsCount: { type: "integer" },
              weekRevenue: { type: "integer", description: "Копейки." },
              weekRevenueSplit: { $ref: "#/components/schemas/RevenueSplit" },
              loadPct: { type: "integer" },
              totalWorkingHours: { type: "integer" },
              freeSlotsToday: { type: "integer" },
              firstFreeAfter: { type: "string", nullable: true, description: "`HH:MM` по часам салона." },
            },
          },
          days: {
            type: "array",
            items: {
              type: "object",
              required: [
                "date",
                "weekday",
                "isToday",
                "isOff",
                "workingIntervals",
                "breaks",
                "fixedStarts",
                "timeBlocks",
                "bookings",
              ],
              properties: {
                date: { type: "string", format: "date" },
                weekday: { type: "integer", minimum: 0, maximum: 6, description: "0 = воскресенье." },
                isToday: { type: "boolean" },
                isOff: { type: "boolean" },
                workingIntervals: { type: "array", items: { $ref: "#/components/schemas/HmInterval" } },
                breaks: { type: "array", items: { $ref: "#/components/schemas/HmInterval" } },
                fixedStarts: {
                  type: "array",
                  nullable: true,
                  items: { type: "string" },
                  description: "«Фиксированное время»: разрешённые начала `HH:MM`; `null` — сетка слотов.",
                },
                timeBlocks: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id", "type", "note", "startAtUtc", "endAtUtc"],
                    properties: {
                      id: { type: "string" },
                      type: { type: "string", enum: ["BREAK", "BLOCK"] },
                      note: { type: "string", nullable: true },
                      startAtUtc: { type: "string", format: "date-time" },
                      endAtUtc: { type: "string", format: "date-time" },
                    },
                  },
                },
                bookings: {
                  type: "array",
                  description: "Без отменённых, отклонённых и неявок.",
                  items: { $ref: "#/components/schemas/MasterBookingItem" },
                },
              },
            },
          },
        },
      },
      HmInterval: {
        type: "object",
        description: "Интервал `HH:MM`–`HH:MM` по часам салона.",
        required: ["start", "end"],
        properties: { start: { type: "string" }, end: { type: "string" } },
      },
      MasterClientsPageData: {
        type: "object",
        required: ["windowMonths", "tab", "sort", "q", "kpi", "tabCounts", "items", "nextCursor", "total"],
        properties: {
          windowMonths: { type: "integer", description: "Окно CRM в месяцах." },
          tab: { type: "string", enum: ["all", "new", "regular", "vip", "sleeping"] },
          sort: { type: "string", enum: ["recent", "alphabetical", "ltv_desc"] },
          q: { type: "string" },
          kpi: {
            type: "object",
            description: "По всему окну, без фильтров.",
            required: ["totalCount", "newThisMonthCount", "totalLtv", "avgLtv", "avgFrequency", "retentionPct"],
            properties: {
              totalCount: { type: "integer" },
              newThisMonthCount: { type: "integer" },
              totalLtv: { type: "integer", description: "Копейки." },
              avgLtv: { type: "integer", description: "Копейки." },
              avgFrequency: { type: "number", description: "Визитов на клиента." },
              retentionPct: { type: "integer" },
            },
          },
          tabCounts: {
            type: "object",
            required: ["all", "new", "regular", "vip", "sleeping"],
            properties: {
              all: { type: "integer" },
              new: { type: "integer" },
              regular: { type: "integer" },
              vip: { type: "integer" },
              sleeping: { type: "integer" },
            },
          },
          items: {
            type: "array",
            items: {
              type: "object",
              required: [
                "key",
                "clientUserId",
                "displayName",
                "contact",
                "visitsCount",
                "totalAmount",
                "lastVisitAt",
                "daysSinceLastVisit",
                "statuses",
                "workContexts",
              ],
              properties: {
                key: { type: "string", description: "`user:<id>` или `phone:<номер>`; в URL — `encodeURIComponent`." },
                clientUserId: { type: "string", nullable: true },
                displayName: { type: "string" },
                contact: { type: "string", nullable: true, description: "Телефон, иначе email, иначе Telegram." },
                visitsCount: { type: "integer" },
                totalAmount: { type: "integer", description: "Копейки." },
                lastVisitAt: { type: "string", format: "date-time", nullable: true },
                daysSinceLastVisit: { type: "integer", nullable: true },
                statuses: { type: "array", items: { type: "string", enum: ["new", "regular", "vip", "sleeping"] } },
                workContexts: { type: "array", items: { $ref: "#/components/schemas/BookingWorkContext" } },
              },
            },
          },
          nextCursor: { type: "string", nullable: true },
          total: { type: "integer", description: "После `tab` и `q`." },
        },
      },
      MasterReviewTag: {
        type: "object",
        required: ["id", "code", "label", "icon", "type"],
        properties: {
          id: { type: "string" },
          code: { type: "string" },
          label: { type: "string" },
          icon: { type: "string", nullable: true },
          type: { type: "string", enum: ["PUBLIC", "PRIVATE"] },
        },
      },
      MasterReviewsPageData: {
        type: "object",
        required: ["filter", "stats", "filterCounts", "items", "nextCursor", "total"],
        properties: {
          filter: { type: "string", enum: ["all", "unanswered", "good", "bad"] },
          stats: {
            type: "object",
            description: "По последним 100 отзывам, без фильтра.",
            required: [
              "totalCount",
              "avgRating",
              "distribution",
              "responseRate",
              "unansweredCount",
              "avgResponseMs",
              "withPhotosCount",
              "trendValue",
            ],
            properties: {
              totalCount: { type: "integer" },
              avgRating: { type: "number" },
              distribution: {
                type: "object",
                required: ["1", "2", "3", "4", "5"],
                properties: {
                  "1": { type: "integer" },
                  "2": { type: "integer" },
                  "3": { type: "integer" },
                  "4": { type: "integer" },
                  "5": { type: "integer" },
                },
              },
              responseRate: { type: "integer", description: "Процент отзывов с ответом мастера." },
              unansweredCount: { type: "integer" },
              avgResponseMs: { type: "number", nullable: true },
              withPhotosCount: { type: "integer" },
              trendValue: { type: "number", nullable: true },
            },
          },
          filterCounts: {
            type: "object",
            required: ["all", "unanswered", "good", "bad"],
            properties: {
              all: { type: "integer" },
              unanswered: { type: "integer" },
              good: { type: "integer" },
              bad: { type: "integer" },
            },
          },
          items: {
            type: "array",
            items: {
              type: "object",
              required: [
                "id",
                "bookingId",
                "rating",
                "text",
                "authorName",
                "createdAt",
                "serviceTitle",
                "replyText",
                "repliedAt",
                "reportedAt",
                "isNew",
                "isStudioVisit",
                "canReply",
                "publicTags",
                "privateTags",
              ],
              properties: {
                id: { type: "string", description: "Публичный токен для `/api/reviews/{id}/reply|suggest-reply|report`." },
                bookingId: { type: "string", nullable: true },
                rating: { type: "integer", minimum: 1, maximum: 5 },
                text: { type: "string", nullable: true },
                authorName: { type: "string" },
                createdAt: { type: "string", format: "date-time" },
                serviceTitle: { type: "string", nullable: true },
                replyText: { type: "string", nullable: true },
                repliedAt: { type: "string", format: "date-time", nullable: true },
                reportedAt: { type: "string", format: "date-time", nullable: true },
                isNew: { type: "boolean", description: "Последние 7 дней и без ответа." },
                isStudioVisit: { type: "boolean" },
                canReply: { type: "boolean", description: "`false`: отзыв о визите в студию, отвечает студия." },
                publicTags: { type: "array", items: { $ref: "#/components/schemas/MasterReviewTag" } },
                privateTags: { type: "array", items: { $ref: "#/components/schemas/MasterReviewTag" } },
              },
            },
          },
          nextCursor: { type: "string", nullable: true },
          total: { type: "integer", description: "После фильтра." },
        },
      },
      MasterServicePackage: {
        type: "object",
        required: [
          "id",
          "name",
          "isEnabled",
          "discountType",
          "discountValue",
          "sortOrder",
          "services",
          "totalPrice",
          "discountAmount",
          "finalPrice",
          "totalDurationMin",
          "hasDisabledComponent",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          isEnabled: { type: "boolean" },
          discountType: { type: "string", enum: ["PERCENT", "FIXED"] },
          discountValue: { type: "integer", description: "PERCENT — проценты; FIXED — копейки." },
          sortOrder: { type: "integer" },
          services: {
            type: "array",
            description: "Услуги пакета в порядке каталога мастера.",
            items: {
              type: "object",
              required: ["id", "title", "price", "durationMin", "isEnabled"],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                price: { type: "integer", description: "Копейки." },
                durationMin: { type: "integer" },
                isEnabled: { type: "boolean" },
              },
            },
          },
          totalPrice: { type: "integer", description: "Копейки: сумма услуг." },
          discountAmount: { type: "integer", description: "Копейки: PERCENT — округлённый процент, FIXED — не больше суммы." },
          finalPrice: { type: "integer", description: "Копейки, не меньше 0." },
          totalDurationMin: { type: "integer" },
          hasDisabledComponent: { type: "boolean", description: "Хотя бы одна услуга пакета выключена." },
        },
      },
      MasterServicePackagesData: {
        type: "object",
        required: ["packages"],
        properties: {
          packages: { type: "array", items: { $ref: "#/components/schemas/MasterServicePackage" } },
        },
      },
      CreateMasterServicePackageInput: {
        type: "object",
        required: ["name", "serviceIds", "discountType", "discountValue"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          serviceIds: { type: "array", minItems: 2, maxItems: 20, items: { type: "string" } },
          discountType: { type: "string", enum: ["PERCENT", "FIXED"] },
          discountValue: { type: "integer", minimum: 0, maximum: 1000000 },
          isEnabled: { type: "boolean" },
        },
      },
      ClientReviewTarget: {
        type: "object",
        required: ["type", "id", "name", "avatarUrl", "publicUsername"],
        properties: {
          type: { type: "string", enum: ["MASTER", "STUDIO"] },
          id: { type: "string", description: "Provider CUID." },
          name: { type: "string", description: "«—», если провайдера больше нет." },
          avatarUrl: { type: "string", nullable: true },
          publicUsername: { type: "string", nullable: true },
        },
      },
      ClientReviewsData: {
        type: "object",
        required: ["reviews", "kpi", "pending"],
        properties: {
          reviews: {
            type: "array",
            items: {
              type: "object",
              required: [
                "id", "rating", "text", "createdAt", "updatedAt", "canEdit", "hasReply", "replyText",
                "repliedAt", "target", "bookingId", "serviceName",
              ],
              properties: {
                id: { type: "string", description: "CUID отзыва (PATCH/DELETE `/api/reviews/{id}` его принимают)." },
                rating: { type: "integer", minimum: 1, maximum: 5 },
                text: { type: "string", nullable: true },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
                canEdit: { type: "boolean", description: "48 ч от публикации." },
                hasReply: { type: "boolean" },
                replyText: { type: "string", nullable: true },
                repliedAt: { type: "string", format: "date-time", nullable: true },
                target: { $ref: "#/components/schemas/ClientReviewTarget" },
                bookingId: { type: "string", nullable: true },
                serviceName: { type: "string", nullable: true },
              },
            },
          },
          kpi: {
            type: "object",
            required: ["total", "averageRating", "respondedCount", "pendingCount"],
            properties: {
              total: { type: "integer" },
              averageRating: { type: "number", nullable: true },
              respondedCount: { type: "integer" },
              pendingCount: { type: "integer" },
            },
          },
          pending: {
            type: "array",
            description: "До 10 визитов, ждущих отзыва; цель — записанный провайдер (у студийной записи — студия).",
            items: {
              type: "object",
              required: ["bookingId", "serviceName", "endAtUtc", "daysLeft", "target"],
              properties: {
                bookingId: { type: "string" },
                serviceName: { type: "string", nullable: true },
                endAtUtc: { type: "string", format: "date-time" },
                daysLeft: { type: "integer", minimum: 0 },
                target: { $ref: "#/components/schemas/ClientReviewTarget" },
              },
            },
          },
        },
      },
      PublicModelOfferItem: {
        type: "object",
        description:
          "Предложение для моделей. Без внутренних id (правило 12): адрес — `publicCode`, мастер — `publicUsername`. " +
          "Дата и время — настенные часы мастера (не конвертировать). Цены — копейки.",
        required: [
          "publicCode", "dateLocal", "timeRangeStartLocal", "timeRangeEndLocal", "price", "extraBusyMin",
          "requirements", "service", "master",
        ],
        properties: {
          publicCode: { type: "string" },
          dateLocal: { type: "string", format: "date" },
          timeRangeStartLocal: { type: "string", description: "HH:mm" },
          timeRangeEndLocal: { type: "string", description: "HH:mm" },
          price: { type: "number", nullable: true, description: "Копейки; null или 0 — бесплатно для модели." },
          extraBusyMin: { type: "integer", description: "Доп. время мастера на съёмку после услуги, мин." },
          requirements: { type: "array", items: { type: "string" } },
          service: {
            type: "object",
            required: ["title", "description", "durationMin", "originalPrice", "category"],
            properties: {
              title: { type: "string" },
              description: { type: "string", nullable: true },
              durationMin: { type: "integer" },
              originalPrice: { type: "number", nullable: true, description: "Копейки, цена мастера без скидки." },
              category: {
                type: "object",
                nullable: true,
                required: ["title", "slug"],
                properties: { title: { type: "string" }, slug: { type: "string", nullable: true } },
              },
            },
          },
          master: {
            type: "object",
            required: ["name", "publicUsername", "avatarUrl", "ratingAvg", "ratingCount", "city"],
            properties: {
              name: { type: "string" },
              publicUsername: { type: "string", nullable: true },
              avatarUrl: { type: "string", nullable: true },
              ratingAvg: { type: "number" },
              ratingCount: { type: "integer" },
              city: { type: "string", nullable: true },
            },
          },
        },
      },
      PublicModelOfferData: {
        type: "object",
        required: ["offer"],
        properties: { offer: { $ref: "#/components/schemas/PublicModelOfferItem" } },
      },
      MobilePlatformVersions: {
        type: "object",
        required: ["ios", "android"],
        properties: {
          ios: { type: "string", description: "MAJOR.MINOR.PATCH" },
          android: { type: "string", description: "MAJOR.MINOR.PATCH" },
        },
      },
      MobileAppConfig: {
        type: "object",
        required: ["minVersion", "latestVersion", "authMethods", "features", "pushProviders", "legal"],
        properties: {
          minVersion: {
            $ref: "#/components/schemas/MobilePlatformVersions",
            description: "Ниже — экран «Обновите приложение».",
          },
          latestVersion: { $ref: "#/components/schemas/MobilePlatformVersions" },
          authMethods: {
            type: "object",
            required: ["phone", "email", "vk", "yandex", "telegram"],
            properties: {
              phone: { type: "boolean" },
              email: { type: "boolean" },
              vk: { type: "boolean" },
              yandex: { type: "boolean" },
              telegram: { type: "boolean" },
            },
          },
          features: {
            type: "object",
            required: ["visualSearch", "onlinePayments", "push"],
            properties: {
              visualSearch: { type: "boolean" },
              onlinePayments: { type: "boolean" },
              push: {
                type: "boolean",
                description:
                  "MOBILE-B2: push в приложение реально уходит — включена отправка " +
                  "(`MOBILE_PUSH_SENDING_ENABLED`) и настроен хотя бы один провайдер. Пока false — не " +
                  "просить разрешение на уведомления.",
              },
            },
          },
          pushProviders: {
            type: "object",
            description: "MOBILE-B2: через какие сервисы push сейчас уходит (все false, пока `features.push` false).",
            required: ["fcm", "apns", "rustore"],
            properties: {
              fcm: { type: "boolean" },
              apns: { type: "boolean" },
              rustore: { type: "boolean" },
            },
          },
          legal: {
            type: "object",
            required: ["termsUrl", "privacyUrl", "consentUrl"],
            properties: {
              termsUrl: { type: "string" },
              privacyUrl: { type: "string" },
              consentUrl: { type: "string" },
            },
          },
        },
      },
    },
  },
  paths: {
    "/api/catalog/search": {
      get: {
        operationId: "catalogSearch",
        summary: "Search catalog for masters/studios",
        tags: ["mobile", "catalog"],
        security: optionalAuth,
        parameters: [
          catalogCityQuery,
          { name: "serviceQuery", in: "query", required: false, schema: { type: "string" } },
          { name: "district", in: "query", required: false, schema: { type: "string" } },
          { name: "date", in: "query", required: false, schema: { type: "string", format: "date" } },
          // CATALOG-DATE-TIME-FILTER: часы салона `HH:MM`, окошко в `[timeFrom, timeTo)`.
          { name: "timeFrom", in: "query", required: false, schema: { type: "string", maxLength: 5, description: "HH:MM, часы салона" } },
          { name: "timeTo", in: "query", required: false, schema: { type: "string", maxLength: 5, description: "HH:MM, часы салона" } },
            { name: "priceMin", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
            { name: "priceMax", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
            { name: "availableToday", in: "query", required: false, schema: { type: "boolean" } },
            { name: "hot", in: "query", required: false, schema: { type: "boolean" } },
          { name: "ratingMin", in: "query", required: false, schema: { type: "number", minimum: 0, maximum: 5 } },
          { name: "entityType", in: "query", required: false, schema: { type: "string", enum: ["all", "master", "studio"] } },
          { name: "view", in: "query", required: false, schema: { type: "string", enum: ["list", "map"] } },
          { name: "sort", in: "query", required: false, schema: { type: "string", enum: ["relevance", "rating", "price-asc", "price-desc", "distance", "popular"] } },
          { name: "lat", in: "query", required: false, schema: { type: "number", minimum: -90, maximum: 90 } },
          { name: "lng", in: "query", required: false, schema: { type: "number", minimum: -180, maximum: 180 } },
          { name: "bbox", in: "query", required: false, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 40 } },
          { name: "cursor", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/CatalogSearchData" }),
          "400": errorResponse("VALIDATION_ERROR | CITY_NOT_FOUND"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/catalog/autocomplete": {
      get: {
        operationId: "catalogAutocomplete",
        summary: "Catalog search-bar suggestions: categories + providers by name",
        description:
          "Без лимита роута (клиент дебаунсит). MOBILE-B1: `city` — синоним `citySlug` (сужает только " +
          "подсказки мастеров; неизвестный slug — просто пустой список мастеров, без 400).",
        tags: ["mobile", "catalog"],
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string", minLength: 2, maxLength: 50 } },
          {
            name: "city",
            in: "query",
            required: false,
            schema: { type: "string", maxLength: 64 },
            description: "MOBILE-B1: slug города (`GET /api/cities`); при обоих главнее `citySlug`.",
          },
          { name: "citySlug", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/CatalogAutocompleteData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/cities": {
      get: {
        operationId: "citiesList",
        summary: "Cities to choose from (slug is the `city` parameter of catalog and feeds)",
        description:
          "MOBILE-B1: активные города в порядке выбора. `slug` — значение `?city=` у каталога и лент. " +
          "Публичный справочник с кэшем CDN (`Cache-Control: public, …`).",
        tags: ["mobile", "cities"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/CityListData" }),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/search/availability": {
      get: {
        operationId: "searchAvailability",
        summary: "Catalog search by time: providers with free windows for a service on a date",
        tags: ["mobile", "catalog"],
        parameters: [
          cityQuery,
          { name: "serviceId", in: "query", required: false, schema: { type: "string" } },
          { name: "date", in: "query", required: false, schema: { type: "string", format: "date" } },
          { name: "timeFrom", in: "query", required: false, schema: { type: "string", description: "HH:MM, часы салона" } },
          { name: "timeTo", in: "query", required: false, schema: { type: "string", description: "HH:MM, часы салона" } },
          { name: "district", in: "query", required: false, schema: { type: "string" } },
          { name: "priceMin", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
          { name: "priceMax", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
          { name: "availableToday", in: "query", required: false, schema: { type: "boolean" } },
          { name: "hot", in: "query", required: false, schema: { type: "boolean" } },
          { name: "ratingMin", in: "query", required: false, schema: { type: "number", minimum: 0, maximum: 5 } },
          { name: "entityType", in: "query", required: false, schema: { type: "string", enum: ["all", "master", "studio"] } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 60 } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/AvailabilitySearchData" }),
          "400": errorResponse("VALIDATION_ERROR | CITY_NOT_FOUND"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/public/model-offers": {
      get: {
        operationId: "publicModelOffers",
        summary: "Public model offers list",
        description:
          "`city` здесь исторически — подстрока адреса (названия из фильтров). MOBILE-B1: если значение — " +
          "slug активного города (`GET /api/cities`), фильтр идёт по городу провайдера; иначе — прежний поиск " +
          "по адресу. Поэтому неизвестный `city` здесь НЕ 400.",
        tags: ["mobile", "model-offers"],
        parameters: [
          { name: "city", in: "query", required: false, schema: { type: "string" } },
          {
            name: "categoryId",
            in: "query",
            required: false,
            description:
              "MOBILE-CLIENT-01 (B8): id категории — `e_…` из публичного справочника категорий (декодируется) " +
              "или сырой CUID (веб).",
            schema: { type: "string" },
          },
          { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 40 } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/PublicModelOffersData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/public/model-offers/{code}": {
      get: {
        operationId: "publicModelOffer",
        summary: "Public model offer by code",
        description:
          "MOBILE-CLIENT-01: одно предложение для моделей — то, что рендерит страница `/models/{code}` " +
          "(активно, дата не прошла, мастер виден). `data.offer` — форма элемента списка " +
          "`GET /api/public/model-offers`, без внутренних id. Не найдено, закрыто, прошло или код невозможной " +
          "формы — один 404 `NOT_FOUND` «Предложение не найдено.». Сессия не нужна; лимит — тир прокси " +
          "`publicApi` (120 в минуту), как у списка.",
        tags: ["mobile", "model-offers"],
        parameters: [
          {
            name: "code",
            in: "path",
            required: true,
            description: "`publicCode` из списка (до 64 символов `[A-Za-z0-9_-]`).",
            schema: { type: "string", maxLength: 64 },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/PublicModelOfferData" }),
          "404": errorResponse("NOT_FOUND"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/onboarding/professional/master": {
      post: {
        operationId: "onboardingBecomeMaster",
        summary: "Become a master: create the personal master cabinet (idempotent)",
        description:
          "Тела нет (веб шлёт пустую HTML-форму; тело игнорируется). MOBILE-B1: с `Authorization: Bearer` " +
          "или `Accept: application/json` — конверт `ok()`; иначе (веб-форма) — 303 на `/cabinet/master`, " +
          "без сессии — 303 на `/login`. Роль MASTER пишется в БД; токены перевыпускать не нужно — роли " +
          "из access-токена ни одна проверка не читает, кабинетные API пускают сразу. Актуальные роли — " +
          "`GET /api/me`. Пробный тариф создаётся фоном (ответ его не ждёт).",
        tags: ["mobile", "onboarding"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProfessionalOnboardingData" }),
          "303": { description: "Веб-форма: редирект в кабинет (или на /login без сессии)" },
          "401": errorResponse("UNAUTHORIZED"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
          "503": errorResponse("RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    "/api/onboarding/professional/studio": {
      post: {
        operationId: "onboardingOpenStudio",
        summary: "Open a studio: create the studio cabinet with the caller as OWNER (idempotent)",
        description:
          "Тела нет. MOBILE-B1: Bearer / `Accept: application/json` — конверт `ok()`; веб-форма — 303 на " +
          "`/cabinet/studio` (без сессии — на `/login`). Роль STUDIO пишется в БД, токены не перевыпускаются " +
          "(см. onboardingBecomeMaster).",
        tags: ["mobile", "onboarding"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProfessionalOnboardingData" }),
          "303": { description: "Веб-форма: редирект в кабинет (или на /login без сессии)" },
          "401": errorResponse("UNAUTHORIZED"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
          "503": errorResponse("RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    "/api/providers": {
      get: {
        summary: "List providers",
        tags: ["providers"],
        parameters: [
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProviderListData" }),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/providers/{id}": {
      get: {
        operationId: "providerProfile",
        summary: "Get provider profile",
        description:
          "Публичный профиль мастера или студии. `id` — CUID провайдера или адрес профиля: MOBILE-B3 — адрес " +
          "ищется как на странице `/u/{username}` (регистр не важен, старый адрес из `PublicUsernameAlias` ведёт " +
          "на текущий профиль); в ответе `publicUsername` — текущий адрес. Не найден или не опубликован — 404.",
        tags: ["mobile", "providers"],
        parameters: [providerIdParam],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProviderProfileData" }),
          "400": errorResponse("Validation error"),
          "404": errorResponse("Provider not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/public/providers/{providerId}/packages": {
      get: {
        operationId: "publicProviderPackages",
        summary: "Service packages a provider page sells (solo master or studio)",
        description:
          "MOBILE-B3: на вебе каталог пакетов есть только в SSR страницы. Соло-мастер — тот же каталог, что у " +
          "`/u/{username}`; студия — пакеты студии (цены/длительности базовые); мастер студии — `kind: none`. " +
          "Скрыты пакеты с выключенной услугой (студия: и с неактивной, и меньше двух услуг). Ответ одинаков для " +
          "всех зрителей.",
        tags: ["mobile", "providers"],
        parameters: [publicProviderKeyParam],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/PublicProviderPackagesData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "404": errorResponse("PROVIDER_NOT_FOUND"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
    },
    "/api/public/providers/{providerId}/overview": {
      get: {
        operationId: "publicProviderOverview",
        summary: "Provider page hero extras + viewer flags",
        description:
          "MOBILE-B3: то, что веб показывает в шапке сверх `GET /api/providers/{id}` (тариф, стаж, ближайшее " +
          "окошко, студия мастера), и флаги зрителя (избранное, владелец, запись для отзыва). Сессия " +
          "необязательна: битый/протухший Bearer — гость (не 401), флаги `false`/`null`. Общая часть кэшируется " +
          "на сервере 60 с на провайдера, `viewer` — никогда.",
        tags: ["mobile", "providers"],
        security: optionalAuth,
        parameters: [publicProviderKeyParam],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/PublicProviderOverviewData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "404": errorResponse("PROVIDER_NOT_FOUND"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
    },
    "/api/studios/{id}": {
      get: {
        summary: "Get studio private profile",
        tags: ["studio"],
        parameters: [providerIdParam],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioPrivateProfileData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
      patch: {
        summary: "Update studio private profile",
        tags: ["studio"],
        parameters: [providerIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/StudioPrivateProfileUpdateInput" },
            },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioPrivateProfileData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studios/{id}/portfolio": {
      get: {
        summary: "Studio portfolio photo captions (performer + service) and pickers",
        tags: ["studio"],
        parameters: [providerIdParam],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioPortfolioAttributionData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studios/{id}/portfolio/{assetId}": {
      patch: {
        summary: "Set performer and service caption of a studio portfolio photo",
        tags: ["studio"],
        parameters: [
          providerIdParam,
          { name: "assetId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["performerId", "serviceId"],
                properties: {
                  performerId: { type: "string", nullable: true },
                  serviceId: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: {
          "200": okResponse({
            type: "object",
            required: ["item"],
            properties: { item: { $ref: "#/components/schemas/StudioPortfolioAttributionItem" } },
          }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Photo, master or service not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    // GUEST-MANAGE-LINK (2026-09-24): управление гостевой записью по подписанной ссылке.
    "/api/public/bookings/manage/{token}/cancel": {
      post: {
        summary: "Cancel a guest booking (whole package) by its signed manage link",
        tags: ["bookings"],
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({
            type: "object",
            required: ["cancelled"],
            properties: { cancelled: { type: "integer" } },
          }),
          "403": errorResponse("Booking belongs to an account — manage it from the cabinet"),
          "404": errorResponse("Link is invalid or expired"),
          "409": errorResponse("Booking can no longer be cancelled"),
          "429": errorResponse("Rate limited"),
          "503": errorResponse("Rate limiter unavailable"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/public/bookings/manage/{token}/review": {
      post: {
        summary: "Leave a review for a finished guest booking by its signed manage link",
        tags: ["bookings", "reviews"],
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReviewCreateInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/ReviewData" }, "Created"),
          "400": errorResponse("Validation error"),
          "403": errorResponse("Review not allowed (window) or booking belongs to an account"),
          "404": errorResponse("Link is invalid or expired, or the booking is not covered by the link"),
          "409": errorResponse("Review already left"),
          "429": errorResponse("Rate limited"),
          "503": errorResponse("Rate limiter unavailable"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/public/bookings/manage/{token}/reschedule": {
      post: {
        summary: "Request a reschedule of a guest booking by its signed manage link",
        tags: ["bookings"],
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["bookingId", "startAtUtc", "endAtUtc", "slotLabel"],
                properties: {
                  bookingId: { type: "string" },
                  startAtUtc: { type: "string", format: "date-time" },
                  endAtUtc: { type: "string", format: "date-time" },
                  slotLabel: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": okResponse({
            type: "object",
            required: ["booking"],
            properties: {
              booking: {
                type: "object",
                required: ["id", "status"],
                properties: { id: { type: "string" }, status: { type: "string" } },
              },
            },
          }),
          "400": errorResponse("Validation error"),
          "403": errorResponse("Booking belongs to an account — manage it from the cabinet"),
          "404": errorResponse("Link is invalid or expired"),
          "409": errorResponse("Booking can no longer be rescheduled"),
          "429": errorResponse("Rate limited"),
          "503": errorResponse("Rate limiter unavailable"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/notifications/center": {
      get: {
        summary: "Get unified notifications center payload",
        tags: ["notifications"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/NotificationCenterData" }),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/masters/{id}/services": {
      get: {
        summary: "List master services",
        tags: ["services", "masters"],
        parameters: [masterIdParam],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProviderServicesData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "409": errorResponse("Master belongs to studio"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create master service",
        tags: ["services", "masters"],
        parameters: [masterIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProviderServiceCreateInput" },
            },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/ProviderServiceData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
      put: {
        summary: "Update master service",
        tags: ["services", "masters"],
        parameters: [masterIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProviderServiceUpdateInput" },
            },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProviderServiceData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
      delete: {
        summary: "Delete master service",
        tags: ["services", "masters"],
        parameters: [masterIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProviderServiceDeleteInput" },
            },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/bookings": {
      get: {
        summary: "List provider bookings for owner",
        tags: ["bookings"],
        parameters: [
          {
            name: "providerId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingListData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Provider not found"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create booking",
        tags: ["bookings"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BookingCreateInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/BookingData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Booking conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/bookings/{id}/decline-reschedule": {
      post: {
        summary: "Decline a proposed reschedule (reverts the booking)",
        description: "Вторая половина двустороннего согласования переноса (инв. #32): другая сторона либо подтверждает через /confirm, либо отклоняет здесь и бронь возвращается к прежнему времени. Один backend для соло-мастера и studio-admin.",
        tags: ["bookings"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Booking not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/bookings/package/{id}/cancel": {
      post: {
        summary: "Cancel a booking package (whole package only)",
        description: "Инв. #34: пакет отменяется ТОЛЬКО целиком. Попытка отменить одну составляющую бронь отдельным вызовом даёт 409 PACKAGE_CANCEL_WHOLE.",
        tags: ["bookings"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BookingCancelInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Package not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/bookings/{id}/confirm": {
      post: {
        summary: "Confirm booking",
        tags: ["bookings"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Booking not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/bookings/{id}/cancel": {
      post: {
        summary: "Cancel booking",
        tags: ["bookings"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BookingCancelInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Booking not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/bookings/{id}/reschedule": {
      post: {
        summary: "Reschedule booking",
        tags: ["bookings"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BookingRescheduleInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Booking not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/masters/{id}/availability": {
      get: {
        summary: "List available slots for master",
        tags: ["schedule", "masters", "mobile"],
        parameters: [
          masterIdParam,
          serviceIdQuery,
          fromQuery,
          toQuery,
          limitQuery,
          excludeBookingIdQuery,
          moveBookingIdQuery,
          manualWindowQuery,
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/AvailabilitySlotsData" }),
          "400": errorResponse("Validation error"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/telegram/link": {
      get: {
        summary: "Generate Telegram linking URL",
        tags: ["telegram"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/TelegramLinkData" }),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/telegram/status": {
      get: {
        summary: "Get Telegram notification status",
        tags: ["telegram"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/TelegramStatusData" }),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/telegram/settings": {
      patch: {
        summary: "Update Telegram notification settings",
        tags: ["telegram"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/TelegramSettingsInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/TelegramSettingsData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/telegram/webhook": {
      post: {
        summary: "Telegram webhook (internal)",
        tags: ["telegram", "internal"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/TelegramWebhookData" }),
          "403": errorResponse("Forbidden"),
        },
      },
    },
    "/api/auth/vk/start": {
      get: {
        summary: "Start VK ID authorization flow",
        description:
          "FIX-B14: это НАВИГАЦИЯ браузера, поэтому конверта ошибки у роута нет вовсе — каждый исход " +
          "отвечает редиректом. Успех → VK ID; отказ → /login?error=<исход>, где исход один из " +
          "provider_unavailable (килсвитч ФЗ-199 либо не сконфигурирован) · consent_required " +
          "(обязательные согласия не отмечены, RKN-FIX-01) · start_failed (прочее). " +
          "Не-браузерный клиент обязан НЕ следовать редиректу и читать ключ из Location.",
        tags: ["auth", "vk"],
        responses: {
          "307": { description: "Redirect to VK ID, or back to /login?error=<исход>" },
        },
      },
    },
    "/api/auth/vk/callback": {
      get: {
        summary: "VK ID authorization callback",
        description:
          "MOBILE-AUTH-A2: флоу, начатый приложением (`/api/mobile/v1/auth/oauth/vk/start`), кончается " +
          "302 на `masterryadom://auth/callback` с `code` (вход), `linked=vk` (привязка) или `error`; " +
          "куки сессии такой флоу не ставит.",
        tags: ["auth", "vk"],
        responses: {
          "302": { description: "Mobile flow: redirect to masterryadom://auth/callback?code|linked|error" },
          "307": { description: "Redirect to cabinet" },
          "400": errorResponse("Validation error"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/auth/yandex/start": {
      get: {
        summary: "Start Yandex ID authorization flow",
        description:
          "Bespoke-parallel к VK (PKCE S256 + HMAC-signed state/verifier cookies). Согласия из формы " +
          "входа едут через подписанную state-bound cookie — см. RKN-FIX-01. FIX-B14: конверта ошибки " +
          "нет — исходы те же три, что у VK-близнеца, редиректом на /login?error=<исход>.",
        tags: ["auth", "yandex"],
        responses: {
          "307": { description: "Redirect to Yandex ID, or back to /login?error=<исход>" },
        },
      },
    },
    "/api/auth/yandex/callback": {
      get: {
        summary: "Yandex ID authorization callback",
        description:
          "Гейтится тем же флагом, что и start (session-issuing leg). Новый аккаунт без обязательных " +
          "согласий не создаётся — редирект на /login?error=consent. MOBILE-AUTH-A2: флоу приложения " +
          "кончается 302 на `masterryadom://auth/callback` с `code` / `linked=yandex` / `error`.",
        tags: ["auth", "yandex"],
        responses: {
          "302": { description: "Mobile flow: redirect to masterryadom://auth/callback?code|linked|error" },
          "307": { description: "Redirect to cabinet" },
          "400": errorResponse("Validation error"),
          "409": errorResponse("Conflict"),
          "503": errorResponse("Auth method not configured"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/integrations/vk/start": {
      get: {
        summary: "Start VK ID integration linking",
        description:
          "FIX-B14: тоже навигация (кабинетная кнопка «подключить»), конверта ошибки нет. Аудитория — " +
          "уже вошедший пользователь, поэтому адрес возврата не /login, а страница-источник (Referer, " +
          "прогнанный через sanitizeInternalPath; дефолт /cabinet/profile) с ?vk=<исход>. " +
          "Исключение — отсутствие сессии: /login?next=<страница-источник>.",
        tags: ["integrations", "vk"],
        responses: {
          "307": { description: "Redirect to VK ID, back to the connect surface with ?vk=<исход>, or /login" },
        },
      },
    },
    "/api/integrations/vk/callback": {
      get: {
        summary: "VK ID integration callback",
        tags: ["integrations", "vk"],
        responses: {
          "307": { description: "Redirect to cabinet" },
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/integrations/vk/status": {
      get: {
        summary: "Get VK integration status",
        tags: ["integrations", "vk"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/VkStatusData" }),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/integrations/vk/disable": {
      post: {
        summary: "Disable VK integration",
        tags: ["integrations", "vk"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/VkDisableData" }),
          "401": errorResponse("Unauthorized"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/auth/vk/unlink": {
      post: {
        operationId: "authVkUnlink",
        summary: "Unlink VK ID from the current user",
        description:
          "Удаляет связку VK: вход через этот VK больше не ведёт в аккаунт, уведомления ВКонтакте " +
          "выключаются вместе с ней. Нет связки — тот же ответ. Последний работающий способ входа " +
          "отвязать нельзя — `409 LAST_LOGIN_METHOD`. Bearer или кука.",
        tags: ["mobile", "auth", "vk"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProviderUnlinkData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "409": errorResponse("LAST_LOGIN_METHOD"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/auth/yandex/unlink": {
      post: {
        operationId: "authYandexUnlink",
        summary: "Unlink Yandex ID from the current user",
        description:
          "Удаляет связку Яндекс ID: вход через этот аккаунт Яндекса больше не ведёт в профиль. " +
          "Нет связки — тот же ответ. Последний работающий способ входа отвязать нельзя — " +
          "`409 LAST_LOGIN_METHOD`. Bearer или кука.",
        tags: ["mobile", "auth", "yandex"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProviderUnlinkData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "409": errorResponse("LAST_LOGIN_METHOD"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/cabinet/user/bookings": {
      get: {
        operationId: "clientBookingsList",
        summary: "Client cabinet bookings («Мои записи»)",
        description:
          "До 300 последних записей клиента и KPI. Фильтры применяются к загруженному набору, KPI — без них. " +
          "MOBILE-CLIENT-01: элементы дополнены полями (`createdAt`, `cancelledBy`, `changeComment`, " +
          "`clientChangeRequestsCount`, `changeRequestLimit`, `cancellationDeadlineHours`, `comment`, " +
          "`silentMode`, `studio`, `reviewDeadlineUtc`), прежние поля не менялись.",
        tags: ["mobile", "client", "bookings"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            description: "Группа; неизвестное значение — `all`.",
            schema: { type: "string", enum: ["all", "upcoming", "finished", "cancelled"] },
          },
          {
            name: "search",
            in: "query",
            required: false,
            description: "Подстрока имени провайдера или услуги, без учёта регистра.",
            schema: { type: "string" },
          },
          {
            name: "dateFrom",
            in: "query",
            required: false,
            description: "Начало записи не раньше (ISO date-time).",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "dateTo",
            in: "query",
            required: false,
            description: "Начало записи не позже (ISO date-time).",
            schema: { type: "string", format: "date-time" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ClientBookingsData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/cabinet/user/bookings/{id}": {
      get: {
        operationId: "clientBookingGet",
        summary: "Client cabinet booking by id",
        description:
          "MOBILE-CLIENT-01: одна запись клиента (цель push и ссылок `/bookings/{id}`); `data.booking` — ровно " +
          "элемент списка `GET /api/cabinet/user/bookings`. Чужая, несуществующая и невозможная по форме — " +
          "один 404 `BOOKING_NOT_FOUND` «Запись не найдена.» (существование чужой записи не раскрывается).",
        tags: ["mobile", "client", "bookings"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "CUID записи.",
            schema: { type: "string", maxLength: 64 },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ClientBookingData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "404": errorResponse("BOOKING_NOT_FOUND"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/cabinet/user/reviews": {
      get: {
        operationId: "clientReviewsList",
        summary: "Client cabinet reviews («Мои отзывы»)",
        description:
          "Отзывы клиента (без удалённых), KPI и до 10 визитов, ждущих отзыва. MOBILE-CLIENT-01 (B1): " +
          "цель отзыва на мастера читается из `Provider` по `targetId` — имя, аватар и `publicUsername` " +
          "у соло-мастера больше не пустые.",
        tags: ["mobile", "client", "reviews"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ClientReviewsData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/cabinet/user/profile": {
      get: {
        operationId: "clientProfileGet",
        summary: "Client cabinet profile (incl. linked VK / Yandex / Telegram)",
        description:
          "Источник флагов привязки для приложения: `data.linked.vk.linked`, " +
          "`data.linked.yandex.linked` / `enabled`.",
        tags: ["mobile", "client"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ClientProfileData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "500": errorResponse("Internal error"),
        },
      },
      patch: {
        operationId: "clientProfileUpdate",
        summary: "Update client cabinet profile",
        tags: ["mobile", "client"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ClientProfileUpdateInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ClientProfileData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "401": errorResponse("UNAUTHORIZED"),
          "409": errorResponse("ALREADY_EXISTS — номер или email заняты другим аккаунтом"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/me/sessions": {
      get: {
        operationId: "meSessionsList",
        summary: "Active sessions of the current user (one per sign-in)",
        description:
          "MOBILE-AUTH-A3: семьи сессий, самые свежие по активности — первыми. `current` — сессия " +
          "этого запроса. `no-store`.",
        tags: ["mobile", "me"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/SessionFamilyListData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "503": errorResponse("RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    "/api/me/sessions/{id}": {
      delete: {
        operationId: "meSessionRevoke",
        summary: "Sign out one session",
        description:
          "Завершает семью сессий: refresh больше не обновится, access-токены перестают проходить " +
          "сразу. Можно завершить и текущую. Идемпотентно (`200 {}`); чужая или несуществующая — " +
          "404 SESSION_NOT_FOUND.",
        tags: ["mobile", "me"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 }, description: "`SessionFamily.id`" },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MobileEmptyData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "404": errorResponse("SESSION_NOT_FOUND"),
          "503": errorResponse("RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    "/api/me/sessions/revoke-others": {
      post: {
        operationId: "meSessionsRevokeOthers",
        summary: "Sign out all other sessions",
        description:
          "Завершает все семьи, кроме текущей; текущая не трогается (токены не перевыдаются). " +
          "`revoked` — число завершённых активных сессий.",
        tags: ["mobile", "me"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/SessionRevokeOthersData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "503": errorResponse("RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    "/api/me": {
      get: {
        operationId: "meGet",
        summary: "Get current user profile",
        description:
          "`data.user` — форма `MeIdentity` (её же отдают мобильные входы `/api/mobile/v1/auth/*`); аноним " +
          "получает `user: null`. MOBILE-CLIENT-01: добавлены `avatarUrl` и `phoneVerified`. Ответ кэшируется " +
          "на сервере до 30 с; загрузка и удаление аватара кэш сбрасывают.",
        tags: ["mobile", "me", "client"],
        // MOBILE-AUTH-A: пример для всех сессионных роутов — Bearer наравне с кукой.
        security: [{ bearerAuth: [] }, { cookieAuth: [] }, {}],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MeIdentityData" }),
          "500": errorResponse("Internal error"),
        },
      },
      patch: {
        summary: "Update current user profile",
        tags: ["me", "client"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MeUpdateInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MeData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/me/delete": {
      delete: {
        operationId: "meDeleteAccount",
        summary: "Delete own account",
        description:
          "Необратимо. Порядок: сессия → разбор запроса (400) → живые записи (409, попытку не тратит) → " +
          "лимит одна попытка в час на адрес и на аккаунт (429) → удаление. MOBILE-CLIENT-01 (B7): ошибка " +
          "запроса не тратит попытку; удаление, упавшее по вине сервера (5xx), возвращает попытку в оба ведра; " +
          "отказ по лимиту аккаунта не тратит попытку адреса. При недоступности счётчика — отказ (fail-closed, " +
          "503 от прокси). Успех снимает куки сессии; мобильный клиент сам удаляет свои токены.",
        tags: ["mobile", "me", "client"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "deleteReviews",
            in: "query",
            required: false,
            description: "`1` — удалить и мои отзывы (учитывается, только если политика отзывов USER_CHOICE).",
            schema: { type: "string", enum: ["1"] },
          },
        ],
        responses: {
          "200": okResponse({
            type: "object",
            required: ["deleted"],
            properties: { deleted: { type: "boolean", enum: [true] } },
          }),
          "400": errorResponse("VALIDATION_ERROR"),
          "401": errorResponse("UNAUTHORIZED"),
          "409": errorResponse("ACTIVE_BOOKINGS | CLIENT_ACTIVE_BOOKINGS"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("Internal error"),
          "503": errorResponse("RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    "/api/me/bookings": {
      get: {
        summary: "List current user bookings",
        tags: ["me", "client", "bookings"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingListData" }),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/media": {
      get: {
        summary: "List media assets for entity",
        tags: ["media"],
        parameters: [
          {
            name: "entityType",
            in: "query",
            required: true,
            schema: { $ref: "#/components/schemas/MediaEntityType" },
          },
          {
            name: "entityId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "kind",
            in: "query",
            required: false,
            schema: { $ref: "#/components/schemas/MediaKind" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MediaAssetListData" }),
          "400": errorResponse("Validation error"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Upload media asset",
        tags: ["media"],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  entityType: { $ref: "#/components/schemas/MediaEntityType" },
                  entityId: { type: "string" },
                  kind: { $ref: "#/components/schemas/MediaKind" },
                  replaceAssetId: { type: "string" },
                  file: { type: "string", format: "binary" },
                },
                required: ["entityType", "entityId", "kind", "file"],
              },
            },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/MediaAssetData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/media/{id}": {
      delete: {
        summary: "Delete media asset",
        tags: ["media"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/media/file/{id}": {
      get: {
        operationId: "mediaFile",
        summary: "Serve media file (original, or a width-bounded webp preview with `?w=`)",
        description:
          "MOBILE-B1: `?w=<int>` — превью для списков: ширина округляется ВВЕРХ до 160 / 320 / 480 / 640 / " +
          "960 / 1280 (больше 1280 — 1280), пропорции сохраняются, без увеличения, формат `image/webp`. " +
          "Каждый вариант считается один раз и хранится рядом с оригиналом. Мусорный `w` (не целое, ≤0) и " +
          "не-картинки — оригинал как есть (не 400). Доступ и `Cache-Control` — как у оригинала: публичное " +
          "(аватар/портфолио опубликованного кабинета) — `public, max-age=31536000, immutable`; остальное — " +
          "по сессии (Bearer/кука) или `?mt=`-токену, `private, no-store`. Оригинал — без `w`. Свой тир " +
          "лимита `mediaRead` (300/мин; вошедшему — по аккаунту).",
        tags: ["mobile", "media"],
        security: optionalAuth,
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "w",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1 },
            description: "Желаемая ширина превью в px; округляется вверх до набора 160…1280.",
          },
          {
            name: "mt",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Короткоживущий токен приватной доставки (сервер кладёт его в ссылку); сочетается с `w`.",
          },
        ],
        responses: {
          "200": { description: "Binary image (original type, or image/webp with `w`)" },
          "401": errorResponse("UNAUTHORIZED"),
          "429": errorResponse("RATE_LIMITED"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/me/attention": {
      get: {
        summary: "Counts of items awaiting the signed-in client (bottom navigation dots)",
        tags: ["me"],
        responses: {
          "200": okResponse({
            type: "object",
            properties: {
              bookings: { type: "integer", description: "Reschedules proposed by a master, awaiting the client" },
              messages: { type: "integer", description: "Unread chat messages from masters" },
              reviews: { type: "integer", description: "Finished visits the client can still review" },
            },
            required: ["bookings", "messages", "reviews"],
          }),
        },
      },
    },
    "/api/me/welcome": {
      post: {
        summary: "Mark the testing-stage welcome dialog as seen (idempotent); `/api/me` then returns welcomePending=false",
        tags: ["me"],
        responses: {
          "200": okResponse({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }),
          "401": errorResponse("Unauthorized"),
        },
      },
    },
    "/api/me/setup-guide": {
      get: {
        summary: "«Первые шаги» of the signed-in user's own master/studio cabinet: steps, which are done, what is next",
        tags: ["me"],
        parameters: [
          {
            name: "scope",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["master", "studio"] },
            description: "Which own cabinet (default: master). Studio — the one open in the cabinet, owner or admin only.",
          },
        ],
        responses: {
          "200": okResponse({
            type: "object",
            properties: {
              guide: {
                type: "object",
                properties: {
                  scope: { type: "string", enum: ["master", "studio"] },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { id: { type: "string" }, done: { type: "boolean" }, href: { type: "string" } },
                    },
                  },
                  doneCount: { type: "integer" },
                  total: { type: "integer" },
                  nextId: { type: "string", nullable: true },
                  hidden: { type: "boolean" },
                  invitesPending: { type: "integer" },
                },
              },
            },
            required: ["guide"],
          }),
          "401": errorResponse("Unauthorized"),
          "404": errorResponse("Cabinet not found"),
        },
      },
      patch: {
        summary: "Confirm the booking rules step, or hide/show the «Первые шаги» card",
        tags: ["me"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  scope: { type: "string", enum: ["master", "studio"] },
                  action: { type: "string", enum: ["confirmRules", "hide", "show"] },
                },
                required: ["scope", "action"],
              },
            },
          },
        },
        responses: {
          "200": okResponse({ type: "object", properties: { ok: { type: "boolean" } } }),
          "400": errorResponse("Invalid body"),
          "401": errorResponse("Unauthorized"),
          "404": errorResponse("Cabinet not found"),
        },
      },
    },
    "/api/me/catalog-presence": {
      get: {
        summary: "Whether the signed-in user's own master/studio cabinet is listed in the catalog, and which conditions are missing",
        tags: ["me"],
        parameters: [
          {
            name: "type",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["master", "studio"] },
            description: "Which own cabinet to check (default: master).",
          },
        ],
        responses: {
          "200": okResponse({
            type: "object",
            properties: {
              listed: { type: "boolean" },
              gaps: {
                type: "array",
                items: { type: "string", enum: ["hidden", "address", "schedule"] },
              },
            },
            required: ["listed", "gaps"],
          }),
          "401": errorResponse("Unauthorized"),
          "404": errorResponse("Not found"),
        },
      },
    },
    "/api/cabinet/master/dashboard": {
      get: {
        operationId: "masterCabinetDashboard",
        summary: "Master cabinet «Сегодня» (dashboard)",
        description:
          "MOBILE-MASTER-C: главная кабинета мастера в JSON. Записи дня — сутки салона (`timezone`), с пометками " +
          "`isCurrent` / `isNext`; «Требуют внимания» — счётчики (как бейджи кабинета) и до 3 записей / 2 отзывов. " +
          "Свободные окошки по категориям — `GET /api/cabinet/master/dashboard/free-slots`, «Первые шаги» — " +
          "`GET /api/me/setup-guide?scope=master`. Ответ `private, no-store`.",
        tags: ["mobile", "master", "dashboard"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterCabinetDashboardData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "403": errorResponse("FORBIDDEN — не мастер"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
    },
    "/api/cabinet/master/bookings": {
      get: {
        operationId: "masterCabinetBookingsColumn",
        summary: "Master cabinet bookings kanban, one column page",
        description:
          "MOBILE-MASTER-C: канбан записей мастера по колонке, постранично. `pending` — ждут подтверждения или ответа " +
          "на перенос; `confirmed` — подтверждены (60 дней вперёд); `today` — приём уже идёт; `done` — завершены за " +
          "60 дней, новые сверху; `cancelled` — отменены, отклонены и неявки за 30 дней. Фильтры `q` / `tab` / `client` " +
          "применяются до разбиения: `counts` и `stats` — по отфильтрованному набору. Курсор непрозрачный; " +
          "испорченный — 400 «Список обновился. Загрузите его заново.».",
        tags: ["mobile", "master", "bookings"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "column",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["pending", "confirmed", "today", "done", "cancelled"], default: "pending" },
          },
          {
            name: "q",
            in: "query",
            required: false,
            description: "Подстрока имени клиента или услуги.",
            schema: { type: "string", maxLength: 80 },
          },
          {
            name: "tab",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["all", "new", "regular"], default: "all" },
          },
          {
            name: "client",
            in: "query",
            required: false,
            description: "`historyToken` из карточки записи или клиента: только записи этого клиента.",
            schema: { type: "string", minLength: 1, maxLength: 512 },
          },
          { name: "cursor", in: "query", required: false, schema: { type: "string", maxLength: 64 } },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterKanbanPageData" }),
          "400": errorResponse("VALIDATION_ERROR — параметры, курсор или устаревший токен клиента"),
          "401": errorResponse("UNAUTHORIZED"),
          "403": errorResponse("FORBIDDEN — не мастер"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
    },
    "/api/cabinet/master/bookings/{id}": {
      get: {
        operationId: "masterCabinetBookingGet",
        summary: "Master cabinet booking card",
        description:
          "MOBILE-MASTER-C: карточка записи, которую мастер выполняет (любой его рабочий профиль): клиент с телефоном " +
          "и ключом CRM-карточки, комментарий, ответы, переносы, отмена, отзыв и `actions`. Чужая, несуществующая и " +
          "невозможная по форме — один 404 `BOOKING_NOT_FOUND` «Запись не найдена.».",
        tags: ["mobile", "master", "bookings"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "CUID записи.", schema: { type: "string", maxLength: 64 } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterBookingDetailData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "403": errorResponse("FORBIDDEN — не мастер"),
          "404": errorResponse("BOOKING_NOT_FOUND"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
    },
    "/api/cabinet/master/schedule/week": {
      get: {
        operationId: "masterCabinetScheduleWeek",
        summary: "Master cabinet schedule, 7 days",
        description:
          "MOBILE-MASTER-C: семь дней расписания с `from`: рабочие часы, перерывы, «Фиксированное время», выходной, " +
          "блокировки и записи (без отменённых, отклонённых и неявок). Даты и `HH:MM` — по часам салона, записи и " +
          "блоки выбираются по суткам салона.",
        tags: ["mobile", "master", "schedule"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "from",
            in: "query",
            required: false,
            description: "Первый день, `YYYY-MM-DD` (настоящая дата). Без него — понедельник текущей недели салона.",
            schema: { type: "string", format: "date" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterScheduleWeekJsonData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "401": errorResponse("UNAUTHORIZED"),
          "403": errorResponse("FORBIDDEN — не мастер"),
          "404": errorResponse("MASTER_NOT_FOUND"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
    },
    "/api/cabinet/master/clients": {
      get: {
        operationId: "masterCabinetClients",
        summary: "Master cabinet clients (CRM), page",
        description:
          "MOBILE-MASTER-C: клиенты из записей всех рабочих профилей за окно CRM (`windowMonths`), постранично. " +
          "`kpi` и `tabCounts` — по всему окну; `total` — после `tab` и `q`. Каждый запрос пишет след массового " +
          "чтения ПДн (RKN-FIX-10). Карточка — `GET /api/master/clients/{key}/detail` и `…/card`.",
        tags: ["mobile", "master", "clients"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "q",
            in: "query",
            required: false,
            description: "Имя или контакт.",
            schema: { type: "string", maxLength: 80 },
          },
          {
            name: "tab",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["all", "new", "regular", "vip", "sleeping"], default: "all" },
          },
          {
            name: "sort",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["recent", "alphabetical", "ltv_desc"], default: "recent" },
          },
          { name: "cursor", in: "query", required: false, schema: { type: "string", maxLength: 64 } },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 50, default: 30 },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterClientsPageData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "401": errorResponse("UNAUTHORIZED"),
          "403": errorResponse("FORBIDDEN — не мастер"),
          "404": errorResponse("MASTER_NOT_FOUND"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
    },
    "/api/cabinet/master/reviews": {
      get: {
        operationId: "masterCabinetReviews",
        summary: "Master cabinet reviews, page",
        description:
          "MOBILE-MASTER-C: последние 100 отзывов всех рабочих профилей мастера, постранично; `stats` и " +
          "`filterCounts` — по всем ста, `total` — после фильтра. Ответ, правка ответа, подсказка и жалоба — " +
          "`POST|PATCH /api/reviews/{id}/reply`, `POST /api/reviews/{id}/suggest-reply`, `POST /api/reviews/{id}/report`.",
        tags: ["mobile", "master", "reviews"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: "filter",
            in: "query",
            required: false,
            description: "`good` — 4–5 звёзд, `bad` — 1–3.",
            schema: { type: "string", enum: ["all", "unanswered", "good", "bad"], default: "all" },
          },
          { name: "cursor", in: "query", required: false, schema: { type: "string", maxLength: 64 } },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterReviewsPageData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "401": errorResponse("UNAUTHORIZED"),
          "403": errorResponse("FORBIDDEN — не мастер"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
    },
    "/api/cabinet/studio/context": {
      get: {
        operationId: "studioCabinetContext",
        summary: "Studio cabinet context for the app",
        description:
          "MOBILE-STUDIO-C: студия текущего пользователя (как веб-кабинет: OWNER > ADMIN > MASTER) — оба id " +
          "(`studio.id` = Studio.id для `/api/studio/*`, `studio.providerId` для `/api/studios/{id}/**`), роли, " +
          "пояс салона, «сегодня» по салону и бейджи разделов. Мастер студии — 200 с `canAdminister: false` и " +
          "`counts: null`; без членства в студии — 403.",
        tags: ["mobile", "studio"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioCabinetContextData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "403": errorResponse("FORBIDDEN — нет студии"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
    },
    "/api/cabinet/master/schedule/pattern": {
      put: {
        summary:
          "Apply a dated work schedule (week, alternating weeks or N-on/M-off cycle) from the setup wizard; bookings left on new days off are listed, not changed",
        tags: ["schedule"],
        parameters: SCHEDULE_ACTOR_PARAMETERS,
        requestBody: { required: true, content: { "application/json": { schema: SCHEDULE_PATTERN_REQUEST_SCHEMA } } },
        responses: {
          "200": okResponse({
            type: "object",
            properties: {
              snapshot: { type: "object" },
              conflicts: { type: "array", items: SCHEDULE_PATTERN_CONFLICT_SCHEMA },
            },
            required: ["snapshot", "conflicts"],
          }),
          "400": errorResponse("Invalid schedule"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Studio profile schedule is changed by the studio"),
          "404": errorResponse("Not found"),
        },
      },
      patch: {
        summary: "Set the last day of the configured schedule, or null to extend it automatically",
        tags: ["schedule"],
        parameters: SCHEDULE_ACTOR_PARAMETERS,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { endsOn: { type: "string", format: "date", nullable: true } },
                required: ["endsOn"],
              },
            },
          },
        },
        responses: {
          "200": okResponse({ type: "object", properties: { snapshot: { type: "object" } }, required: ["snapshot"] }),
          "400": errorResponse("Invalid date"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Studio profile schedule is changed by the studio"),
        },
      },
    },
    "/api/cabinet/master/schedule/pattern/preview": {
      post: {
        summary: "Dry run of the setup wizard: bookings the new schedule would leave on days off or outside working hours",
        tags: ["schedule"],
        parameters: SCHEDULE_ACTOR_PARAMETERS,
        requestBody: { required: true, content: { "application/json": { schema: SCHEDULE_PATTERN_REQUEST_SCHEMA } } },
        responses: {
          "200": okResponse({
            type: "object",
            properties: { conflicts: { type: "array", items: SCHEDULE_PATTERN_CONFLICT_SCHEMA } },
            required: ["conflicts"],
          }),
          "400": errorResponse("Invalid schedule"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Studio profile schedule is changed by the studio"),
        },
      },
    },
    "/api/cabinet/master/schedule/calendar": {
      get: {
        summary: "Schedule calendar for the current month through the 3-month horizon, as the slot engine sees it",
        tags: ["schedule"],
        parameters: SCHEDULE_ACTOR_PARAMETERS,
        responses: {
          "200": okResponse({
            type: "object",
            properties: { calendar: SCHEDULE_CALENDAR_SCHEMA },
            required: ["calendar"],
          }),
          "401": errorResponse("Unauthorized"),
          "404": errorResponse("Not found"),
        },
      },
      put: {
        summary:
          "Paint calendar days: a palette working day, a day off, own hours, or back to the schedule; bookings are kept. " +
          "For a studio profile the days are added to the open studio request instead (withdraw removes a day from it)",
        tags: ["schedule"],
        parameters: SCHEDULE_ACTOR_PARAMETERS,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  dates: { type: "array", items: { type: "string", format: "date" }, description: "1–93 salon dates" },
                  action: {
                    type: "object",
                    properties: {
                      kind: { type: "string", enum: ["template", "off", "reset", "hours", "withdraw"] },
                      templateId: { type: "string" },
                      startTime: SCHEDULE_TIME,
                      endTime: SCHEDULE_TIME,
                      breaks: SCHEDULE_BREAKS_SCHEMA,
                    },
                    required: ["kind"],
                  },
                },
                required: ["dates", "action"],
              },
            },
          },
        },
        responses: {
          "200": okResponse({
            type: "object",
            properties: {
              calendar: SCHEDULE_CALENDAR_SCHEMA,
              snapshot: { type: "object" },
              request: {
                type: "object",
                description: "Studio profile only: what happened to the open studio request",
                properties: { outcome: { type: "string", enum: ["created", "updated", "withdrawn", "unchanged"] } },
              },
            },
            required: ["calendar", "snapshot"],
          }),
          "400": errorResponse("Invalid days or action"),
          "401": errorResponse("Unauthorized"),
          "404": errorResponse("Studio not found"),
        },
      },
    },
    "/api/studio/schedule/team": {
      get: {
        summary:
          "Studio team board: active masters × 14 days (salon dates) as the slot engine sees them, with each master's schedule plan and palette; read-only",
        tags: ["schedule"],
        parameters: [
          {
            name: "from",
            in: "query",
            required: false,
            description: "First day of the window (studio date); clamped to 4 weeks back … horizon",
            schema: { type: "string", format: "date" },
          },
        ],
        responses: {
          "200": okResponse({
            type: "object",
            properties: {
              board: {
                type: "object",
                properties: {
                  todayKey: { type: "string", format: "date" },
                  fromKey: { type: "string", format: "date" },
                  lastKey: { type: "string", format: "date" },
                  minFromKey: { type: "string", format: "date" },
                  dates: { type: "array", items: { type: "string", format: "date" } },
                  masters: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        avatarUrl: { type: "string", nullable: true },
                        timezone: { type: "string" },
                        plan: { type: "object" },
                        days: { type: "array", items: { type: "object" } },
                      },
                      required: ["id", "name", "timezone", "plan", "days"],
                    },
                  },
                },
                required: ["todayKey", "fromKey", "lastKey", "minFromKey", "dates", "masters"],
              },
            },
            required: ["board"],
          }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Studio owner or admin only"),
        },
      },
    },
    "/api/cabinet/master/schedule/palette": {
      post: {
        summary: "Create a named palette working day (hours, breaks, booking mode, muted colour)",
        tags: ["schedule"],
        parameters: SCHEDULE_ACTOR_PARAMETERS,
        requestBody: { required: true, content: { "application/json": { schema: SCHEDULE_PALETTE_DAY_SCHEMA } } },
        responses: {
          "200": okResponse({
            type: "object",
            properties: { templateId: { type: "string" }, snapshot: { type: "object" } },
            required: ["templateId", "snapshot"],
          }),
          "400": errorResponse("Invalid working day"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Studio profile schedule is changed by the studio"),
          "409": errorResponse("Palette is full"),
        },
      },
    },
    "/api/cabinet/master/schedule/palette/{templateId}": {
      patch: {
        summary: "Rename or recolour a palette working day (hours never change: other hours are a new day)",
        tags: ["schedule"],
        parameters: [
          { name: "templateId", in: "path", required: true, schema: { type: "string" } },
          ...SCHEDULE_ACTOR_PARAMETERS,
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  label: { type: "string", maxLength: 40 },
                  color: { type: "string", enum: ["1", "2", "3", "4", "5", "6"] },
                },
              },
            },
          },
        },
        responses: {
          "200": okResponse({ type: "object", properties: { snapshot: { type: "object" } }, required: ["snapshot"] }),
          "400": errorResponse("Invalid name or colour"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Studio profile schedule is changed by the studio"),
          "404": errorResponse("Not found"),
        },
      },
      delete: {
        summary: "Delete a palette working day that no schedule, week or future calendar day uses",
        tags: ["schedule"],
        parameters: [
          { name: "templateId", in: "path", required: true, schema: { type: "string" } },
          ...SCHEDULE_ACTOR_PARAMETERS,
        ],
        responses: {
          "200": okResponse({ type: "object", properties: { snapshot: { type: "object" } }, required: ["snapshot"] }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Studio profile schedule is changed by the studio"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Working day is in use"),
        },
      },
    },
    "/api/media/file/{id}/crop/{v}": {
      get: {
        operationId: "mediaFileCrop",
        summary: "Serve media file cut to its saved crop area (avatar display)",
        description: "Ссылку собирает сервер (`avatarUrl`); `?w=` здесь не действует. Тир лимита `mediaRead`.",
        tags: ["mobile", "media"],
        security: optionalAuth,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          {
            name: "v",
            in: "path",
            required: true,
            description: "Crop version token; a stale token redirects to the current URL",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Binary image (webp) cut to the saved crop area" },
          "307": { description: "Crop changed or removed — redirect to the current URL" },
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/reviews": {
      get: {
        summary: "List reviews by target",
        tags: ["reviews"],
        parameters: [
          {
            name: "targetType",
            in: "query",
            required: true,
            schema: { $ref: "#/components/schemas/ReviewTargetType" },
          },
          {
            name: "targetId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100 },
          },
          {
            name: "offset",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 0 },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ReviewListData" }),
          "400": errorResponse("Validation error"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create review for completed booking",
        tags: ["reviews"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReviewCreateInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/ReviewData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Review not allowed"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/reviews/can-leave": {
      get: {
        summary: "Check if current user can leave review for booking",
        tags: ["reviews"],
        parameters: [
          {
            name: "bookingId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/CanLeaveReviewData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "404": errorResponse("Booking not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/reviews/{id}": {
      delete: {
        summary: "Delete review (author before reply, or admin after report)",
        tags: ["reviews"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/reviews/{id}/reply": {
      post: {
        summary: "Reply to review (master once)",
        tags: ["reviews"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReviewReplyInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ReviewData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/reviews/{id}/report": {
      post: {
        summary: "Report review (master within 3 days)",
        tags: ["reviews"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReviewReportInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ReviewData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/blocks": {
      post: {
        summary: "Create studio time block",
        tags: ["studio", "calendar", "mobile"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateTimeBlockInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/TimeBlockData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/blocks/{id}": {
      patch: {
        summary: "Update studio time block",
        tags: ["studio", "calendar", "mobile"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateTimeBlockInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/TimeBlockData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Block not found"),
          "500": errorResponse("Internal error"),
        },
      },
      delete: {
        summary: "Delete studio time block",
        tags: ["studio", "calendar", "mobile"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "studioId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Block not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/categories": {
      post: {
        summary: "Create studio category",
        tags: ["studio", "services"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateStudioCategoryInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/StudioCategoryData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/categories/{id}": {
      patch: {
        summary: "Rename studio category",
        tags: ["studio", "services"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateStudioCategoryInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/categories/reorder": {
      patch: {
        summary: "Reorder studio categories",
        tags: ["studio", "services"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReorderIdsInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BulkUpdatedData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/services": {
      get: {
        summary: "Studio services list with assigned masters",
        tags: ["studio", "services"],
        parameters: [{ name: "studioId", in: "query", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioServicesData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create studio service",
        tags: ["studio", "services"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateStudioServiceInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/services/{id}": {
      patch: {
        summary: "Update studio service",
        tags: ["studio", "services"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateStudioServiceInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/services/reorder": {
      patch: {
        summary: "Reorder studio services inside category",
        tags: ["studio", "services"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReorderIdsInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BulkUpdatedData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters": {
      get: {
        summary: "List studio masters",
        tags: ["studio", "masters"],
        parameters: [{ name: "studioId", in: "query", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioMasterListData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create local studio master",
        tags: ["studio", "masters"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateStudioMasterInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/services/{id}/assign-master": {
      post: {
        summary: "Assign master to service",
        tags: ["studio", "services"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/AssignMasterInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/AssignMasterData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Service not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}": {
      get: {
        summary: "Studio master card details",
        tags: ["studio", "masters"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "studioId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioMasterData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
      patch: {
        summary: "Update studio master profile",
        tags: ["studio", "masters"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateStudioMasterInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/services": {
      put: {
        summary: "Bulk update master services",
        tags: ["studio", "masters", "services"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BulkMasterServicesInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BulkUpdatedData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/schedule": {
      get: {
        summary: "Get master schedule for studio drawer",
        tags: ["studio", "masters", "schedule"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "studioId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioMasterScheduleData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/schedule/templates": {
      post: {
        summary: "Create master shift template",
        tags: ["studio", "masters", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateWorkTemplateInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/schedule/day-rules": {
      put: {
        summary: "Bulk upsert day rules",
        tags: ["studio", "masters", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpsertDayRulesInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BulkUpdatedData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/schedule/exceptions": {
      post: {
        summary: "Create master schedule exception",
        tags: ["studio", "masters", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateWorkExceptionInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/schedule/exceptions/{exceptionId}": {
      delete: {
        summary: "Delete master schedule exception",
        tags: ["studio", "masters", "schedule"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "exceptionId", in: "path", required: true, schema: { type: "string" } },
          { name: "studioId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/bookings": {
      post: {
        summary: "Create manual booking from master cabinet (solo)",
        tags: ["master", "bookings"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMasterBookingInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/bookings/{id}/status": {
      patch: {
        summary: "Update booking status from master cabinet",
        tags: ["master", "bookings"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateMasterBookingStatusInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterBookingStatusData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Booking not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/schedule": {
      get: {
        summary: "Get master schedule for month",
        tags: ["master", "schedule"],
        parameters: [{ name: "month", in: "query", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterScheduleData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/schedule/weekly": {
      get: {
        summary: "Get own weekly schedule",
        tags: ["master", "schedule"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/WeeklyScheduleData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "500": errorResponse("Internal error"),
        },
      },
      put: {
        summary: "Set own weekly schedule",
        tags: ["master", "schedule"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/WeeklyScheduleInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/CountData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/schedule/buffer": {
      get: {
        summary: "Get own booking buffer",
        tags: ["master", "schedule"],
        responses: {
          "200": okResponse({
            type: "object",
            properties: {
              bufferBetweenBookingsMin: { type: "integer" },
            },
            required: ["bufferBetweenBookingsMin"],
          }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "500": errorResponse("Internal error"),
        },
      },
      put: {
        summary: "Set own booking buffer",
        tags: ["master", "schedule"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  bufferBetweenBookingsMin: { type: "integer", minimum: 0, maximum: 30 },
                },
                required: ["bufferBetweenBookingsMin"],
              },
            },
          },
        },
        responses: {
          "200": okResponse({
            type: "object",
            properties: {
              bufferBetweenBookingsMin: { type: "integer" },
            },
            required: ["bufferBetweenBookingsMin"],
          }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/schedule/exceptions": {
      post: {
        summary: "Create off-day/shift exception (solo apply, studio request)",
        tags: ["master", "schedule"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMasterScheduleExceptionInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/MasterApplyOrRequestData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/schedule/exceptions/{id}": {
      delete: {
        summary: "Delete master exception (solo only)",
        tags: ["master", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/blocks": {
      post: {
        summary: "Create master break/block (solo apply, studio request)",
        tags: ["master", "schedule"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMasterBlockInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/MasterApplyOrRequestData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/blocks/{id}": {
      patch: {
        summary: "Update master block (solo only)",
        tags: ["master", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMasterBlockInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
      delete: {
        summary: "Delete master block (solo only)",
        tags: ["master", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/service-packages": {
      get: {
        operationId: "masterServicePackagesList",
        summary: "Master service packages (all, including disabled)",
        description:
          "MOBILE-MASTER-C: все пакеты личного профиля мастера, включая выключенные, по `sortOrder`, затем по дате " +
          "создания. Цена — то же правило, что у страницы «Услуги». Ответ `private, no-store`.",
        tags: ["mobile", "master", "services"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterServicePackagesData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "403": errorResponse("FORBIDDEN — не мастер"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
      post: {
        operationId: "masterServicePackageCreate",
        summary: "Create master service package",
        tags: ["mobile", "master", "services"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMasterServicePackageInput" } },
          },
        },
        responses: {
          "201": okResponse(
            { type: "object", required: ["id"], properties: { id: { type: "string" } } },
            "Created",
          ),
          "400": errorResponse("VALIDATION_ERROR"),
          "401": errorResponse("UNAUTHORIZED"),
          "403": errorResponse("FORBIDDEN"),
          "404": errorResponse("SERVICE_NOT_FOUND — услуга не из каталога мастера"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
    },
    "/api/master/profile": {
      get: {
        operationId: "masterProfileGet",
        summary: "Get master profile aggregate for cabinet",
        description:
          "MOBILE-MASTER-C: в `data.master` добавлены `timezone`, `publicUsername` (здесь не генерируется, " +
          "`null` — адрес ещё не выдан) и `district`; прежние поля не менялись.",
        tags: ["mobile", "master", "profile"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterProfileData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
      patch: {
        summary: "Update master profile",
        tags: ["master", "profile"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateMasterProfileInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/services": {
      put: {
        summary: "Bulk update master services from cabinet",
        tags: ["master", "services"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpsertMasterServicesInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BulkUpdatedData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/portfolio": {
      get: {
        summary: "List master portfolio items",
        tags: ["master", "portfolio", "mobile"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterPortfolioListData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create master portfolio item",
        tags: ["master", "portfolio"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMasterPortfolioInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/portfolio/{id}": {
      delete: {
        summary: "Delete master portfolio item",
        tags: ["master", "portfolio"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/bookings/{id}/move": {
      patch: {
        summary: "Move booking between masters/time slots",
        tags: ["studio", "bookings", "mobile"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MoveStudioBookingInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Booking not found"),
          "409": errorResponse("CONFLICT / SLOT_CONFLICT / TIME_BLOCKED / MASTER_NOT_ACTIVE"),
          "422": errorResponse("OUTSIDE_WORK_HOURS / MASTER_SERVICE_MISMATCH"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/bookings": {
      post: {
        summary: "Create booking from studio calendar",
        tags: ["studio", "bookings", "mobile"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateStudioBookingInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/StudioBookingCreatedData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "422": errorResponse("OUTSIDE_WORK_HOURS"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    // MOBILE-STUDIO-C (ops) — главная, календарь, журнал, карточка записи,
    // выбор мастера и услуги, уведомления кабинета студии в приложении.
    "/api/studio/dashboard/revenue": {
      get: {
        operationId: "studioDashboardRevenue",
        summary: "Studio revenue by master for a period",
        description:
          "Выручка студии по мастерам за последние N дней салона (подтверждённые и завершённые записи). " +
          "Неизвестный `period` — 30d. Плоская форма `{ totalKopeks, points, period }`.",
        tags: ["mobile", "studio"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "period", in: "query", required: false, schema: { type: "string", enum: ["7d", "30d", "90d", "365d"], default: "30d" } },
        ],
        responses: studioOpsResponses({
          type: "object",
          required: ["totalKopeks", "points", "period"],
          properties: {
            totalKopeks: { type: "integer" },
            period: { type: "string", enum: ["7d", "30d", "90d", "365d"] },
            points: {
              type: "array",
              items: {
                type: "object",
                required: ["masterId", "masterName", "revenueKopeks", "bookingsCount"],
                properties: {
                  masterId: { type: "string" },
                  masterName: { type: "string" },
                  revenueKopeks: { type: "integer" },
                  bookingsCount: { type: "integer" },
                },
              },
            },
          },
        }),
      },
    },
    "/api/cabinet/studio/dashboard": {
      get: {
        operationId: "studioCabinetDashboard",
        summary: "Studio home: today, KPIs, attention, awaiting bookings",
        description:
          "Данные веб-дашборда (`loadStudioDashboardData`) числами и без href веба, плюс до 20 ближайших записей, " +
          "ждущих ответа (PENDING / CHANGE_REQUESTED, начало впереди), с действиями. Только владелец / администратор.",
        tags: ["mobile", "studio"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: studioOpsResponses({
          type: "object",
          required: ["studioId", "timezone", "todayKey", "today", "kpis", "topMasters", "attention", "topOccupancyToday", "popularServices", "revenueChart"],
          properties: {
            studioId: { type: "string" },
            timezone: { type: "string" },
            todayKey: { type: "string", format: "date" },
            today: {
              type: "object",
              properties: {
                bookingsCount: { type: "integer" },
                mastersOnShift: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, avatarUrl: { type: "string", nullable: true } } } },
                totalMasters: { type: "integer" },
                averageLoadPercent: { type: "integer" },
              },
            },
            kpis: {
              type: "object",
              properties: {
                periodDays: { type: "integer" },
                revenueKopeks: STUDIO_OPS_KPI_TILE,
                bookingsCount: STUDIO_OPS_KPI_TILE,
                occupancyPercent: STUDIO_OPS_KPI_TILE,
                averageRating: STUDIO_OPS_KPI_TILE,
                averageCheckKopeks: { type: "integer" },
                ratingCount: { type: "integer" },
                mastersOnShiftCount: { type: "integer" },
                totalMastersCount: { type: "integer" },
              },
            },
            topMasters: { type: "array", items: { type: "object" } },
            attention: {
              type: "object",
              required: ["items", "urgentCount", "bookings", "bookingsTotal"],
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id", "count", "urgent"],
                    properties: {
                      id: { type: "string", enum: ["pending-master-approvals", "bookings-awaiting", "reviews-unanswered", "schedule-requests"] },
                      count: { type: "integer" },
                      urgent: { type: "boolean" },
                    },
                  },
                },
                urgentCount: { type: "integer" },
                bookings: { type: "array", items: STUDIO_OPS_BOOKING_ITEM },
                bookingsTotal: { type: "integer" },
              },
            },
            topOccupancyToday: { type: "array", items: { type: "object" } },
            popularServices: { type: "array", items: { type: "object" } },
            revenueChart: { type: "object", properties: { period: { type: "string" }, totalKopeks: { type: "integer" }, points: { type: "array", items: { type: "object" } } } },
          },
        }),
      },
    },
    "/api/cabinet/studio/calendar/day": {
      get: {
        operationId: "studioCabinetCalendarDay",
        summary: "Studio calendar day: masters' hours, bookings, personal busy time, blocks",
        description:
          "Сборка дня веба (`buildDayData` + `computeKpis`) и план дня каждого активного мастера из движка расписания. " +
          "Записи студии — с действиями и без телефона; личные записи мастеров — только занятостью; блокировки — для " +
          "правки через `/api/studio/blocks`. День «Фиксированное время»: `fixedStarts`, отрезки — сутки движка.",
        tags: ["mobile", "studio"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [STUDIO_OPS_DATE_QUERY],
        responses: studioOpsResponses(
          {
            type: "object",
            required: ["studioId", "timezone", "date", "todayKey", "dayStartUtc", "gridWindow", "masters", "bookings", "personalBusy", "blocks", "kpis"],
            properties: {
              studioId: { type: "string", description: "Studio.id — для `/api/studio/bookings` и `/api/studio/blocks`." },
              timezone: { type: "string" },
              date: { type: "string", format: "date" },
              todayKey: { type: "string", format: "date" },
              dayStartUtc: STUDIO_OPS_TIME("Полночь салона"),
              gridWindow: { type: "object", properties: { startHour: { type: "integer" }, endHour: { type: "integer" } } },
              masters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    avatarUrl: { type: "string", nullable: true },
                    rating: { type: "number" },
                    reviewsCount: { type: "integer" },
                    isAvailable: { type: "boolean" },
                    serviceIds: { type: "array", items: { type: "string" } },
                    hours: {
                      type: "object",
                      required: ["isWorking", "intervals", "breaks", "fixedStarts"],
                      properties: {
                        isWorking: { type: "boolean" },
                        intervals: { type: "array", items: STUDIO_OPS_HM_RANGE },
                        breaks: { type: "array", items: STUDIO_OPS_HM_RANGE },
                        fixedStarts: { type: "array", items: { type: "string" }, nullable: true },
                      },
                    },
                  },
                },
              },
              bookings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    ...STUDIO_OPS_BOOKING_FIELDS,
                    masterId: { type: "string" },
                    tone: { type: "string", enum: ["confirmed", "pending", "new", "done", "muted"] },
                    clientName: { type: "string" },
                    isNewClient: { type: "boolean" },
                  },
                },
              },
              personalBusy: {
                type: "array",
                items: { type: "object", properties: { id: { type: "string" }, masterId: { type: "string" }, startAtUtc: STUDIO_OPS_TIME(), endAtUtc: STUDIO_OPS_TIME() } },
              },
              blocks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    masterId: { type: "string" },
                    startAtUtc: STUDIO_OPS_TIME(),
                    endAtUtc: STUDIO_OPS_TIME(),
                    type: { type: "string", enum: ["BREAK", "BLOCK"] },
                    note: { type: "string", nullable: true },
                  },
                },
              },
              kpis: {
                type: "object",
                properties: {
                  bookingsCount: { type: "integer" },
                  bookingsConfirmedCount: { type: "integer" },
                  revenueKopeks: { type: "integer" },
                  occupancyPercent: { type: "integer" },
                  mastersOnShift: { type: "integer" },
                  freeWindowsCount: { type: "integer" },
                },
              },
            },
          },
          { "400": errorResponse("VALIDATION_ERROR — дата") },
        ),
      },
    },
    "/api/cabinet/studio/calendar/week": {
      get: {
        operationId: "studioCabinetCalendarWeek",
        summary: "Studio calendar week: load per master and day from real schedules",
        description:
          "Понедельник–воскресенье недели `date`. Выходной и ёмкость — из плана дня движка (`loadDayPlans`), а не «5 записей = 100%» " +
          "веб-недели; день «Фиксированное время» — доля занятых начал. Только записи студии.",
        tags: ["mobile", "studio"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [STUDIO_OPS_DATE_QUERY],
        responses: studioOpsResponses(
          {
            type: "object",
            required: ["studioId", "timezone", "todayKey", "from", "to", "days", "masters"],
            properties: {
              studioId: { type: "string" },
              timezone: { type: "string" },
              todayKey: { type: "string", format: "date" },
              from: { type: "string", format: "date" },
              to: { type: "string", format: "date" },
              days: {
                type: "array",
                items: { type: "object", properties: { date: { type: "string", format: "date" }, weekday: { type: "integer" }, isToday: { type: "boolean" } } },
              },
              masters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    avatarUrl: { type: "string", nullable: true },
                    isAvailable: { type: "boolean" },
                    days: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          date: { type: "string", format: "date" },
                          isDayOff: { type: "boolean" },
                          booked: { type: "integer" },
                          bookedMinutes: { type: "integer" },
                          capacityMinutes: { type: "integer", nullable: true },
                          fixedSlots: { type: "integer", nullable: true },
                          percent: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          { "400": errorResponse("VALIDATION_ERROR — дата") },
        ),
      },
    },
    "/api/cabinet/studio/bookings": {
      get: {
        operationId: "studioCabinetBookings",
        summary: "Studio booking journal page",
        description:
          "Журнал веба (`listStudioBookings`, `loadStudioBookingsKpis`, `loadStudioMasterOptions`) постранично. " +
          "status: awaiting = NEW/PENDING/CHANGE_REQUESTED, confirmed = CONFIRMED/PREPAID/STARTED/IN_PROGRESS, " +
          "finished = FINISHED, cancelled = REJECTED/CANCELLED, no_show = NO_SHOW. Без телефонов в элементах.",
        tags: ["mobile", "studio"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "range", in: "query", required: false, schema: { type: "string", enum: ["today", "tomorrow", "week", "all"], default: "today" } },
          { name: "status", in: "query", required: false, schema: { type: "string", enum: ["all", "awaiting", "confirmed", "finished", "cancelled", "no_show"], default: "all" } },
          { name: "master", in: "query", required: false, schema: { type: "string", maxLength: 64 }, description: "Provider.id мастера или all." },
          { name: "q", in: "query", required: false, schema: { type: "string", maxLength: 80 }, description: "Имя клиента, цифры телефона, услуга." },
          STUDIO_OPS_CURSOR_QUERY,
          STUDIO_OPS_LIMIT_QUERY,
        ],
        responses: studioOpsResponses(
          {
            type: "object",
            required: ["studioId", "timezone", "range", "status", "rangeCounts", "kpis", "masters", "items", "nextCursor"],
            properties: {
              studioId: { type: "string" },
              timezone: { type: "string" },
              range: { type: "string" },
              status: { type: "string" },
              rangeCounts: {
                type: "object",
                properties: { today: { type: "integer" }, tomorrow: { type: "integer" }, week: { type: "integer" }, all: { type: "integer" } },
              },
              kpis: {
                type: "object",
                properties: {
                  todayCount: { type: "integer" },
                  todayCompleted: { type: "integer" },
                  todayUpcoming: { type: "integer" },
                  needsActionCount: { type: "integer" },
                  confirmedNext7Days: { type: "integer" },
                  revenueTodayKopeks: { type: "integer" },
                  revenueDeltaPercent: { type: "integer", nullable: true },
                  noShowLast7Days: { type: "integer" },
                },
              },
              masters: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } } },
              items: { type: "array", items: STUDIO_OPS_BOOKING_ITEM },
              nextCursor: { type: "string", nullable: true },
            },
          },
          { "400": errorResponse("VALIDATION_ERROR — фильтры или курсор") },
        ),
      },
    },
    "/api/cabinet/studio/bookings/{id}": {
      get: {
        operationId: "studioCabinetBookingDetail",
        summary: "Studio booking detail (push target /studio/bookings/{id})",
        description:
          "Элемент журнала плюс телефон и ключ CRM клиента, визиты в студию, комментарий, заметка студии, ответы, " +
          "переносы и отмена, отзыв. Личная запись мастера, чужая, несуществующая и битый id — один 404 BOOKING_NOT_FOUND.",
        tags: ["mobile", "studio"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 64 } }],
        responses: studioOpsResponses(
          {
            type: "object",
            required: ["studioId", "timezone", "booking"],
            properties: {
              studioId: { type: "string" },
              timezone: { type: "string" },
              booking: {
                type: "object",
                properties: {
                  ...STUDIO_OPS_BOOKING_FIELDS,
                  createdAt: STUDIO_OPS_TIME(),
                  requestedBy: STUDIO_OPS_SIDE,
                  changeComment: { type: "string", nullable: true },
                  client: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      phone: { type: "string", nullable: true },
                      userId: { type: "string", nullable: true },
                      key: { type: "string", nullable: true, description: "Ключ CRM студии: /api/studio/clients/{key}/card" },
                      avatarUrl: { type: "string", nullable: true },
                      isNewClient: { type: "boolean" },
                      isVip: { type: "boolean" },
                      pastVisitsCount: { type: "integer" },
                    },
                  },
                  services: {
                    type: "array",
                    items: { type: "object", properties: { title: { type: "string" }, price: { type: "integer" }, durationMin: { type: "integer" } } },
                  },
                  comment: { type: "string", nullable: true },
                  notes: { type: "string", nullable: true },
                  silentMode: { type: "boolean" },
                  answers: { type: "array", items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" } } } },
                  clientChangeRequestsCount: { type: "integer" },
                  masterChangeRequestsCount: { type: "integer" },
                  changeRequestLimit: { type: "integer" },
                  cancelledBy: { type: "string", enum: ["CLIENT", "PROVIDER", "SYSTEM"], nullable: true },
                  cancelReason: { type: "string", nullable: true },
                  cancelledAtUtc: STUDIO_OPS_TIME_NULLABLE,
                  review: {
                    type: "object",
                    nullable: true,
                    properties: {
                      id: { type: "string", description: "Публичный токен — /api/reviews/{id}/reply" },
                      rating: { type: "integer" },
                      text: { type: "string", nullable: true },
                      replyText: { type: "string", nullable: true },
                      repliedAt: STUDIO_OPS_TIME_NULLABLE,
                      createdAt: STUDIO_OPS_TIME(),
                      canReply: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
          { "404": errorResponse("BOOKING_NOT_FOUND") },
        ),
      },
    },
    "/api/cabinet/studio/booking-options": {
      get: {
        operationId: "studioCabinetBookingOptions",
        summary: "Bookable masters and services for create / move",
        description:
          "Загрузчик веб-диалога «Новая запись» (`loadStudioCabinetShellExtras`): активные мастера и включённые активные услуги, " +
          "с длительностью и ценой у каждого мастера (то, что запишет `createStudioBooking`).",
        tags: ["mobile", "studio"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: studioOpsResponses({
          type: "object",
          required: ["studioId", "timezone", "masters", "services"],
          properties: {
            studioId: { type: "string" },
            timezone: { type: "string" },
            masters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  avatarUrl: { type: "string", nullable: true },
                  serviceIds: { type: "array", items: { type: "string" } },
                },
              },
            },
            services: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  durationMin: { type: "integer" },
                  priceKopeks: { type: "integer" },
                  masterIds: { type: "array", items: { type: "string" } },
                  masters: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { masterId: { type: "string" }, durationMin: { type: "integer" }, priceKopeks: { type: "integer" } },
                    },
                  },
                },
              },
            },
          },
        }),
      },
    },
    "/api/cabinet/studio/notifications": {
      get: {
        operationId: "studioCabinetNotifications",
        summary: "Studio notifications feed (studio channel + pending schedule requests)",
        description:
          "Канал STUDIO центра уведомлений условием в базе (`studioChannelNotificationWhere`) и ожидающие заявки на смену " +
          "графика первыми; вкладки веба; `link` — путь экрана приложения или null.",
        tags: ["mobile", "studio", "notifications"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "chip", in: "query", required: false, schema: { ...STUDIO_OPS_CHIP, default: "all" } },
          STUDIO_OPS_CURSOR_QUERY,
          STUDIO_OPS_LIMIT_QUERY,
        ],
        responses: studioOpsResponses(
          {
            type: "object",
            required: ["timezone", "chip", "unreadCount", "needsDecisionCount", "chipCounts", "items", "nextCursor"],
            properties: {
              timezone: { type: "string" },
              chip: STUDIO_OPS_CHIP,
              unreadCount: { type: "integer" },
              needsDecisionCount: { type: "integer" },
              chipCounts: { type: "object", additionalProperties: { type: "integer" } },
              items: {
                type: "array",
                items: {
                  type: "object",
                  required: ["id", "type", "chip", "title", "body", "isRead", "readAt", "createdAt", "bookingId", "needsDecision", "link", "payload"],
                  properties: {
                    id: { type: "string", description: "Notification.id или schedule-request:<id>" },
                    type: { type: "string" },
                    chip: STUDIO_OPS_CHIP,
                    title: { type: "string" },
                    body: { type: "string" },
                    isRead: { type: "boolean" },
                    readAt: STUDIO_OPS_TIME_NULLABLE,
                    createdAt: STUDIO_OPS_TIME(),
                    bookingId: { type: "string", nullable: true },
                    needsDecision: { type: "boolean" },
                    link: { type: "string", nullable: true },
                    payload: { type: "object", nullable: true },
                  },
                },
              },
              nextCursor: { type: "string", nullable: true },
            },
          },
          { "400": errorResponse("VALIDATION_ERROR — вкладка или курсор") },
        ),
      },
    },
    "/api/cabinet/studio/notifications/unread-count": {
      get: {
        operationId: "studioCabinetNotificationsUnreadCount",
        summary: "Studio notifications badge",
        tags: ["mobile", "studio", "notifications"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: studioOpsResponses({
          type: "object",
          required: ["unreadCount", "needsDecisionCount"],
          properties: { unreadCount: { type: "integer" }, needsDecisionCount: { type: "integer" } },
        }),
      },
    },
    "/api/cabinet/studio/notifications/read-all": {
      post: {
        operationId: "studioCabinetNotificationsReadAll",
        summary: "Mark all studio-channel notifications read",
        description: "Личные уведомления и уведомления мастера не трогаются; заявки на смену графика остаются. Лимит — cabinetMutation.",
        tags: ["mobile", "studio", "notifications"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: studioOpsResponses({
          type: "object",
          required: ["updated", "unreadCount", "needsDecisionCount"],
          properties: { updated: { type: "integer" }, unreadCount: { type: "integer" }, needsDecisionCount: { type: "integer" } },
        }),
      },
    },
    "/api/feed/portfolio": {
      get: {
        operationId: "feedPortfolio",
        summary: "Inspiration portfolio feed",
        tags: ["mobile", "portfolio", "feed"],
        security: optionalAuth,
        parameters: [
          cityQuery,
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50 } },
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
          { name: "q", in: "query", required: false, schema: { type: "string" } },
          { name: "categoryId", in: "query", required: false, schema: { type: "string" } },
          { name: "category", in: "query", required: false, schema: { type: "string" } },
          { name: "tag", in: "query", required: false, schema: { type: "string" } },
          { name: "near", in: "query", required: false, schema: { type: "string" } },
          { name: "masterId", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/PortfolioFeedData" }),
          "400": errorResponse("VALIDATION_ERROR | CITY_NOT_FOUND"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/feed/home": {
      get: {
        operationId: "feedHome",
        summary: "Home collage feed: one tile per author upload group (48h window)",
        tags: ["mobile", "portfolio", "feed"],
        security: optionalAuth,
        parameters: [
          cityQuery,
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 30 } },
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/HomeFeedData" }),
          "400": errorResponse("VALIDATION_ERROR | CITY_NOT_FOUND"),
          "429": errorResponse("Rate limited"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/feed/stories": {
      get: {
        operationId: "feedStories",
        summary: "Stories: recent works of masters with auto-published stories, grouped by master",
        description:
          "Кэш 5 мин (общий и по городу; новая работа гасит оба). MOBILE-B1: `city` — истории мастеров города.",
        tags: ["mobile", "feed"],
        parameters: [cityQuery],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/FeedStoriesData" }),
          "400": errorResponse("VALIDATION_ERROR | CITY_NOT_FOUND"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/portfolio/{id}": {
      get: {
        summary: "Portfolio detail with prefill booking context",
        tags: ["portfolio"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/PortfolioDetailData" }),
          "400": errorResponse("Validation error"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/portfolio/{id}/favorite": {
      post: {
        summary: "Toggle portfolio favorite for current user",
        tags: ["portfolio"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ToggleFavoriteData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/public/packages/{id}/propose": {
      post: {
        summary: "Propose slots for a solo-master package (advisory)",
        description: "ADVISORY: считает цену и раскладку для экрана review, НИЧЕГО не создаёт. Брони материализуются только на /book. Согласия здесь не требуются — их снимает /book.",
        tags: ["public"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ type: "object" }),
          "400": errorResponse("Validation error"),
          "404": errorResponse("Package not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/public/packages/{id}/studio/propose": {
      post: {
        summary: "Propose slots for a studio (multi-master) package (advisory)",
        description: "Как соло-propose: advisory, ничего не создаёт.",
        tags: ["public"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ type: "object" }),
          "400": errorResponse("Validation error"),
          "404": errorResponse("Package not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/public/packages/{id}/book": {
      post: {
        summary: "Book a solo-master service package (guest checkout)",
        description:
          "Атомарно материализует весь пакет (инв. #34): все компоненты создаются одной Serializable-транзакцией, all-or-none. Гость обязан передать `consent` — без обязательных целей 400 CONSENT_REQUIRED до создания чего-либо.",
        tags: ["public"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/PackageBookInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/BookingData" }, "Created"),
          "400": errorResponse("Validation error / CONSENT_REQUIRED"),
          "404": errorResponse("Package not found"),
          "409": errorResponse("Slot conflict"),
          "429": errorResponse("Rate limited"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/public/packages/{id}/studio/book": {
      post: {
        summary: "Book a studio (multi-master) service package (guest checkout)",
        description:
          "Как соло-пакет, но мастер назначается на каждый компонент отдельно; порядок держит виджет, сервер enforce'ит только non-overlap по таймлайну клиента. Тот же обязательный для гостя `consent`.",
        tags: ["public"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/PackageBookInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/BookingData" }, "Created"),
          "400": errorResponse("Validation error / CONSENT_REQUIRED"),
          "404": errorResponse("Package not found"),
          "409": errorResponse("Slot conflict"),
          "429": errorResponse("Rate limited"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/me/consents/marketing": {
      get: {
        summary: "Read the current marketing-consent state",
        description:
          "RKN-FIX-18. `enabled` = есть АКТИВНАЯ (не отозванная) строка UserConsent цели MARKETING. `agreedAt` — момент действующего согласия, `documentVersion` — версия документа, на которую соглашались; если она отличается от `currentVersion`, при следующем включении будет записана новая строка на актуальную версию.",
        tags: ["me", "legal"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MarketingConsentState" }),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
      patch: {
        summary: "Grant or withdraw marketing consent",
        description:
          "Только цель MARKETING. `enabled:false` — ОТЗЫВ: строка не удаляется, ей проставляется `revokedAt`, история сохраняется. `enabled:true` — новое согласие: вставляется НОВАЯ строка с текущей версией документа и свежими IP/UA (отозванная НЕ оживляется). Отзыв согласия на обработку ПДн или оферту здесь невозможен — это запрос на удаление аккаунта; попытка вернёт 400 `CONSENT_NOT_SELF_REVOCABLE`. На сервисные уведомления (подтверждения записей, напоминания) не влияет.",
        tags: ["me", "legal"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["enabled"],
                properties: { enabled: { type: "boolean" } },
              },
            },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MarketingConsentState" }),
          "400": errorResponse("Validation error / CONSENT_NOT_SELF_REVOCABLE"),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/hot-slots": {
      get: {
        operationId: "hotSlotsFeed",
        summary: "List active hot slots",
        tags: ["mobile", "hot-slots"],
        parameters: [
          cityQuery,
          { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "category", in: "query", required: false, schema: { type: "string" } },
          { name: "tag", in: "query", required: false, schema: { type: "string" } },
          { name: "geo", in: "query", required: false, schema: { type: "string" } },
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/HotSlotsData" }),
          "400": errorResponse("VALIDATION_ERROR | CITY_NOT_FOUND"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/provider/hot-slots/rule": {
      get: {
        summary: "Get hot slots rule for current provider",
        tags: ["hot-slots"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/HotSlotRuleData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Update hot slots rule",
        tags: ["hot-slots"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/HotSlotRuleInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/HotSlotRuleData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/admin/vk-community": {
      get: {
        summary: "VK community used for notifications (token never returned)",
        tags: ["admin", "vk"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/AdminVkCommunityData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
      put: {
        summary: "Save VK community access token",
        description:
          "VK-COMMUNITY-NOTIFY-01: ключ проверяется у VK (сообщество из NEXT_PUBLIC_VK_COMMUNITY_URL + право «Сообщения сообщества») и хранится зашифрованным в SystemConfig.",
        tags: ["admin", "vk"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/AdminVkCommunityInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/AdminVkCommunityData" }),
          "400": errorResponse("Invalid token"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "409": errorResponse("Community link missing or token of another community"),
          "503": errorResponse("VK unavailable"),
          "500": errorResponse("Internal error"),
        },
      },
      delete: {
        summary: "Remove VK community access token",
        tags: ["admin", "vk"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/AdminVkCommunityData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/admin/hot-slots/run": {
      post: {
        summary: "Run hot slots job",
        tags: ["hot-slots", "admin"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/HotSlotsRunData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    // ── MOBILE-AUTH-A: нативное приложение ─────────────────────────────────
    "/api/mobile/v1/auth/otp/verify": {
      post: {
        operationId: "mobileAuthOtpVerify",
        summary: "Mobile: sign in with SMS code",
        description:
          "Код запрашивается обычным `POST /api/auth/otp/request {phone}`. Логика и отказы — как у " +
          "веб-`/api/auth/otp/verify`: 503 SYSTEM_FEATURE_DISABLED (вход по телефону выключен), " +
          "400 VALIDATION_ERROR / CONSENT_REQUIRED (`consent` обязателен, когда вход создаёт аккаунт), " +
          "401 CODE_NOT_FOUND, 429 OTP_LOCKED / 503 RATE_LIMIT_UNAVAILABLE (блокировка перебора). " +
          "Сессия — в теле (`tokens`), кук нет. Лимит прокси: 30/мин на IP (тир mobileAuth).",
        tags: ["mobile", "auth"],
        parameters: mobileClientHeaders,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MobileOtpVerifyInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MobileAuthData" }),
          "400": errorResponse("VALIDATION_ERROR | CONSENT_REQUIRED"),
          "401": errorResponse("CODE_NOT_FOUND"),
          "429": errorResponse("OTP_LOCKED | RATE_LIMITED"),
          "503": errorResponse("SYSTEM_FEATURE_DISABLED | RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    "/api/mobile/v1/auth/otp/email/verify": {
      post: {
        operationId: "mobileAuthOtpEmailVerify",
        summary: "Mobile: sign in with email code",
        description:
          "Код запрашивается обычным `POST /api/auth/otp/email/request {email}`. Логика и отказы — как " +
          "у веб-`/api/auth/otp/email/verify`: 400 VALIDATION_ERROR / CONSENT_REQUIRED, 401 " +
          "CODE_NOT_FOUND, EMAIL_NOT_VERIFIED (адрес занят неподтверждённой строкой), 429 OTP_LOCKED. " +
          "Сессия — в теле (`tokens`), кук нет. Лимит прокси: 30/мин на IP (тир mobileAuth).",
        tags: ["mobile", "auth"],
        parameters: mobileClientHeaders,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MobileOtpEmailVerifyInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MobileAuthData" }),
          "400": errorResponse("VALIDATION_ERROR | CONSENT_REQUIRED"),
          "401": errorResponse("CODE_NOT_FOUND"),
          "409": errorResponse("EMAIL_NOT_VERIFIED"),
          "429": errorResponse("OTP_LOCKED | RATE_LIMITED"),
          "503": errorResponse("RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    "/api/mobile/v1/auth/refresh": {
      post: {
        operationId: "mobileAuthRefresh",
        summary: "Mobile: rotate session tokens",
        description:
          "Одноразовая ротация внутри семьи сессии. Повтор с токеном «на шаг позади» (ответ ротации " +
          "потерялся) отдаёт того же преемника (SESSION-LOSS-01). Любой отказ ротации — 401 " +
          "UNAUTHORIZED: клиент разлогинивается. Лимит прокси: 60/мин на IP (тир mobileAuthRefresh), " +
          "fail-closed — при недоступном лимитере 503 RATE_LIMIT_UNAVAILABLE (повторить позже, не выходить).",
        tags: ["mobile", "auth"],
        parameters: mobileClientHeaders,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MobileRefreshTokenInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MobileTokensData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "401": errorResponse("UNAUTHORIZED — refresh-токен недействителен, протух или отозван"),
          "429": errorResponse("RATE_LIMITED"),
          "503": errorResponse("RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    "/api/mobile/v1/auth/logout": {
      post: {
        operationId: "mobileAuthLogout",
        summary: "Mobile: sign out (revoke session family)",
        description:
          "Отзывает всю семью сессии: access-токены этой семьи перестают работать сразу. " +
          "Идемпотентен — повтор и недействительный токен тоже `200 {}`.",
        tags: ["mobile", "auth"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MobileRefreshTokenInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MobileEmptyData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "429": errorResponse("RATE_LIMITED"),
          "503": errorResponse("RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    // ── MOBILE-AUTH-A2: VK ID / Яндекс ID ─────────────────────────────────
    "/api/mobile/v1/auth/oauth/{provider}/start": {
      get: {
        operationId: "mobileAuthOAuthStart",
        summary: "Mobile: start VK ID / Yandex ID sign-in (open in the system browser)",
        description:
          "Открывать в системном браузере (ASWebAuthenticationSession / Custom Tabs), не в WebView. " +
          "Успех — редирект к провайдеру, дальше общий колбэк `/api/auth/{provider}/callback`, который " +
          "кончается 302 на `masterryadom://auth/callback?code=…` (вход; код — в " +
          "`POST /api/mobile/v1/auth/oauth/exchange`) либо `?linked=<provider>` (привязка по `intent`). " +
          "Любой отказ — 302 на `masterryadom://auth/callback?error=<код>`: invalid_request · " +
          "provider_unavailable · consent_required · intent_invalid · start_failed (старт); " +
          "state_invalid · access_denied · provider_timeout · vk_already_linked · yandex_already_linked · " +
          "email_taken · callback_failed (колбэк). Сессию браузера не читает. Согласия обязательны, " +
          "если нет `intent` (вход может создать аккаунт).",
        tags: ["mobile", "auth"],
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string", enum: ["vk", "yandex"] } },
          {
            name: "codeChallenge",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 43, maxLength: 43, pattern: "^[A-Za-z0-9_-]{43}$" },
            description: "PKCE S256 приложения: base64url(sha256(codeVerifier)) без паддинга.",
          },
          { name: "terms", in: "query", required: false, schema: { type: "string", enum: ["1"] }, description: "Согласие с офертой." },
          { name: "pd", in: "query", required: false, schema: { type: "string", enum: ["1"] }, description: "Согласие на обработку ПДн." },
          { name: "marketing", in: "query", required: false, schema: { type: "string", enum: ["1"] }, description: "Маркетинг (необязательно)." },
          {
            name: "intent",
            in: "query",
            required: false,
            schema: { type: "string", maxLength: 256 },
            description: "Токен из `…/link-intent`: привязать аккаунт провайдера к вошедшему пользователю.",
          },
        ],
        responses: {
          "302": {
            description: "Redirect to the provider, or to masterryadom://auth/callback?error=<код>",
          },
        },
      },
    },
    "/api/mobile/v1/auth/oauth/{provider}/link-intent": {
      post: {
        operationId: "mobileAuthOAuthLinkIntent",
        summary: "Mobile: one-time intent to link VK ID / Yandex ID to the signed-in account",
        description:
          "Одноразовый, 5 минут, привязан к пользователю и провайдеру. `no-store`. Лимит прокси: 30/мин " +
          "на IP (тир mobileAuth).",
        tags: ["mobile", "auth"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string", enum: ["vk", "yandex"] } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MobileOAuthLinkIntentData" }),
          "401": errorResponse("UNAUTHORIZED"),
          "404": errorResponse("NOT_FOUND — неизвестный провайдер"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
          "503": errorResponse("SERVICE_UNAVAILABLE (провайдер выключен, Redis) | RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    "/api/mobile/v1/auth/oauth/exchange": {
      post: {
        operationId: "mobileAuthOAuthExchange",
        summary: "Mobile: exchange the one-time OAuth code for session tokens",
        description:
          "Код одноразовый (60 с) и сгорает при любом исходе; verifier сверяется с челленджем старта " +
          "(S256). Любая проблема с кодом — один ответ 400 OAUTH_CODE_INVALID: начать вход заново. " +
          "Ответ как у OTP-входа: `{ tokens, user }`, `no-store`, без кук. Лимит прокси: 30/мин на IP " +
          "(тир mobileAuth).",
        tags: ["mobile", "auth"],
        parameters: mobileClientHeaders,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MobileOAuthExchangeInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MobileAuthData" }),
          "400": errorResponse("VALIDATION_ERROR | OAUTH_CODE_INVALID"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
          "503": errorResponse("SERVICE_UNAVAILABLE | RATE_LIMIT_UNAVAILABLE"),
        },
      },
    },
    // ── MOBILE-B2: native push ────────────────────────────────────────────
    "/api/mobile/v1/devices": {
      post: {
        operationId: "mobileDeviceRegister",
        summary: "Mobile: register this installation's push token",
        description:
          "Upsert по `X-Installation-Id` (обязателен, как и `X-Client-Platform`): вход другим аккаунтом " +
          "переносит строку, тот же токен у другой установки удаляется там. Токен привязан к текущей " +
          "семье сессии — выход и завершение сессии его удаляют. Работает и при `features.push = false`. " +
          "Формат `data` push — схема `MobilePushData`. `no-store`.",
        tags: ["mobile", "notifications"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: mobileClientHeaders,
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MobilePushDeviceInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MobilePushDeviceRegisteredData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "401": errorResponse("UNAUTHORIZED"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
      delete: {
        operationId: "mobileDeviceUnregister",
        summary: "Mobile: unlink this installation's push token",
        description: "Удаляет токен установки `X-Installation-Id` текущего пользователя. Идемпотентно (`200 {}`).",
        tags: ["mobile", "notifications"],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: mobileClientHeaders,
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MobileEmptyData" }),
          "400": errorResponse("VALIDATION_ERROR"),
          "401": errorResponse("UNAUTHORIZED"),
          "429": errorResponse("RATE_LIMITED"),
          "500": errorResponse("INTERNAL_ERROR"),
        },
      },
    },
    "/api/mobile/v1/config": {
      get: {
        operationId: "mobileConfig",
        summary: "Mobile: app config (versions, auth methods, features, legal links)",
        description:
          "Публичный, одинаковый для всех; `Cache-Control: public, max-age=60, s-maxage=300, " +
          "stale-while-revalidate=600`.",
        tags: ["mobile"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MobileAppConfig" }),
          "500": errorResponse("Internal error"),
        },
      },
    },
  },
} as const satisfies OpenApiSpec;

export function getOpenApiSpec() {
  return openApiSpec;
}

