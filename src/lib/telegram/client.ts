import { getTelegramBotToken } from "@/lib/telegram/config";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const TELEGRAM_TIMEOUT_MS = 5000;

type SendMessagePayload = {
  chat_id: string;
  text: string;
};

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) {
    console.error("Telegram bot token is not configured");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text } satisfies SendMessagePayload),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error("Telegram sendMessage failed", { status: res.status });
    }
  } catch (error) {
    console.error("Telegram sendMessage error", { error });
  } finally {
    clearTimeout(timeout);
  }
}
