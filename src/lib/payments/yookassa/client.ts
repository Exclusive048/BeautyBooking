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

type YookassaRefundResponse = {
  id: string;
  status: "pending" | "succeeded" | "canceled";
  payment_id: string;
};

const PAYMENTS_URL = "https://api.yookassa.ru/v3/payments";
const REFUNDS_URL = "https://api.yookassa.ru/v3/refunds";

type CreateInitialPaymentInput = {
  amountKopeks: number;
  description: string;
  returnUrl: string;
  idempotenceKey: string;
  metadata: Record<string, unknown>;
};

type CreateRecurringPaymentInput = {
  amountKopeks: number;
  paymentMethodId: string;
  description: string;
  idempotenceKey: string;
  metadata: Record<string, unknown>;
};

type CreateRefundInput = {
  paymentId: string;
  amountKopeks: number;
  idempotenceKey: string;
};

function formatAmount(kopeks: number): string {
  return (kopeks / 100).toFixed(2);
}

function getAuthHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secret = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secret) {
    throw new Error("YOOKASSA credentials are not configured");
  }
  const token = Buffer.from(`${shopId}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

async function yookassaFetch<T>(url: string, body: unknown, idempotenceKey: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify(body),
  });

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
