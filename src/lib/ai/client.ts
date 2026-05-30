import OpenAI from "openai";
import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert, trackError } from "@/lib/monitoring/alerts";

/**
 * AI chat wrapper — provider-aware (MIGRATION-STRATEGY 2026-05-30 Phase 4a).
 *
 * Supports two providers, selected via `env.AI_PROVIDER`:
 * - `openai` (default) — direct `https://api.openai.com`, uses `OPENAI_API_KEY`
 * - `yandex` — Yandex Cloud's OpenAI-compatible endpoint
 *   (`https://llm.api.cloud.yandex.net/v1`), uses `YANDEX_API_KEY` +
 *   `YANDEX_FOLDER_ID` for the model URI.
 *
 * Reversibility: switching `AI_PROVIDER` requires no code change. Keep
 * `OPENAI_API_KEY` in env even after migration to Yandex — instant rollback.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COMPAT VERIFIED (AI-WRAPPER-VERIFICATION 2026-05-31 — live API smoke):
 *   1. ✅ Response shape — `choices[0].message.content` path works
 *      identically; full shape (id/object/created/model/choices/usage)
 *      mirrors OpenAI exactly. `usage` includes `prompt_tokens` /
 *      `completion_tokens` / `total_tokens` / `prompt_tokens_details`.
 *   2. ✅ `temperature` + `max_tokens` pass through cleanly. Low-temp call
 *      produced deterministic output; `max_tokens=5` correctly truncated
 *      with `finish_reason: "length"`.
 *   3. ✅ Model URI `gpt://<folder>/yandexgpt-lite/latest` accepted as
 *      `model` field; response.model echoes it back verbatim.
 *   4. ✅ Error shape preserved — OpenAI SDK throws its standard error
 *      classes regardless of compat backend: invalid key →
 *      `AuthenticationError` (status 401, type `authentication_error`);
 *      invalid folder → `PermissionDeniedError` (status 403, type
 *      `permission_error`). Existing `isRetryable()` + `logAiFailure()`
 *      work unchanged. Bonus: excessive `max_tokens` is silently clamped
 *      (no error — Yandex tolerant).
 *   5. ✅ JSON output via `response_format: { type: "json_object" }` works
 *      through the compat layer (bonus — Phase 2 research had this as
 *      «native API only»; Yandex's compat actually passes it through).
 *      Returned content parses as valid JSON.
 *
 * Total verification token cost: 149 tokens (~0.03₽) — well within budget.
 * ───────────────────────────────────────────────────────────────────────────
 */

const AI_TIMEOUT_MS = 15_000;
const AI_MAX_RETRIES = 1;

let client: OpenAI | null = null;

type ProviderConfig = { apiKey: string; baseURL?: string };

function getProviderConfig(): ProviderConfig {
  if (env.AI_PROVIDER === "yandex") {
    const apiKey = env.YANDEX_API_KEY?.trim();
    if (!apiKey) {
      throw new AppError("YANDEX_API_KEY is not configured", 500, "INTERNAL_ERROR");
    }
    return { apiKey, baseURL: "https://llm.api.cloud.yandex.net/v1" };
  }
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError("OPENAI_API_KEY is not configured", 500, "INTERNAL_ERROR");
  }
  return { apiKey };
}

/**
 * Default chat model per provider. Per-surface override via `opts.model`
 * (e.g. advisor can opt into YandexGPT 5 Pro if Lite quality regresses
 * during Phase 4e validation).
 */
export function resolveDefaultChatModel(): string {
  if (env.AI_PROVIDER === "yandex") {
    const folderId = env.YANDEX_FOLDER_ID?.trim();
    if (!folderId) {
      throw new AppError("YANDEX_FOLDER_ID is not configured", 500, "INTERNAL_ERROR");
    }
    return `gpt://${folderId}/yandexgpt-lite/latest`;
  }
  return "gpt-4o-mini";
}

function getClient(): OpenAI {
  if (!client) {
    const config = getProviderConfig();
    client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
  }
  return client;
}

/**
 * Test-only: reset the cached client. Used by `client.test.ts` to verify
 * provider-switch behaviour with different mocked env values. NOT for
 * production code.
 */
export function _resetClientForTesting(): void {
  client = null;
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

  const providerLabel = env.AI_PROVIDER === "yandex" ? "Yandex" : "OpenAI";
  if (status === 429) {
    const count = trackError(`${env.AI_PROVIDER}:rate-limit`);
    if (count === 5) {
      void sendTelegramAlert(
        `⚠️ ${providerLabel} rate limit — AI features замедлены`,
        `${env.AI_PROVIDER}:rate-limit`,
      );
    }
    logError(`${providerLabel} rate limit hit`, { scope, status, __skipAlert: true });
    return;
  }
  if (status === 402) {
    void sendTelegramAlert(
      `🚨 ${providerLabel} баланс исчерпан — AI features не работают`,
      `${env.AI_PROVIDER}:balance-exhausted`,
    );
    logError(`${providerLabel} balance exhausted`, { scope, status, __skipAlert: true });
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
  /**
   * Optional per-surface model override. Use the provider's native model
   * identifier — e.g. `"gpt-4o"` for OpenAI or
   * `gpt://<folder>/yandexgpt/latest` for Yandex Pro. When unset, the
   * provider's default chat model is used (see `resolveDefaultChatModel`).
   */
  model?: string;
};

export async function aiChat(options: AiChatOptions): Promise<string | null> {
  const { scope, systemPrompt, userPrompt, temperature = 0.7, maxTokens, model } = options;
  const resolvedModel = model ?? resolveDefaultChatModel();

  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    try {
      const completion = await getClient().chat.completions.create(
        {
          model: resolvedModel,
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

      logInfo("AI generation completed", {
        scope,
        provider: env.AI_PROVIDER,
        model: resolvedModel,
        attempt,
      });
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
