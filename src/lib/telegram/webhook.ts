import { prisma } from "@/lib/prisma";
import { hashTelegramToken } from "@/lib/telegram/linking";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { logError } from "@/lib/logging/logger";

type TelegramCommand = {
  name: string;
  args: string[];
};

type WebhookContext = {
  requestId?: string;
};

type TextPayload = {
  text: string;
  chatId: string;
  fromId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractTextPayload(update: unknown): TextPayload | null {
  if (!isRecord(update)) return null;
  const message = update.message;
  if (!isRecord(message)) return null;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (!text) return null;
  if (!isRecord(message.chat)) return null;
  const chatIdValue = message.chat.id;
  if (typeof chatIdValue !== "number" && typeof chatIdValue !== "string") return null;
  const chatId = String(chatIdValue);
  const from = isRecord(message.from) ? message.from : null;
  const fromIdValue = from ? from.id : null;
  const fromId =
    typeof fromIdValue === "number" || typeof fromIdValue === "string" ? String(fromIdValue) : null;
  return { text, chatId, fromId };
}

function parseCommand(text: string): TelegramCommand | null {
  if (!text.startsWith("/")) return null;
  const parts = text.split(/\s+/);
  const raw = parts[0] ?? "";
  const name = raw.split("@")[0] ?? "";
  if (!name) return null;
  return { name, args: parts.slice(1) };
}

async function handleStartCommand(payload: TextPayload, context: WebhookContext): Promise<void> {
  const token = payload.text.split(/\s+/)[1];
  if (!token) {
    await sendTelegramMessage(
      payload.chatId,
      "\u0421\u0441\u044b\u043b\u043a\u0430 \u0443\u0441\u0442\u0430\u0440\u0435\u043b\u0430. \u041e\u0442\u043a\u0440\u043e\u0439 \u043f\u0440\u043e\u0444\u0438\u043b\u044c \u0438 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438 \u0437\u0430\u043d\u043e\u0432\u043e."
    );
    return;
  }

  const tokenHash = hashTelegramToken(token);
  const now = new Date();

  try {
    const linkedUserId = await prisma.$transaction(async (tx) => {
      const tokenRow = await tx.telegramLinkToken.findFirst({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true, userId: true },
      });

      if (!tokenRow) return null;

      await tx.telegramLinkToken.update({
        where: { id: tokenRow.id },
        data: { usedAt: now },
      });

      await tx.telegramLink.upsert({
        where: { userId: tokenRow.userId },
        update: {
          chatId: payload.chatId,
          telegramUserId: payload.fromId,
          isEnabled: true,
        },
        create: {
          userId: tokenRow.userId,
          chatId: payload.chatId,
          telegramUserId: payload.fromId,
          isEnabled: true,
        },
      });

      return tokenRow.userId;
    });

    if (!linkedUserId) {
      await sendTelegramMessage(
        payload.chatId,
        "\u0421\u0441\u044b\u043b\u043a\u0430 \u0443\u0441\u0442\u0430\u0440\u0435\u043b\u0430. \u041e\u0442\u043a\u0440\u043e\u0439 \u043f\u0440\u043e\u0444\u0438\u043b\u044c \u0438 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438 \u0437\u0430\u043d\u043e\u0432\u043e."
      );
      return;
    }

    await sendTelegramMessage(payload.chatId, "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u044b \u2705");
  } catch (error) {
    logError("Telegram webhook /start failed", {
      route: "POST /api/telegram/webhook",
      requestId: context.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    await sendTelegramMessage(payload.chatId, "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437 \u043f\u043e\u0437\u0436\u0435.");
  }
}

async function handleEnableCommand(payload: TextPayload): Promise<void> {
  const link = await prisma.telegramLink.findUnique({
    where: { chatId: payload.chatId },
    select: { id: true },
  });

  if (!link) {
    await sendTelegramMessage(
      payload.chatId,
      "\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u0435 Telegram \u0432 \u043f\u0440\u043e\u0444\u0438\u043b\u0435."
    );
    return;
  }

  await prisma.telegramLink.update({
    where: { id: link.id },
    data: { isEnabled: true },
  });

  await sendTelegramMessage(payload.chatId, "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u0432\u043a\u043b\u044e\u0447\u0435\u043d\u044b \u2705");
}

async function handleDisableCommand(payload: TextPayload): Promise<void> {
  const link = await prisma.telegramLink.findUnique({
    where: { chatId: payload.chatId },
    select: { id: true },
  });

  if (!link) {
    await sendTelegramMessage(
      payload.chatId,
      "\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u0435 Telegram \u0432 \u043f\u0440\u043e\u0444\u0438\u043b\u0435."
    );
    return;
  }

  await prisma.telegramLink.update({
    where: { id: link.id },
    data: { isEnabled: false },
  });

  await sendTelegramMessage(
    payload.chatId,
    "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u044b. \u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u043c\u043e\u0436\u043d\u043e \u0432 \u043f\u0440\u043e\u0444\u0438\u043b\u0435 \u0438\u043b\u0438 \u043a\u043e\u043c\u0430\u043d\u0434\u043e\u0439 /enable."
  );
}

export async function handleTelegramWebhook(update: unknown, context: WebhookContext = {}): Promise<void> {
  const payload = extractTextPayload(update);
  if (!payload) return;

  const command = parseCommand(payload.text);
  if (!command) return;

  switch (command.name) {
    case "/start":
      await handleStartCommand(payload, context);
      return;
    case "/disable":
    case "/stop":
      await handleDisableCommand(payload);
      return;
    case "/enable":
      await handleEnableCommand(payload);
      return;
    default:
      return;
  }
}
