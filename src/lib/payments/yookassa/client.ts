import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { kopeksToRubles, type Kopeks } from "@/lib/money/kopeks";

type YookassaConfirmation = {
  type: string;
  confirmation_url?: string;
  return_url?: string;
};

type YookassaPaymentMethod = {
  id?: string;
  saved?: boolean;
  type?: string;
};

export type YookassaPaymentStatus = "pending" | "succeeded" | "canceled" | "waiting_for_capture";

type YookassaPaymentResponse = {
  id: string;
  status: YookassaPaymentStatus;
  confirmation?: YookassaConfirmation;
  payment_method?: YookassaPaymentMethod;
};

/**
 * Full payment object returned by `GET /v3/payments/{id}`. This is the
 * AUTHORITATIVE snapshot the webhook worker re-fetches (HARDENING-02): the
 * incoming notification body is an untrusted hint, so activation/cancel
 * decisions act only on `status`, `amount`, and `metadata` read from here.
 */
export type YookassaPaymentDetail = {
  id: string;
  status: YookassaPaymentStatus;
  amount?: { value: string; currency: string };
  metadata?: Record<string, unknown> | null;
  confirmation?: YookassaConfirmation;
  payment_method?: YookassaPaymentMethod;
};

export type YookassaRefundResponse = {
  id: string;
  status: "pending" | "succeeded" | "canceled";
  payment_id: string;
};

const PAYMENTS_URL = "https://api.yookassa.ru/v3/payments";
const REFUNDS_URL = "https://api.yookassa.ru/v3/refunds";

type CreateInitialPaymentInput = {
  amountKopeks: Kopeks;
  description: string;
  returnUrl: string;
  idempotenceKey: string;
  metadata: Record<string, unknown>;
};

type CreateRecurringPaymentInput = {
  amountKopeks: Kopeks;
  paymentMethodId: string;
  description: string;
  idempotenceKey: string;
  metadata: Record<string, unknown>;
};

type CreateRefundInput = {
  paymentId: string;
  amountKopeks: Kopeks;
  idempotenceKey: string;
};

function formatAmount(kopeks: Kopeks): string {
  // kopeks → rubles at the single YooKassa unit boundary (identical to
  // `(kopeks / 100).toFixed(2)`).
  return kopeksToRubles(kopeks).toFixed(2);
}

function getAuthHeader(): string {
  const shopId = env.YOOKASSA_SHOP_ID?.trim();
  const secret = env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secret) {
    throw new Error("YOOKASSA credentials are not configured");
  }
  const token = Buffer.from(`${shopId}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

async function yookassaFetch<T>(url: string, body: unknown, idempotenceKey: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
        "Idempotence-Key": idempotenceKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw new AppError("Платёжный сервис не отвечает. Попробуйте ещё раз.", 503, "PAYMENT_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !json) {
    const errorText = typeof json === "object" && json ? JSON.stringify(json) : "Unknown error";
    throw new Error(`YooKassa request failed: ${res.status} ${errorText}`);
  }
  return json;
}

export async function createInitialPayment(input: CreateInitialPaymentInput) {
  const payload = {
    amount: {
      value: formatAmount(input.amountKopeks),
      currency: "RUB",
    },
    capture: true,
    confirmation: {
      type: "redirect",
      return_url: input.returnUrl,
    },
    description: input.description,
    save_payment_method: true,
    metadata: input.metadata,
  };

  const payment = await yookassaFetch<YookassaPaymentResponse>(
    PAYMENTS_URL,
    payload,
    input.idempotenceKey
  );

  const confirmationUrl = payment.confirmation?.confirmation_url;
  if (!confirmationUrl) {
    throw new Error("YooKassa payment missing confirmation_url");
  }

  return {
    paymentId: payment.id,
    confirmationUrl,
  };
}

export async function createRecurringPayment(input: CreateRecurringPaymentInput) {
  const payload = {
    amount: {
      value: formatAmount(input.amountKopeks),
      currency: "RUB",
    },
    capture: true,
    payment_method_id: input.paymentMethodId,
    description: input.description,
    metadata: input.metadata,
  };

  const payment = await yookassaFetch<YookassaPaymentResponse>(
    PAYMENTS_URL,
    payload,
    input.idempotenceKey
  );

  return {
    status: payment.status,
    paymentId: payment.id,
    confirmationUrl: payment.confirmation?.confirmation_url ?? null,
  };
}

export async function createRefund(input: CreateRefundInput) {
  const payload = {
    payment_id: input.paymentId,
    amount: {
      value: formatAmount(input.amountKopeks),
      currency: "RUB",
    },
  };

  return yookassaFetch<YookassaRefundResponse>(
    REFUNDS_URL,
    payload,
    input.idempotenceKey
  );
}

/**
 * GET a YooKassa object (payment/refund) by id — the server-to-server
 * authenticity anchor for webhook processing (HARDENING-02). Basic auth,
 * 10s timeout.
 *
 * Return contract for the caller (webhook worker):
 *   - 404 → `null`. The id is unknown to YooKassa (forged/foreign
 *     notification) → the caller logs and drops, no state change.
 *   - transient failure (timeout / network / 5xx / any other non-OK) →
 *     THROWS. The queue retries the job (its 24h redelivery window +
 *     `DEFAULT_JOB_MAX_ATTEMPTS` are the safety net); we never silently
 *     treat a transient error as "no such payment".
 */
async function yookassaGet<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: getAuthHeader() },
      signal: controller.signal,
    });
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw new AppError("Платёжный сервис не отвечает. Попробуйте ещё раз.", 503, "PAYMENT_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 404) {
    // Drain the body so the connection can be reused; value ignored.
    await res.text().catch(() => undefined);
    return null;
  }

  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !json) {
    const errorText = typeof json === "object" && json ? JSON.stringify(json) : "Unknown error";
    throw new Error(`YooKassa GET failed: ${res.status} ${errorText}`);
  }
  return json;
}

/** Authoritative re-fetch of a payment. `null` when YooKassa returns 404. */
export function getPayment(paymentId: string): Promise<YookassaPaymentDetail | null> {
  return yookassaGet<YookassaPaymentDetail>(`${PAYMENTS_URL}/${encodeURIComponent(paymentId)}`);
}

/** Authoritative re-fetch of a refund. `null` when YooKassa returns 404. */
export function getRefund(refundId: string): Promise<YookassaRefundResponse | null> {
  return yookassaGet<YookassaRefundResponse>(`${REFUNDS_URL}/${encodeURIComponent(refundId)}`);
}
