import OpenAI from "openai";
import { AppError } from "@/lib/api/errors";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert, trackError } from "@/lib/monitoring/alerts";

const AI_MODEL = "gpt-4o-mini";
const AI_TIMEOUT_MS = 15_000;
const AI_MAX_RETRIES = 1;

let client: OpenAI | null = null;

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError("OPENAI_API_KEY is not configured", 500, "INTERNAL_ERROR");
  }
  return apiKey;
}

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: getApiKey() });
  }
  return client;
}

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { status?: unknown; code?: unknown; name?: unknown };
  const status = typeof record.status === "number" ? record.status : null;
  const code = typeof record.code === "string" ? record.code : null;
  const name = typeof record.name === "string" ? record.name : null;

  if (status === 429 || (typeof status === "number" && status >= 500)) return true;
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ECONNREFUSED") return true;
  if (name === "APIConnectionError" || name === "APIConnectionTimeoutError" || name === "RateLimitError") return true;
  return false;
}

function logAiFailure(scope: string, error: unknown): void {
  const status =
    error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number"
      ? ((error as { status: number }).status)
      : null;

  if (status === 429) {
    const count = trackError("openai:rate-limit");
    if (count === 5) {
      void sendTelegramAlert("⚠️ OpenAI rate limit — AI features замедлены", "openai:rate-limit");
    }
    logError("OpenAI rate limit hit", { scope, status, __skipAlert: true });
    return;
  }
  if (status === 402) {
    void sendTelegramAlert("🚨 OpenAI баланс исчерпан — AI features не работают", "openai:balance-exhausted");
    logError("OpenAI balance exhausted", { scope, status, __skipAlert: true });
    return;
  }
  logError("AI request failed", {
    scope,
    status,
    error: error instanceof Error ? error.message : String(error),
    __skipAlert: true,
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type AiChatOptions = {
  scope: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
};

export async function aiChat(options: AiChatOptions): Promise<string | null> {
  const { scope, systemPrompt, userPrompt, temperature = 0.7, maxTokens } = options;

  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    try {
      const completion = await getClient().chat.completions.create(
        {
          model: AI_MODEL,
          temperature,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        },
        { signal: AbortSignal.timeout(AI_TIMEOUT_MS) },
      );

      const content = completion.choices[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        logError("AI returned empty response", { scope, __skipAlert: true });
        return null;
      }

      logInfo("AI generation completed", { scope, model: AI_MODEL, attempt });
      return content.trim();
    } catch (error) {
      if (attempt < AI_MAX_RETRIES && isRetryable(error)) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      logAiFailure(scope, error);
      return null;
    }
  }

  return null;
}
