import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env.ts before importing client — vi.hoisted lets us mutate per-test.
const mockEnv = vi.hoisted(() => ({
  AI_PROVIDER: "openai" as "openai" | "yandex",
  OPENAI_API_KEY: "sk-test-openai-key" as string | undefined,
  YANDEX_API_KEY: undefined as string | undefined,
  YANDEX_FOLDER_ID: undefined as string | undefined,
}));

vi.mock("@/lib/env", () => ({
  env: mockEnv,
  isAiFeaturesEnabled: true,
  isProduction: false,
}));

// Stub the modules that client.ts imports for logging / monitoring. We don't
// need their behaviour in these tests — we only verify provider/model decision
// logic, not the full request lifecycle.
vi.mock("@/lib/logging/logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/monitoring/alerts", () => ({
  sendTelegramAlert: vi.fn(),
  trackError: vi.fn(() => 1),
}));

// Mock the OpenAI SDK — capture constructor args and stub chat.completions.create.
// vi.hoisted lets the mock factory and the spy arrays share the same scope.
const { mockCreate, constructorCalls } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  constructorCalls: [] as Array<{ apiKey: string; baseURL?: string }>,
}));

vi.mock("openai", () => {
  // OpenAI SDK default export is a class — model it as a constructor function
  // so `new OpenAI({...})` runs our capture-and-stub logic correctly.
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
  // Reset mock env to OpenAI defaults each test
  mockEnv.AI_PROVIDER = "openai";
  mockEnv.OPENAI_API_KEY = "sk-test-openai-key";
  mockEnv.YANDEX_API_KEY = undefined;
  mockEnv.YANDEX_FOLDER_ID = undefined;
});

describe("resolveDefaultChatModel — provider-aware default model", () => {
  it("returns gpt-4o-mini when AI_PROVIDER=openai", () => {
    mockEnv.AI_PROVIDER = "openai";
    expect(resolveDefaultChatModel()).toBe("gpt-4o-mini");
  });

  it("returns Yandex URI when AI_PROVIDER=yandex with folder id set", () => {
    mockEnv.AI_PROVIDER = "yandex";
    mockEnv.YANDEX_API_KEY = "AQVN-test-yandex-key";
    mockEnv.YANDEX_FOLDER_ID = "b1g-test-folder";
    expect(resolveDefaultChatModel()).toBe("gpt://b1g-test-folder/yandexgpt-lite/latest");
  });

  it("throws INTERNAL_ERROR when AI_PROVIDER=yandex but YANDEX_FOLDER_ID missing", () => {
    mockEnv.AI_PROVIDER = "yandex";
    mockEnv.YANDEX_API_KEY = "AQVN-test-yandex-key";
    mockEnv.YANDEX_FOLDER_ID = undefined;
    expect(() => resolveDefaultChatModel()).toThrow(/YANDEX_FOLDER_ID/);
  });

  it("trims whitespace-only folder id as missing (catches '   ' misconfigs)", () => {
    mockEnv.AI_PROVIDER = "yandex";
    mockEnv.YANDEX_API_KEY = "AQVN-test-yandex-key";
    mockEnv.YANDEX_FOLDER_ID = "   ";
    expect(() => resolveDefaultChatModel()).toThrow(/YANDEX_FOLDER_ID/);
  });
});

describe("aiChat — provider-aware client construction", () => {
  it("OpenAI provider: constructs client with OPENAI_API_KEY and no baseURL", async () => {
    mockEnv.AI_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = "sk-openai-abc";

    await aiChat({
      scope: "test-scope",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0].apiKey).toBe("sk-openai-abc");
    expect(constructorCalls[0].baseURL).toBeUndefined();
  });

  it("Yandex provider: constructs client with YANDEX_API_KEY and compat baseURL", async () => {
    mockEnv.AI_PROVIDER = "yandex";
    mockEnv.YANDEX_API_KEY = "AQVN-yandex-xyz";
    mockEnv.YANDEX_FOLDER_ID = "b1g-folder-1";

    await aiChat({
      scope: "test-scope",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0].apiKey).toBe("AQVN-yandex-xyz");
    expect(constructorCalls[0].baseURL).toBe("https://llm.api.cloud.yandex.net/v1");
  });

  it("OpenAI: passes gpt-4o-mini as model when no override", async () => {
    mockEnv.AI_PROVIDER = "openai";

    await aiChat({
      scope: "test-scope",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].model).toBe("gpt-4o-mini");
  });

  it("Yandex: passes Yandex URI as model when no override", async () => {
    mockEnv.AI_PROVIDER = "yandex";
    mockEnv.YANDEX_API_KEY = "AQVN-key";
    mockEnv.YANDEX_FOLDER_ID = "b1g-folder-42";

    await aiChat({
      scope: "test-scope",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(mockCreate.mock.calls[0][0].model).toBe("gpt://b1g-folder-42/yandexgpt-lite/latest");
  });

  it("opts.model override beats default (per-surface upgrade, e.g. advisor → Pro)", async () => {
    mockEnv.AI_PROVIDER = "yandex";
    mockEnv.YANDEX_API_KEY = "AQVN-key";
    mockEnv.YANDEX_FOLDER_ID = "b1g-folder";

    await aiChat({
      scope: "advisor",
      systemPrompt: "system",
      userPrompt: "user",
      model: "gpt://b1g-folder/yandexgpt/latest",
    });

    expect(mockCreate.mock.calls[0][0].model).toBe("gpt://b1g-folder/yandexgpt/latest");
  });

  it("passes temperature + max_tokens through to underlying call", async () => {
    await aiChat({
      scope: "test-scope",
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
      scope: "test-scope",
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
      scope: "test-scope",
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
      scope: "test-scope",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(result).toBeNull();
  });

  it("Yandex: returns null if YANDEX_API_KEY missing (error caught by retry loop)", async () => {
    mockEnv.AI_PROVIDER = "yandex";
    mockEnv.YANDEX_API_KEY = undefined;
    mockEnv.YANDEX_FOLDER_ID = "b1g-folder";

    // `resolveDefaultChatModel()` succeeds (folder id present), so the
    // INTERNAL_ERROR comes from `getProviderConfig()` during client init —
    // which happens inside the try/catch in the retry loop. aiChat catches
    // and returns null instead of throwing (preserves existing contract
    // for surface services that already expect string | null).
    const result = await aiChat({
      scope: "test-scope",
      systemPrompt: "system",
      userPrompt: "user",
    });
    expect(result).toBeNull();
  });

  it("OpenAI: returns null if OPENAI_API_KEY missing (error caught by retry loop)", async () => {
    mockEnv.AI_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;

    const result = await aiChat({
      scope: "test-scope",
      systemPrompt: "system",
      userPrompt: "user",
    });
    expect(result).toBeNull();
  });
});
