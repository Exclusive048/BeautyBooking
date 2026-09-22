import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

// Mock env before importing provider. Visual search reads YANDEX_API_KEY +
// YANDEX_FOLDER_ID post VISUAL-SEARCH-YANDEX-MIGRATION-01.
const mockEnv = vi.hoisted(() => ({
  YANDEX_API_KEY: "AQVN-test-yandex-key" as string | undefined,
  YANDEX_FOLDER_ID: "b1g-test-folder" as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv, isProduction: false }));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({
  sendTelegramAlert: vi.fn(),
  trackError: vi.fn(() => 1),
}));

// FIX-B16: денежный потолок стоит внутри платных функций провайдера. Здесь он
// замокан «бюджет есть» — предмет этого файла — контракт с Яндексом (модель,
// эндпоинт, doc/query-сплит). Поведение потолка — `paid-call-coverage.test.ts`.
vi.mock("@/lib/ai/spend-ceiling", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/spend-ceiling")>()),
  takeAiSpendBudget: vi.fn(async () => {}),
}));

// Mock the OpenAI SDK — capture constructor args + stub chat.completions.create.
const { mockCreate, constructorCalls } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  constructorCalls: [] as Array<{ apiKey: string; baseURL?: string; project?: string }>,
}));
vi.mock("openai", () => {
  function MockOpenAI(this: object, config: { apiKey: string; baseURL?: string; project?: string }) {
    constructorCalls.push(config);
    (this as { chat: unknown }).chat = { completions: { create: mockCreate } };
  }
  return { default: MockOpenAI };
});

// Import AFTER mocks.
import {
  requestVisionJson,
  describeImageWithStrategy,
  createDocEmbedding,
  createQueryEmbedding,
  isRetryableProviderError,
  VisualProviderUnavailableError,
  _resetClientForTesting,
} from "./provider";

const IMAGE = new Uint8Array([1, 2, 3, 4]);

const strategy: VisualSearchStrategy = {
  categorySlug: "manicure",
  promptVersion: "v1",
  filterFields: ["shape", "style"],
  systemPrompt: "system",
  userPrompt: "user",
};

function mockEmbeddingFetch(length: number, ok = true, status = 200) {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status,
      json: async () => ({ embedding: Array.from({ length }, (_, i) => i / length) }),
      text: async () => "err",
    })
  );
}

// vi.fn(() => …) infers empty-tuple call args; the real fetch is called with
// (url, init) — read the captured init via a cast.
function capturedBody(fetchMock: ReturnType<typeof mockEmbeddingFetch>): Record<string, unknown> {
  const call = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
  return JSON.parse(call[1].body) as Record<string, unknown>;
}

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: '{"category":"manicure","confidence":"high"}' } }],
  });
  constructorCalls.length = 0;
  _resetClientForTesting();
  mockEnv.YANDEX_API_KEY = "AQVN-test-yandex-key";
  mockEnv.YANDEX_FOLDER_ID = "b1g-test-folder";
});

describe("vision — Yandex qwen3.6-35b-a3b via AI Studio compat endpoint", () => {
  it("constructs the OpenAI SDK with Yandex AI Studio baseURL + folder as project", async () => {
    await requestVisionJson({ imageBytes: IMAGE, systemPrompt: "s", userPrompt: "u", meter: "visual-search:search" });
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0].apiKey).toBe("AQVN-test-yandex-key");
    expect(constructorCalls[0].baseURL).toBe("https://ai.api.cloud.yandex.net/v1");
    expect(constructorCalls[0].project).toBe("b1g-test-folder");
  });

  it("calls the qwen VLM model URI with json_object response_format + inlined image", async () => {
    await requestVisionJson({ imageBytes: IMAGE, systemPrompt: "s", userPrompt: "u", meter: "visual-search:search" });
    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe("gpt://b1g-test-folder/qwen3.6-35b-a3b/latest");
    expect(call.response_format).toEqual({ type: "json_object" });
    const userContent = call.messages[1].content;
    expect(userContent[1].type).toBe("image_url");
    expect(userContent[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  // SEC-04: до фикса длину ответа ограничивал только таймаут в 30 с, то есть
  // стоимость одного анонимного vision-запроса не имела верхней границы.
  it("ставит max_tokens — стоимость ответа ограничена не только таймаутом", async () => {
    await requestVisionJson({ imageBytes: IMAGE, systemPrompt: "s", userPrompt: "u", meter: "visual-search:search" });
    const call = mockCreate.mock.calls[0][0];
    expect(call.max_tokens).toBe(1024);
  });

  it("parses a valid JSON object response", async () => {
    const result = await requestVisionJson({ imageBytes: IMAGE, systemPrompt: "s", userPrompt: "u", meter: "visual-search:search" });
    expect(result).toEqual({ category: "manicure", confidence: "high" });
  });

  it("returns null on non-JSON content", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: "not json" } }] });
    expect(await requestVisionJson({ imageBytes: IMAGE, systemPrompt: "s", userPrompt: "u", meter: "visual-search:search" })).toBeNull();
  });
});

describe("describeImageWithStrategy — contract + escape hatch", () => {
  it("returns text_description + meta on a valid describe response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              shape: "овал",
              base_color: "розовый",
              text_description: "Нежный французский маникюр овальной формы.",
            }),
          },
        },
      ],
    });
    const result = await describeImageWithStrategy(IMAGE, strategy, "visual-search:search");
    expect(result.error).toBeUndefined();
    expect(result.text_description).toBe("Нежный французский маникюр овальной формы.");
    expect(result.meta.base_color).toBe("розовый");
  });

  it("honors the {\"error\":\"not_applicable\"} escape hatch", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"error":"not_applicable"}' } }],
    });
    const result = await describeImageWithStrategy(IMAGE, strategy, "visual-search:search");
    expect(result.error).toBe("not_applicable");
    expect(result.text_description).toBe("");
  });

  it("treats empty text_description as not_applicable", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"shape":"овал","text_description":"   "}' } }],
    });
    const result = await describeImageWithStrategy(IMAGE, strategy, "visual-search:search");
    expect(result.error).toBe("not_applicable");
  });
});

describe("embeddings — doc/query split, native 256, no dim param", () => {
  it("createDocEmbedding uses text-search-doc and returns a 256-vector", async () => {
    const fetchMock = mockEmbeddingFetch(256);
    vi.stubGlobal("fetch", fetchMock);
    const vec = await createDocEmbedding("описание");
    expect(vec).toHaveLength(256);
    const body = capturedBody(fetchMock);
    expect(body.modelUri).toBe("emb://b1g-test-folder/text-search-doc/latest");
    expect(body.text).toBe("описание");
    expect("dim" in body).toBe(false); // dim MUST NOT be sent (Yandex 400s on it)
    vi.unstubAllGlobals();
  });

  it("createQueryEmbedding uses text-search-query (doc/query split guard)", async () => {
    const fetchMock = mockEmbeddingFetch(256);
    vi.stubGlobal("fetch", fetchMock);
    await createQueryEmbedding("запрос");
    const body = capturedBody(fetchMock);
    expect(body.modelUri).toBe("emb://b1g-test-folder/text-search-query/latest");
    vi.unstubAllGlobals();
  });

  it("rejects a non-256 embedding (dimension guard) → null", async () => {
    const fetchMock = mockEmbeddingFetch(128);
    vi.stubGlobal("fetch", fetchMock);
    expect(await createDocEmbedding("x")).toBeNull();
    vi.unstubAllGlobals();
  });

  // VISUAL-SEARCH-TRANSIENT-01: HTTP-отказ — это отказ ПРОВАЙДЕРА, а не
  // непригодный ответ. Прежний контракт (`null`) и был дефектом: индексатор
  // превращал его в «нераспознано» навсегда.
  it("non-ok embedding response throws VisualProviderUnavailableError", async () => {
    vi.stubGlobal("fetch", mockEmbeddingFetch(256, false, 429));
    const error = await createQueryEmbedding("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VisualProviderUnavailableError);
    expect((error as VisualProviderUnavailableError).status).toBe(429);
    expect(isRetryableProviderError(error)).toBe(true);
    vi.unstubAllGlobals();
  });

  it("402 (баланс) — отказ провайдера без ретрая", async () => {
    vi.stubGlobal("fetch", mockEmbeddingFetch(256, false, 402));
    const error = await createDocEmbedding("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VisualProviderUnavailableError);
    expect(isRetryableProviderError(error)).toBe(false);
    vi.unstubAllGlobals();
  });

  it("network failure throws a retryable VisualProviderUnavailableError", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fetch failed"))));
    const error = await createDocEmbedding("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VisualProviderUnavailableError);
    expect(isRetryableProviderError(error)).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("vision — отказ провайдера отличим от непригодного ответа", () => {
  it("SDK-исключение → VisualProviderUnavailableError (а не null → «нераспознано»)", async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }));
    const error = await requestVisionJson({
      imageBytes: IMAGE,
      systemPrompt: "s",
      userPrompt: "u",
      meter: "visual-search:index",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VisualProviderUnavailableError);
    expect(isRetryableProviderError(error)).toBe(true);
  });

  it("пустой ответ модели — по-прежнему null (ответ пришёл, но непригоден)", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: "" } }] });
    expect(
      await requestVisionJson({ imageBytes: IMAGE, systemPrompt: "s", userPrompt: "u", meter: "visual-search:search" })
    ).toBeNull();
  });
});
