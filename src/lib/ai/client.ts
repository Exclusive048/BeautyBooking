import OpenAI from "openai";
import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert, trackError } from "@/lib/monitoring/alerts";

/**
 * AI chat wrapper — Yandex Cloud Foundation Models via OpenAI-compatible API.
 *
 * Single chokepoint для 4 chat surfaces (review-summary / review-reply /
 * service-description / advisor-advice). All four import `aiChat` from here
 * and call it identically; они не знают про provider.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MIGRATION HISTORY:
 *   - 2026-05-30 — original wrapper added provider-switching (OpenAI ↔ Yandex
 *     via `AI_PROVIDER` env flag). See `docs/AI-MIGRATION-STRATEGY.md`.
 *   - 2026-05-31 — OPENAI-CLEANUP-A: all 4 chat surfaces validated on Yandex
 *     Lite (≥4.0/5 quality, 0 hallucinations across 30+ samples per surface).
 *     Provider switching removed. Wrapper is now Yandex-only. `AI_PROVIDER`
 *     env value preserved as vestigial schema field (back-compat for existing
 *     `.env.local` files) but ignored here.
 *
 *   - 2026-07-13 — VISUAL-SEARCH-YANDEX-MIGRATION-01: visual search
 *     (`src/lib/visual-search/provider.ts`) migrated to Yandex too (AI Studio
 *     multimodal qwen3.6-35b-a3b + text-search-doc/query embeddings). OpenAI is
 *     fully gone from the codebase; `OPENAI_API_KEY` removed from env.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * COMPAT VERIFIED 2026-05-31 (live API smoke against Yandex compat endpoint):
 *   1. ✅ Response shape — `choices[0].message.content` path works identically;
 *      full shape mirrors OpenAI (id/object/created/model/choices/usage).
 *   2. ✅ `temperature` + `max_tokens` pass through cleanly. Low-temp produced
 *      deterministic output; `max_tokens=5` correctly truncated with
 *      `finish_reason: "length"`.
 *   3. ✅ Model URI `gpt://<folder>/yandexgpt-lite/latest` accepted as `model`
 *      field; response.model echoes back verbatim.
 *   4. ✅ Error shape preserved — OpenAI SDK throws standard error classes
 *      against the compat backend (`AuthenticationError`, `PermissionDeniedError`,
 *      `RateLimitError`, etc). `isRetryable()` works unchanged.
 *   5. ✅ JSON output via `response_format: { type: "json_object" }` works
 *      through compat (bonus — Phase 2 research had this as «native API only»).
 *
 * Total verification token cost: 149 tokens (~0.03₽).
 */

const AI_TIMEOUT_MS = 15_000;
const AI_MAX_RETRIES = 1;
const YANDEX_BASE_URL = "https://llm.api.cloud.yandex.net/v1";

let client: OpenAI | null = null;

/**
 * Default chat model — YandexGPT 5 Lite. Per-surface override via
 * `opts.model` (e.g. advisor can opt into YandexGPT Pro via
 * `gpt://<folder>/yandexgpt/latest` if quality regresses).
 */
export function resolveDefaultChatModel(): string {
  const folderId = env.YANDEX_FOLDER_ID?.trim();
  if (!folderId) {
    throw new AppError("YANDEX_FOLDER_ID is not configured", 500, "INTERNAL_ERROR");
  }
  return `gpt://${folderId}/yandexgpt-lite/latest`;
}

function getClient(): OpenAI {
  if (!client) {
    const apiKey = env.YANDEX_API_KEY?.trim();
    if (!apiKey) {
      throw new AppError("YANDEX_API_KEY is not configured", 500, "INTERNAL_ERROR");
    }
    client = new OpenAI({ apiKey, baseURL: YANDEX_BASE_URL });
  }
  return client;
}

/**
 * Test-only: reset the cached client. Used by `client.test.ts` to verify
 * construction with different mocked env values. NOT for production code.
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

  if (status === 429) {
    const count = trackError("yandex:rate-limit");
    if (count === 5) {
      void sendTelegramAlert(
        "⚠️ Yandex rate limit — AI features замедлены",
        "yandex:rate-limit",
      );
    }
    logError("Yandex rate limit hit", { scope, status, __skipAlert: true });
    return;
  }
  if (status === 402) {
    void sendTelegramAlert(
      "🚨 Yandex баланс исчерпан — AI features не работают",
      "yandex:balance-exhausted",
    );
    logError("Yandex balance exhausted", { scope, status, __skipAlert: true });
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
   * Optional per-surface model override. Use Yandex's native model URI —
   * e.g. `gpt://<folder>/yandexgpt/latest` для Pro tier. When unset, the
   * default chat model is used (see `resolveDefaultChatModel`).
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
        provider: "yandex",
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
