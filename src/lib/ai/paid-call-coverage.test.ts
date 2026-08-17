// FIX-B16 — сторож ПОЛНОТЫ покрытия платных вызовов денежным потолком.
//
// ## Почему полнота, а не членство
//
// «Проверить, что вот эти пять функций берут бюджет» — это членство: оно
// зеленеет и в день, когда появилась шестая. Ровно так протухали ручные списки
// связей (инв. #35/#38) и ровно так `details`-свип FIX-B14 нашёл поверхность
// вне трёх названных семейств. Поэтому здесь два независимых механизма полноты:
//
//   A. **Классификация экспортов чокпойнтов.** Набор берётся из самих модулей
//      (`Object.keys` рантайм-экспортов), и каждый функциональный экспорт обязан
//      быть классифицирован как `paid` либо `free`. Новый экспорт валит тест —
//      его нельзя «не заметить», как нельзя не заметить новую связь в DMMF-guard.
//      Классификация проверяется ПОВЕДЕНИЕМ: `paid` обязан при исчерпанном
//      потолке отказать и не сходить в сеть; `free` обязан в сеть не ходить
//      вовсе — иначе «free» было бы просто необоснованным утверждением.
//
//   B. **Инвентарь потребителей, выведенный из дерева ДВУМЯ сигналами** (как в
//      FIX-B14): импорт чокпойнта + семейство каталога. Новый файл, зовущий
//      платный API, не совпадёт с замороженным инвентарём — это дельта-базлайн,
//      а не floor на размер (`docs/QUALITY-GATES.md § GUARD-INTEGRITY`).
//
// ## Что здесь НЕ проверяется
//
// Форма кода. Ни одного регекспа «вызывается ли `takeAiSpendBudget`» — такой
// тест зеленеет на вызове, результат которого выброшен. Проверяется только
// наблюдаемое: ушёл ли байт в сеть.
//
// @probe (GUARD-INTEGRITY): пробы и наблюдавшийся текст падения — отчёт FIX-B16.
//
// @probe 🔴 FIX-C7 · RETRO-PROBE — ВТОРОЙ сигнал был WEAKER-THAN-CLAIMED.
//        Прежняя проба жила в отчёте (в файле её текста не было — сама по себе
//        находка: инв. #43 требует блок ЗДЕСЬ, потому что отчёт не в VCS-графе
//        сторожа). A/B, один и тот же обход
//        `fetch("https://llm.api.cloud.yandex.net/v1/chat/completions")`:
//          · в `lib/ai/_probe-direct.ts`      → 1 failed, файл назван;
//          · в `lib/reviews/_probe-direct.ts` → **17 passed, зелено**;
//          · в `lib/ai/`, но хост из константы → **17 passed, зелено**.
//        Первая ось — область сканирования была сужена до трёх каталогов, то
//        есть сигнал, заведённый против «поверхность живёт не там, где ждали»,
//        сам это допущение и делал. Расширено до всего `src/` (замер: литералы
//        хоста есть ровно в двух файлах, оба — чокпойнты, оба исключены).
//        Повторная проба после починки: обход в `lib/reviews/` → 1 failed.
//        Вторая ось (хост из константы) регекспом не лечится —
//        `AI-BYPASS-INDIRECT-HOST` в BACKLOG.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// ── Сетевой слой: ЕДИНСТВЕННЫЙ наблюдаемый факт, на котором стоит весь файл ──
const egress = vi.hoisted(() => ({ count: 0 }));

vi.mock("openai", () => {
  function MockOpenAI(this: object) {
    (this as { chat: unknown }).chat = {
      completions: {
        create: vi.fn(async () => {
          egress.count += 1;
          return { choices: [{ message: { content: "{}" } }] };
        }),
      },
    };
  }
  return { default: MockOpenAI };
});

vi.mock("@/lib/env", () => ({
  env: { YANDEX_API_KEY: "AQVN-test", YANDEX_FOLDER_ID: "b1g-test" },
  isProduction: false,
  isAiFeaturesEnabled: true,
}));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({
  sendTelegramAlert: vi.fn(),
  trackError: vi.fn(() => 1),
}));

// Потолок ИСЧЕРПАН: счётчик всегда возвращает число заведомо выше любого лимита.
const counterMode = vi.hoisted(() => ({ exhausted: true }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => [{ count: counterMode.exhausted ? 10_000_000 : 1 }]),
  },
}));

import * as providerModule from "@/lib/visual-search/provider";
import * as clientModule from "@/lib/ai/client";
import { AiSpendCeilingError, AI_SPEND_CEILINGS } from "@/lib/ai/spend-ceiling";
import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

const STRATEGY: VisualSearchStrategy = {
  categorySlug: "manicure",
  promptVersion: "v1",
  filterFields: ["shape"],
  systemPrompt: "s",
  userPrompt: "u",
};
const BYTES = new Uint8Array([1, 2, 3, 4]);

type Classification =
  | { kind: "paid"; invoke: () => Promise<unknown> }
  | { kind: "free"; why: string; invoke: () => unknown };

/**
 * Классификация КАЖДОГО функционального экспорта обоих чокпойнтов.
 * Новый экспорт, которого здесь нет, валит тест полноты ниже.
 */
const CLASSIFIED: Record<string, Classification> = {
  // ── lib/ai/client.ts ──
  aiChat: {
    kind: "paid",
    invoke: () =>
      clientModule.aiChat({ scope: "review-reply", systemPrompt: "s", userPrompt: "u" }),
  },
  resolveDefaultChatModel: {
    kind: "free",
    why: "чистая деривация URI модели из env, без обращения к провайдеру",
    invoke: () => clientModule.resolveDefaultChatModel(),
  },

  // ── lib/visual-search/provider.ts ──
  requestVisionJson: {
    kind: "paid",
    invoke: () =>
      providerModule.requestVisionJson({
        imageBytes: BYTES,
        systemPrompt: "s",
        userPrompt: "u",
        meter: "visual-search:search",
      }),
  },
  describeImageWithStrategy: {
    kind: "paid",
    invoke: () =>
      providerModule.describeImageWithStrategy(BYTES, STRATEGY, "visual-search:search"),
  },
  createDocEmbedding: {
    kind: "paid",
    invoke: () => providerModule.createDocEmbedding("описание"),
  },
  createQueryEmbedding: {
    kind: "paid",
    invoke: () => providerModule.createQueryEmbedding("запрос"),
  },
  resizeForVision: {
    kind: "free",
    why: "локальный sharp-ресайз перед отправкой; в сеть не ходит",
    invoke: () => providerModule.resizeForVision(BYTES),
  },
  isRetryableProviderError: {
    kind: "free",
    why: "чистый предикат над объектом ошибки",
    invoke: () => providerModule.isRetryableProviderError(new Error("x")),
  },
  _resetClientForTesting: {
    kind: "free",
    why: "test-only сброс кэша клиента",
    invoke: () => providerModule._resetClientForTesting(),
  },
};

function functionExportsOf(mod: Record<string, unknown>): string[] {
  return Object.keys(mod).filter((key) => typeof mod[key] === "function");
}

beforeEach(() => {
  egress.count = 0;
  counterMode.exhausted = true;
  providerModule._resetClientForTesting();
  clientModule._resetClientForTesting();
});

describe("A. классификация экспортов чокпойнтов — полнота", () => {
  it("каждый функциональный экспорт обоих чокпойнтов классифицирован", () => {
    const exports = [
      ...functionExportsOf(providerModule as unknown as Record<string, unknown>),
      ...functionExportsOf(clientModule as unknown as Record<string, unknown>),
    ];
    const unclassified = exports.filter((name) => !(name in CLASSIFIED));

    expect(
      unclassified,
      `Новый экспорт чокпойнта не классифицирован: ${unclassified.join(", ")}. ` +
        "Решите, платный он или нет, и внесите в CLASSIFIED — потолок не должен " +
        "зависеть от того, вспомнил ли о нём ревьюер.",
    ).toEqual([]);

    // Контроль машинерии: набор экспортов вообще извлекается (иначе фильтр
    // пустого множества тоже дал бы пустой `unclassified`).
    expect(exports).toContain("aiChat");
    expect(exports).toContain("createDocEmbedding");
  });
});

describe("A. поведение: платный экспорт при исчерпанном потолке", () => {
  const paid = Object.entries(CLASSIFIED).filter(([, c]) => c.kind === "paid");

  it.each(paid)("%s — отказывает и НЕ ходит в сеть", async (_name, classification) => {
    const error = await (classification as { invoke: () => Promise<unknown> })
      .invoke()
      .then(() => null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiSpendCeilingError);
    expect(egress.count).toBe(0);
  });

  it("контроль не-вакуумности: при НЕисчерпанном потолке те же вызовы в сеть идут", async () => {
    counterMode.exhausted = false;

    // Без этого весь блок выше зеленел бы на «функция всегда падает до сети»,
    // то есть не отличал бы потолок от сломанного мока.
    await clientModule
      .aiChat({ scope: "review-reply", systemPrompt: "s", userPrompt: "u" })
      .catch(() => null);

    expect(egress.count).toBeGreaterThan(0);
  });
});

describe("A. поведение: бесплатный экспорт действительно бесплатный", () => {
  const free = Object.entries(CLASSIFIED).filter(([, c]) => c.kind === "free");

  it.each(free)("%s — в сеть не ходит", async (_name, classification) => {
    counterMode.exhausted = false;
    try {
      await (classification as { invoke: () => unknown }).invoke();
    } catch {
      // Аргументы синтетические — исход вызова не предмет проверки.
      // Предмет — отсутствие сетевого обращения.
    }
    expect(egress.count).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Инвентарь потребителей, выведенный из дерева ДВУМЯ сигналами.
// ─────────────────────────────────────────────────────────────────────────────

const SRC_ROOT = join(process.cwd(), "src");
const CHOKEPOINT_IMPORTS = ["@/lib/ai/client", "@/lib/visual-search/provider"];
/**
 * Прямое обращение к платному провайдеру — то, чего мимо чокпойнта быть не
 * должно. Вынесено из тела проверки, чтобы у распознавания был собственный
 * контроль на фикстуре (FIX-C7).
 *
 * ⚠️ Граница названа честно: узнаётся ЛИТЕРАЛ хоста. Хост, собранный из
 * константы или env (`fetch(`${BASE}/v1/chat/completions`)`), не распознаётся —
 * замерено, это вторая ось находки FIX-C7, и регекспом она не лечится (нужен
 * поток данных). Заведено как `AI-BYPASS-INDIRECT-HOST` в BACKLOG.
 */
function callsProviderDirectly(source: string): boolean {
  return /new OpenAI\(|llm\.api\.cloud\.yandex\.net|ai\.api\.cloud\.yandex\.net/.test(source);
}

/**
 * Замороженный инвентарь потребителей платных чокпойнтов. Дельта-базлайн:
 * измеряет ИЗМЕНЕНИЕ, а не величину (см. GUARD-INTEGRITY — floor на размер
 * находок запрещён, дельта-базлайны разрешены явно).
 */
const KNOWN_PAID_CONSUMERS = [
  "lib/advisor/ai-advice.ts",
  "lib/ai/review-reply.ts",
  "lib/ai/review-summary.ts",
  "lib/ai/service-description.ts",
  "lib/visual-search/classifier.ts",
  "lib/visual-search/indexer.ts",
  "lib/visual-search/searcher.ts",
].sort();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Комментарии срезаются ДО разбора, а совпадение требует формы ОПЕРАТОРА
 * (`import`/`export … from "<чокпойнт>"`), а не просто подстроки `from "…"`.
 * Наивная подстрочная версия ловила упоминание чокпойнта в комментарии — это
 * поймал собственный контроль машинерии ниже, а не ревью. Класс ошибки:
 * over-inclusion дала бы ложное падение инвентаря, то есть гейт, который
 * отключат.
 */
export function importsChokepoint(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  return CHOKEPOINT_IMPORTS.some((mod) =>
    new RegExp(
      `^[ \\t]*(?:import|export)\\b[^;]*?from\\s+["']${mod.replace(/[/@-]/g, "\\$&")}["']`,
      "m",
    ).test(code),
  );
}

function relative(file: string): string {
  return file.slice(SRC_ROOT.length + 1).replace(/\\/g, "/");
}

describe("B. инвентарь потребителей выводится из дерева, а не из списка", () => {
  it("контроль машинерии: разборщик узнаёт импорт и пропускает похожее-но-не-то", () => {
    // Положительный вход, который обязан быть узнан.
    expect(importsChokepoint('import { aiChat } from "@/lib/ai/client";')).toBe(true);
    expect(
      importsChokepoint('import {\n  requestVisionJson,\n} from "@/lib/visual-search/provider";'),
    ).toBe(true);
    // Отрицательные: соседние модули с похожими именами платными не являются.
    expect(importsChokepoint('import { getAiFeaturesEnabled } from "@/lib/ai/config";')).toBe(false);
    expect(importsChokepoint('import { x } from "@/lib/visual-search/prompt";')).toBe(false);
    expect(importsChokepoint("// from \"@/lib/ai/client\" — упоминание в комментарии")).toBe(false);
  });

  it("набор файлов, зовущих платный чокпойнт, не изменился незамеченным", () => {
    const found = walk(SRC_ROOT)
      .filter((file) => {
        const rel = relative(file);
        // Сами чокпойнты и их тесты — не потребители.
        if (rel === "lib/ai/client.ts" || rel === "lib/visual-search/provider.ts") return false;
        return importsChokepoint(readFileSync(file, "utf8"));
      })
      .map(relative)
      .sort();

    expect(
      found,
      "Изменился набор файлов, вызывающих платный AI-чокпойнт. Новый потребитель " +
        "получает потолок автоматически (метр обязателен типом), но инвентарь " +
        "надо обновить осознанно — и заодно проверить, что метр выбран верный.",
    ).toEqual(KNOWN_PAID_CONSUMERS);
  });

  it("второй сигнал — прямое обращение к провайдеру — не находит обходов чокпойнта", () => {
    // FIX-B14: один сигнал пропускает поверхность, живущую не там, где ждали.
    //
    // 🔴 FIX-C7 · RETRO-PROBE: ровно это и случилось со ВТОРЫМ сигналом. Он
    // сканировал только `CALL_SITE_FAMILIES` (`lib/ai/`, `lib/advisor/`,
    // `lib/visual-search/`), то есть повторял ту же ошибку уровнем ниже —
    // «поверхность живёт там, где ждали». A/B: один и тот же обход
    // (`fetch("https://llm.api.cloud.yandex.net/…")`) внутри `lib/ai/` → red,
    // он же в `lib/reviews/` → **зелено**. А новая AI-поверхность в новом
    // каталоге — самый вероятный способ завести обход, потому что автор её
    // туда и положит.
    //
    // Область расширена до всего `src/`. Замер: литералы хоста встречаются
    // ровно в двух файлах — обоих чокпойнтах, которые и так исключены, — так
    // что расширение на чистом дереве no-op.
    const scanned = walk(SRC_ROOT).map(relative);

    const suspicious = scanned.filter((rel) => {
      if (rel === "lib/ai/client.ts" || rel === "lib/visual-search/provider.ts") return false;
      if (KNOWN_PAID_CONSUMERS.includes(rel)) return false;
      const source = readFileSync(join(SRC_ROOT, rel), "utf8");
      return callsProviderDirectly(source);
    });

    expect(
      suspicious,
      `Файл обращается к провайдеру мимо чокпойнта: ${suspicious.join(", ")}. ` +
        "Мимо чокпойнта — значит мимо денежного потолка.",
    ).toEqual([]);
  });

  /**
   * Не-вакуумность — контроль машинерии на ФИКСИРОВАННОЙ фикстуре.
   *
   * FIX-C7: здесь стоял `expect(familyFiles.length).toBeGreaterThan(0)` —
   * счётчик, то есть ровно та опора, которую GUARD-INTEGRITY правило 2
   * запрещает: он проверяет, что каталог не пуст, а не что разборщик умеет
   * узнавать обход. Фикстура не зависит от состояния дерева.
   */
  it("распознавание прямого вызова провайдера живо (контроль машинерии)", () => {
    expect(
      callsProviderDirectly('await fetch("https://llm.api.cloud.yandex.net/v1/chat/completions");'),
      "разборщик перестал узнавать прямой вызов чат-провайдера — проверка обходов стала вакуумной",
    ).toBe(true);
    expect(
      callsProviderDirectly('await fetch("https://ai.api.cloud.yandex.net/v1/embeddings");'),
    ).toBe(true);
    expect(callsProviderDirectly("const client = new OpenAI({ apiKey });")).toBe(true);
    expect(
      callsProviderDirectly('await fetch("https://storage.yandexcloud.net/bucket/key");'),
      "разборщик считает обходом обычный запрос к хранилищу — инвентарь наполнится шумом",
    ).toBe(false);
  });
});

describe("реестр потолков", () => {
  it("каждый метр несёт осмысленно положительный потолок", () => {
    for (const [meter, ceiling] of Object.entries(AI_SPEND_CEILINGS)) {
      expect(ceiling, `потолок метра ${meter}`).toBeGreaterThan(0);
      expect(Number.isInteger(ceiling)).toBe(true);
    }
  });

  it("ратифицированный SEC-04 бюджет сохранён по смыслу: 200 запросов = 600 вызовов", () => {
    // Один поиск по фото = classify + describe + query-embedding.
    expect(AI_SPEND_CEILINGS["visual-search:search"]).toBe(200 * 3);
  });
});
