import type {
  SmsBalanceResult,
  SmsErrorCode,
  SmsProvider,
  SmsSendResult,
} from "./types";

export type SmscConfig = {
  login: string;
  password: string;
  sender?: string;
  sendUrl?: string;
  balanceUrl?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_SEND_URL = "https://smsc.ru/sys/send.php";
const DEFAULT_BALANCE_URL = "https://smsc.ru/sys/balance.php";

/**
 * SMSC.ru error code mapping (https://smsc.ru/api/code/).
 *  1 — параметр (phone format / payload shape) → INVALID_PHONE
 *  2 — неверный логин/пароль → AUTH_FAILED
 *  3 — недостаточно средств → INSUFFICIENT_BALANCE
 *  4 — IP заблокирован → IP_BLOCKED
 *  5 — неверный формат даты → INVALID_PHONE (treat as payload error)
 *  6 — сообщение запрещено (stop-word, blacklist) → MESSAGE_REJECTED
 *  7 — неверный формат номера → INVALID_PHONE
 *  8 — сообщение не доставлено получателю → PROVIDER_UNAVAILABLE
 *  9 — превышен лимит → RATE_LIMITED
 */
function mapSmscErrorCode(code: number | undefined): SmsErrorCode {
  switch (code) {
    case 1:
    case 5:
    case 7:
      return "INVALID_PHONE";
    case 2:
      return "AUTH_FAILED";
    case 3:
      return "INSUFFICIENT_BALANCE";
    case 4:
      return "IP_BLOCKED";
    case 6:
      return "MESSAGE_REJECTED";
    case 8:
      return "PROVIDER_UNAVAILABLE";
    case 9:
      return "RATE_LIMITED";
    default:
      return "UNKNOWN";
  }
}

type SmscSendOk = {
  id: number;
  cnt: number;
  cost?: string;
  balance?: string;
};

type SmscErrorPayload = {
  error: string;
  error_code: number;
};

type SmscBalanceOk = {
  balance: string;
  currency?: string;
};

export function buildSmscSendUrl(input: {
  config: Pick<SmscConfig, "login" | "password" | "sender" | "sendUrl">;
  phone: string;
  message: string;
}): string {
  const base = input.config.sendUrl ?? DEFAULT_SEND_URL;
  const params = new URLSearchParams({
    login: input.config.login,
    psw: input.config.password,
    phones: input.phone,
    mes: input.message,
    fmt: "3",
    charset: "utf-8",
    cost: "3",
  });
  if (input.config.sender) {
    params.set("sender", input.config.sender);
  }
  return `${base}?${params.toString()}`;
}

export function buildSmscBalanceUrl(
  config: Pick<SmscConfig, "login" | "password" | "balanceUrl">,
): string {
  const base = config.balanceUrl ?? DEFAULT_BALANCE_URL;
  const params = new URLSearchParams({
    login: config.login,
    psw: config.password,
    fmt: "3",
    cur: "1",
  });
  return `${base}?${params.toString()}`;
}

export function parseSmscSendResponse(payload: unknown): SmsSendResult {
  if (!payload || typeof payload !== "object") {
    return {
      success: false,
      error: "UNKNOWN",
      message: "Пустой ответ от SMS-провайдера.",
    };
  }
  const obj = payload as Partial<SmscSendOk & SmscErrorPayload>;
  if (typeof obj.error === "string" && obj.error.length > 0) {
    return {
      success: false,
      error: mapSmscErrorCode(obj.error_code),
      message: obj.error,
    };
  }
  if (typeof obj.id === "number") {
    return {
      success: true,
      messageId: String(obj.id),
      cost: parseFloat(obj.cost ?? "0") || 0,
      balanceLeft: parseFloat(obj.balance ?? "0") || 0,
    };
  }
  return {
    success: false,
    error: "UNKNOWN",
    message: "Не удалось распознать ответ SMS-провайдера.",
  };
}

export function parseSmscBalanceResponse(payload: unknown): SmsBalanceResult {
  if (!payload || typeof payload !== "object") {
    return { success: false, error: "Пустой ответ от SMS-провайдера." };
  }
  const obj = payload as Partial<SmscBalanceOk & SmscErrorPayload>;
  if (typeof obj.error === "string" && obj.error.length > 0) {
    return { success: false, error: obj.error };
  }
  if (typeof obj.balance === "string") {
    return {
      success: true,
      balance: parseFloat(obj.balance) || 0,
      currency: obj.currency ?? "RUB",
    };
  }
  return { success: false, error: "Не удалось распознать баланс." };
}

/**
 * RES-08 — верхняя граница запроса к SMSC.
 *
 * Fail-soft у этого провайдера построен на возврате `PROVIDER_UNAVAILABLE`,
 * то есть отрабатывает ПОСЛЕ того, как вызов вернулся, — а без границы
 * возврата может не быть вовсе: вызов инлайновый на пути выпуска OTP
 * (`otp/request/route.ts`), и зависший шлюз держит запрос пользователя.
 * Сегодня это P2 только потому, что `PHONE_AUTH_ENABLED` в проде выключен;
 * в момент включения телефонного входа цена станет той же, что у SMTP.
 *
 * 10 с: HTTP-API шлюза отвечает за сотни миллисекунд, но SMS-трафик идёт
 * через операторов, и короткий порог дал бы ложные отказы на живой отправке.
 */
const SMSC_REQUEST_TIMEOUT_MS = 10_000;
export function createSmscProvider(config: SmscConfig): SmsProvider {
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    name: "smsc",

    async send(phone, message) {
      const url = buildSmscSendUrl({ config, phone, message });
      try {
        const response = await fetchImpl(url, {
          method: "GET",
          signal: AbortSignal.timeout(SMSC_REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
          return {
            success: false,
            error: "PROVIDER_UNAVAILABLE",
            message: `HTTP ${response.status} от SMS-провайдера`,
          };
        }
        const payload = (await response.json()) as unknown;
        return parseSmscSendResponse(payload);
      } catch (error) {
        return {
          success: false,
          error: "PROVIDER_UNAVAILABLE",
          message:
            error instanceof Error ? error.message : "SMS-провайдер недоступен",
        };
      }
    },

    async checkBalance() {
      const url = buildSmscBalanceUrl(config);
      try {
        const response = await fetchImpl(url, {
          method: "GET",
          signal: AbortSignal.timeout(SMSC_REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` };
        }
        const payload = (await response.json()) as unknown;
        return parseSmscBalanceResponse(payload);
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "SMS-провайдер недоступен",
        };
      }
    },
  };
}
