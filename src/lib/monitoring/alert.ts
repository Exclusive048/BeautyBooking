import { env } from "@/lib/env";
import { logError } from "@/lib/logging/logger";

export type AlertLevel = "critical" | "error" | "warning";
export type AlertContext = Record<string, unknown>;

const LEVEL_LABELS: Record<AlertLevel, { emoji: string; label: string }> = {
  critical: { emoji: "🚨", label: "CRITICAL" },
  error: { emoji: "⚠️", label: "ERROR" },
  warning: { emoji: "💛", label: "WARNING" },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatUtcTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function formatContext(context?: AlertContext): string[] {
  if (!context) return [];
  return Object.entries(context).map(([key, value]) => {
    const formatted =
      typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);
    return `${escapeHtml(key)}: ${escapeHtml(formatted)}`;
  });
}

export async function sendAlert(
  level: AlertLevel,
  message: string,
  context?: AlertContext
): Promise<void> {
  if (env.NODE_ENV !== "production") return;

  const token = env.MONITORING_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.MONITORING_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    logError(message, {
      level,
      ...(context ?? {}),
      __skipAlert: true,
    });
    return;
  }

  const { emoji, label } = LEVEL_LABELS[level];
  const contextLines = formatContext(context);
  const parts = [
    `${emoji} ${label}`,
    "",
    `[МастерРядом] ${emoji} ${escapeHtml(message)}`,
  ];
  if (contextLines.length > 0) {
    parts.push("", ...contextLines);
  }
  parts.push("", `🕐 ${formatUtcTimestamp(new Date())}`);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: parts.join("\n"),
        parse_mode: "HTML",
      }),
    });

    if (!res.ok) {
      logError(message, {
        level,
        ...(context ?? {}),
        alertStatus: res.status,
        __skipAlert: true,
      });
    }
  } catch (error) {
    logError(message, {
      level,
      ...(context ?? {}),
      alertError: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
  }
}

