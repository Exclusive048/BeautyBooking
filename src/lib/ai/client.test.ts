import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env.ts before importing client. Post OPENAI-CLEANUP-A (2026-05-31)
// `client.ts` only reads YANDEX_API_KEY + YANDEX_FOLDER_ID — `AI_PROVIDER` is
// vestigial schema field, ignored by the wrapper.
const mockEnv = vi.hoisted(() => ({
  YANDEX_API_KEY: "AQVN-test-yandex-key" as string | undefined,
  YANDEX_FOLDER_ID: "b1g-test-folder" as string | undefined,
}));

vi.mock("@/lib/env", () => ({
  env: mockEnv,
  isAiFeaturesEnabled: true,
  isProduction: false,
}));

// Stub modules client.ts imports for logging / monitoring. We only verify
// construction + model-derivation logic, not the full request lifecycle.
vi.mock("@/lib/logging/logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/monitoring/alerts", () => ({
  sendTelegramAlert: vi.fn(),
  trackError: vi.fn(() => 1),
}));

// FIX-B16: денежный потолок теперь стоит внутри `aiChat`. Здесь он замокан
// «бюджет есть» — предмет ЭТОГО файла — конструкция клиента и деривация модели.
// Поведение самого потолка (в т.ч. что при исчерпании в сеть не уходит ничего)
// проверяется в `spend-ceiling.test.ts` и `paid-call-coverage.test.ts`.
vi.mock("@/lib/ai/spend-ceiling", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/spend-ceiling")>()),
  takeAiSpendBudget: vi.fn(async () => {}),
}));

// Mock the OpenAI SDK — capture constructor args and stub chat.completions.create.
const { mockCreate, constructorCalls } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  constructorCalls: [] as Array<{ apiKey: string; baseURL?: string }>,
}));

vi.mock("openai", () => {
  function MockOpenAI(this: object, config: { apiKey: string; baseURL?: string }) {
    constructorCalls.push(config);
    (this as { chat: unknown }).chat = {
      completions: { create: mockCreate },
    };
  }
  return { default: MockOpenAI };
});

// Import AFTER mocks so the module sees the mocked env.
import { aiChat, resolveDefaultChatModel, _resetClientForTesting } from "./client";

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: "mocked AI response" } }],
  });
  constructorCalls.length = 0;
  _resetClientForTesting();
  // Reset env to default Yandex creds each test
  mockEnv.YANDEX_API_KEY = "AQVN-test-yandex-key";
  mockEnv.YANDEX_FOLDER_ID = "b1g-test-folder";
});

describe("resolveDefaultChatModel — Yandex Lite default", () => {
  it("returns Yandex Lite URI built from YANDEX_FOLDER_ID", () => {
    mockEnv.YANDEX_FOLDER_ID = "b1g-some-folder";
    expect(resolveDefaultChatModel()).toBe("gpt://b1g-some-folder/yandexgpt-lite/latest");
  });

  it("throws INTERNAL_ERROR when YANDEX_FOLDER_ID missing", () => {
    mockEnv.YANDEX_FOLDER_ID = undefined;
    expect(() => resolveDefaultChatModel()).toThrow(/YANDEX_FOLDER_ID/);
  });

  it("trims whitespace-only folder id as missing (catches '   ' misconfigs)", () => {
    mockEnv.YANDEX_FOLDER_ID = "   ";
    expect(() => resolveDefaultChatModel()).toThrow(/YANDEX_FOLDER_ID/);
  });
});

describe("aiChat — Yandex client construction", () => {
  it("constructs OpenAI SDK with YANDEX_API_KEY and Yandex compat baseURL", async () => {
    mockEnv.YANDEX_API_KEY = "AQVN-yandex-abc";
    mockEnv.YANDEX_FOLDER_ID = "b1g-folder";

    await aiChat({
      scope: "review-reply",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0].apiKey).toBe("AQVN-yandex-abc");
    expect(constructorCalls[0].baseURL).toBe("https://llm.api.cloud.yandex.net/v1");
  });

  it("passes Yandex Lite URI as default model when no override", async () => {
    mockEnv.YANDEX_FOLDER_ID = "b1g-folder-42";

    await aiChat({
      scope: "review-reply",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].model).toBe("gpt://b1g-folder-42/yandexgpt-lite/latest");
  });

  it("opts.model override beats default (per-surface Pro upgrade hook)", async () => {
    mockEnv.YANDEX_FOLDER_ID = "b1g-folder";

    await aiChat({
      scope: "advisor-advice",
      systemPrompt: "system",
      userPrompt: "user",
      model: "gpt://b1g-folder/yandexgpt/latest",
    });

    expect(mockCreate.mock.calls[0][0].model).toBe("gpt://b1g-folder/yandexgpt/latest");
  });

  it("passes temperature + max_tokens through to underlying call", async () => {
    await aiChat({
      scope: "review-reply",
      systemPrompt: "system",
      userPrompt: "user",
      temperature: 0.3,
      maxTokens: 200,
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call.temperature).toBe(0.3);
    expect(call.max_tokens).toBe(200);
  });

  it("omits max_tokens when not provided (lets API default kick in)", async () => {
    await aiChat({
      scope: "review-reply",
      systemPrompt: "system",
      userPrompt: "user",
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call.max_tokens).toBeUndefined();
  });

  it("returns trimmed content from response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "  hello world  " } }],
    });

    const result = await aiChat({
      scope: "review-reply",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(result).toBe("hello world");
  });

  it("returns null for empty / whitespace-only response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "   " } }],
    });

    const result = await aiChat({
      scope: "review-reply",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(result).toBeNull();
  });

  it("returns null if YANDEX_API_KEY missing (error caught by retry loop)", async () => {
    mockEnv.YANDEX_API_KEY = undefined;
    mockEnv.YANDEX_FOLDER_ID = "b1g-folder";

    // resolveDefaultChatModel() succeeds (folder id present), so the
    // INTERNAL_ERROR comes from getClient() during construction — caught
    // inside aiChat's try/catch which returns null (preserves contract).
    const result = await aiChat({
      scope: "review-reply",
      systemPrompt: "system",
      userPrompt: "user",
    });
    expect(result).toBeNull();
  });

  it("throws INTERNAL_ERROR if YANDEX_FOLDER_ID missing (default-model derivation runs before try/catch)", async () => {
    // resolveDefaultChatModel() is called eagerly at the top of aiChat, BEFORE
    // the retry loop's try/catch. Misconfig surfaces as a thrown AppError
    // rather than null — distinct from YANDEX_API_KEY missing, where the
    // failure happens inside getClient() inside the loop. Both are misconfig
    // signals at startup time; aiChat assumes env.ts refine catches them and
    // doesn't silently mask folder-id errors.
    mockEnv.YANDEX_FOLDER_ID = undefined;

    await expect(
      aiChat({ scope: "review-reply", systemPrompt: "system", userPrompt: "user" }),
    ).rejects.toThrow(/YANDEX_FOLDER_ID/);
  });

  it("override via opts.model bypasses default-model derivation (no folder id needed)", async () => {
    // When caller provides explicit model URI, resolveDefaultChatModel() is
    // not invoked → no YANDEX_FOLDER_ID check. Useful for tests that want to
    // exercise aiChat without env state, and for any future per-surface
    // hard-coded model overrides.
    mockEnv.YANDEX_FOLDER_ID = undefined;

    const result = await aiChat({
      scope: "review-reply",
      systemPrompt: "system",
      userPrompt: "user",
      model: "gpt://hardcoded-folder/yandexgpt-lite/latest",
    });

    expect(result).toBe("mocked AI response");
    expect(mockCreate.mock.calls[0][0].model).toBe("gpt://hardcoded-folder/yandexgpt-lite/latest");
  });
});
