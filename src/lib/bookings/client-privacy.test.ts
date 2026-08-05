import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import type {
  BookingDto,
  BookingClientDto,
  BookingClientProviderDto,
} from "@/lib/bookings/dto";
import type { ClientBookingDTO } from "@/lib/client-cabinet/bookings.service";

/**
 * MASTER-PRIVACY-FIX-A — Privacy regression tests.
 *
 * Master CRM private fields (`Booking.notes`, `ClientCard.notes`,
 * `ClientCard.tags`, `ClientCard.photos`, `ClientNote.text`) must NEVER
 * surface in client-facing DTOs or in any `select`/`include` block
 * inside a client-cabinet read path.
 *
 * Two layers guard the boundary:
 *
 *   1. **Type-level**: the client DTO types defined in
 *      `src/lib/bookings/dto.ts` + `src/lib/client-cabinet/bookings.service.ts`
 *      must not even *mention* `notes` / `tags` / `clientCard` /
 *      `clientNote` keys. If any future commit widens the DTO with one
 *      of those fields, the `KeysOf` checks below fail at compile time.
 *
 *   2. **Source-level**: the client-facing booking service files must
 *      not contain Prisma `notes: true` or `clientCard:` selects. We
 *      assert this by reading the source bytes — string-level so the
 *      regression triggers even if the offending line type-checks (e.g.
 *      someone returns a wider DTO via `as` cast).
 *
 * If a future privacy-relevant field is added to the schema, extend the
 * `FORBIDDEN_KEYS` + `FORBIDDEN_SOURCE_PATTERNS` arrays so it's covered
 * by both layers.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

function readSource(rel: string): string {
  return readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
}

/**
 * SEC-29 — раньше здесь стоял РУЧНОЙ список из шести файлов, и это тот самый
 * класс «список молча протух», ради которого в проекте уже сделаны DMMF-guard'ы
 * #35/#38: они обходят схему, а не перечисляют её. Новые client-facing чтения
 * (`api/me/model-applications/route.ts`, `client-cabinet/profile.service.ts`)
 * списком не сканировались — утечки не было, но и защиты от неё тоже.
 *
 * Теперь две половины, и обе перестают зависеть от полноты ручного перечня:
 *
 *   A. **Обратный guard (главный).** Обходится ВСЁ дерево `src/`, и каждый файл
 *      с CRM-приватным Prisma-селектом обязан числиться в `MASTER_CRM_READERS`
 *      с причиной. Список закрытый: он перечисляет тех, кому МОЖНО, а не тех,
 *      кого проверяем. Новый client-facing роут, добавивший `clientCard: {…}`,
 *      валит CI просто потому, что его там нет, — человеку придётся принять
 *      решение, а не вспомнить о существовании этого теста.
 *
 *   B. **Прямое сканирование** широкими шаблонами (`.notes` и пр.) — по
 *      КАТАЛОГАМ клиентского кабинета целиком, а не по шести именам. Широкие
 *      шаблоны нельзя пускать по всему дереву (в мастерских путях `.notes`
 *      легитимен), поэтому у половины B область осталась ограниченной — но
 *      растёт она теперь сама, вместе с каталогом.
 */
const CLIENT_FACING_ROOTS = [
  { dir: "src/app/api/cabinet/user", match: /route\.ts$/ },
  { dir: "src/app/api/me", match: /route\.ts$/ },
  { dir: "src/app/api/bookings/my", match: /route\.ts$/ },
  { dir: "src/lib/client-cabinet", match: /\.ts$/ },
] as const;

/** Файлы клиентских чтений вне этих каталогов — единственный ручной остаток. */
const CLIENT_FACING_EXTRA_FILES = [
  "src/lib/bookings/list.ts",
  "src/lib/bookings/mappers.ts",
  "src/lib/bookings/dto.ts",
] as const;

/**
 * Кому МОЖНО читать CRM-приватные поля. Ключ — путь, значение — почему.
 * Файл, попавший под шаблон и отсутствующий здесь, валит тест.
 */
const MASTER_CRM_READERS: Record<string, string> = {
  "src/lib/crm/card-service.ts": "владелец CRM-карточки — единственный writer/reader",
  "src/lib/master/clients.service.ts": "кабинет мастера: его собственная база клиентов",
  "src/lib/master/day.service.ts": "кабинет мастера: заметки к записям дня",
  "src/lib/studio/clients.service.ts": "кабинет студии: база клиентов арендатора",
  "src/lib/deletion/user-data-disposition.ts": "карта диспозиций при удалении аккаунта (инв. #35)",
  "src/lib/deletion/provider-data-disposition.ts": "карта диспозиций при удалении кабинета (инв. #38)",
  "src/lib/billing/feature-catalog.ts": "описание фичи тарифа, не чтение данных",
};

/**
 * Точные шаблоны: только они годятся для обхода всего дерева без ложных
 * срабатываний. Про единственное число см. комментарий у
 * `FORBIDDEN_SOURCE_PATTERNS` — `ModelApplication.clientNote` омоним.
 */
const CRM_SELECT_PATTERNS = [
  /\bnotes:\s*true\b/,
  /clientCards?\s*:\s*\{/i,
  /clientCards\s*:\s*true\b/i,
  /clientNotes?\s*:\s*\{/i,
  /clientNotes\s*:\s*true\b/i,
] as const;

function walkSourceFiles(relDir: string, match: RegExp): string[] {
  const absDir = resolve(PROJECT_ROOT, relDir);
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...walkSourceFiles(rel, match));
      continue;
    }
    if (/\.test\.tsx?$/.test(entry.name)) continue;
    if (match.test(entry.name)) out.push(rel);
  }
  return out;
}

const CLIENT_FACING_BOOKING_SOURCES = [
  ...CLIENT_FACING_ROOTS.flatMap((root) => walkSourceFiles(root.dir, root.match)),
  ...CLIENT_FACING_EXTRA_FILES,
];

/**
 * Substrings that must never appear in a client-facing read path. The
 * comparison is intentionally simple — these tokens have no legitimate
 * non-master use, so any occurrence indicates a leak or impending one.
 */
const FORBIDDEN_SOURCE_PATTERNS = [
  // Master-private booking field
  /\bnotes:\s*true\b/,
  // Booking.notes scalar read off the row
  /\.notes\b(?!\s*\?)/,  // exclude `notes?:` type definitions inside DTOs (none expected)
  // ClientCard / ClientNote include — корни мастерской CRM.
  //
  // 🔴 Связи в схеме называются во МНОЖЕСТВЕННОМ числе (`clientCards`,
  // `clientNotes` — `auth.prisma:92-93`, `provider.prisma:148,150`), и только
  // они бывают `: true`. Единственное число оставлено ТОЛЬКО в форме include'а
  // `: {`, потому что `ModelApplication.clientNote` (`model-offer.prisma:63`) —
  // это омоним: обычная строка, которую заявитель написал САМ и которую роут
  // возвращает ему же. Прежний шаблон `clientNote\s*:\s*[{T]` ловил её (SEC-29
  // это и вскрыл, когда область сканирования выросла), а ложные срабатывания
  // guard'а кончаются тем, что guard выключают.
  /clientCards?\s*:\s*\{/i,
  /clientCards\s*:\s*true\b/i,
  /clientNotes?\s*:\s*\{/i,
  /clientNotes\s*:\s*true\b/i,
] as const;

describe("MASTER-PRIVACY-FIX-A — DTO type shape", () => {
  it("BookingDto type has no `notes` key", () => {
    // Type-level assertion. If anyone adds `notes` to BookingDto, this
    // line fails to compile (true cannot be assigned to false).
    type HasNotes = "notes" extends keyof BookingDto ? true : false;
    const _check: HasNotes = false;
    expect(_check).toBe(false);
  });

  it("BookingClientDto type has no `notes` key", () => {
    type HasNotes = "notes" extends keyof BookingClientDto ? true : false;
    const _check: HasNotes = false;
    expect(_check).toBe(false);
  });

  it("BookingClientDto type has no `tags` key", () => {
    type HasTags = "tags" extends keyof BookingClientDto ? true : false;
    const _check: HasTags = false;
    expect(_check).toBe(false);
  });

  it("BookingClientDto type has no `clientCard` / `clientNote` key", () => {
    type HasCard = "clientCard" extends keyof BookingClientDto ? true : false;
    type HasNote = "clientNote" extends keyof BookingClientDto ? true : false;
    const _cardCheck: HasCard = false;
    const _noteCheck: HasNote = false;
    expect(_cardCheck).toBe(false);
    expect(_noteCheck).toBe(false);
  });

  it("BookingClientProviderDto has no master-private contact fields", () => {
    // Provider DTO should expose only public-facing details (name, address,
    // avatar, username) — no internal CRM fields.
    type HasNotes = "notes" extends keyof BookingClientProviderDto ? true : false;
    type HasTags = "tags" extends keyof BookingClientProviderDto ? true : false;
    const _n: HasNotes = false;
    const _t: HasTags = false;
    expect(_n).toBe(false);
    expect(_t).toBe(false);
  });

  it("ClientBookingDTO (cabinet/user route shape) has no master-private fields", () => {
    type HasNotes = "notes" extends keyof ClientBookingDTO ? true : false;
    type HasTags = "tags" extends keyof ClientBookingDTO ? true : false;
    type HasCard = "clientCard" extends keyof ClientBookingDTO ? true : false;
    const _n: HasNotes = false;
    const _t: HasTags = false;
    const _c: HasCard = false;
    expect(_n).toBe(false);
    expect(_t).toBe(false);
    expect(_c).toBe(false);
  });

  it("ClientBookingDTO has no master-CRM signal fields (incl. modelApplicationsCount)", () => {
    // MASTER-MODELS-FIX-A: the «откликался на модельные» counter lives
    // on the master CRM detail view only. Catching the leak via type-
    // level assertion gives the same compile-time barrier as the
    // existing notes/tags/clientCard checks above.
    type HasModelCount =
      "modelApplicationsCount" extends keyof ClientBookingDTO ? true : false;
    type HasHistoryToken = "historyToken" extends keyof ClientBookingDTO ? true : false;
    const _m: HasModelCount = false;
    const _h: HasHistoryToken = false;
    expect(_m).toBe(false);
    expect(_h).toBe(false);
  });
});

describe("SEC-29 — обратный guard: кто вообще читает CRM-приватные поля", () => {
  const readers = walkSourceFiles("src", /\.tsx?$/).filter((rel) =>
    CRM_SELECT_PATTERNS.some((pattern) => pattern.test(readSource(rel))),
  );

  it("обход дерева вообще что-то находит — иначе guard молча вакуумный", () => {
    expect(readers.length).toBeGreaterThan(0);
  });

  it("каждый читатель CRM-приватных полей классифицирован человеком", () => {
    const unclassified = readers.filter((rel) => !(rel in MASTER_CRM_READERS));
    expect(
      unclassified,
      `Файл читает CRM-приватные поля и не числится в MASTER_CRM_READERS. ` +
        `Если это мастерская/студийная поверхность — впишите путь и причину. ` +
        `Если клиентская — это утечка по инварианту #25: ${unclassified.join(", ")}`,
    ).toEqual([]);
  });

  it("в списке разрешённых нет протухших путей", () => {
    // Зеркальная половина: удалённый или переименованный файл должен уходить из
    // списка, иначе он снова превращается в перечень «когда-то было так».
    const stale = Object.keys(MASTER_CRM_READERS).filter((rel) => !readers.includes(rel));
    expect(stale, `Пути в MASTER_CRM_READERS больше не читают CRM-поля: ${stale.join(", ")}`).toEqual([]);
  });

  it("ни один клиентский каталог не оказался среди читателей", () => {
    const clientFacing = readers.filter((rel) =>
      CLIENT_FACING_ROOTS.some((root) => rel.startsWith(`${root.dir}/`)),
    );
    expect(clientFacing).toEqual([]);
  });
});

describe("MASTER-PRIVACY-FIX-A — Source-level boundary checks", () => {
  it("область сканирования собрана обходом каталогов, а не перечнем имён", () => {
    // Прежний ручной список из шести файлов должен целиком остаться покрытым —
    // иначе «структурная» замена молча сузила бы охват.
    for (const rel of [
      "src/lib/bookings/list.ts",
      "src/lib/bookings/mappers.ts",
      "src/lib/bookings/dto.ts",
      "src/lib/client-cabinet/bookings.service.ts",
      "src/app/api/cabinet/user/bookings/route.ts",
      "src/app/api/bookings/my/route.ts",
    ]) {
      expect(CLIENT_FACING_BOOKING_SOURCES).toContain(rel);
    }
    // и захватить то, что списком не сканировалось (SEC-29)
    expect(CLIENT_FACING_BOOKING_SOURCES).toContain("src/lib/client-cabinet/profile.service.ts");
    expect(CLIENT_FACING_BOOKING_SOURCES).toContain("src/app/api/me/model-applications/route.ts");
  });

  for (const rel of CLIENT_FACING_BOOKING_SOURCES) {
    it(`${rel} must not contain master-private Prisma selects`, () => {
      const source = readSource(rel);
      const offences: string[] = [];
      for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
        const match = source.match(pattern);
        if (match) offences.push(`${pattern} → "${match[0]}"`);
      }
      expect(
        offences,
        `Privacy leak risk in ${rel}: ${offences.join(", ")}`,
      ).toEqual([]);
    });
  }
});

describe("MASTER-PRIVACY-FIX-A — Documented invariant", () => {
  it("ClientCard model lives on a provider scope (master CRM-only)", () => {
    // Cross-reference for future maintainers: ClientCard is keyed by
    // providerId (not clientUserId-driven), confirming it's a master's
    // private view of the relationship, not a client's. The schema
    // shape is verified by Prisma.validate elsewhere; this assertion
    // exists purely as a documented anchor so anyone touching this
    // test understands the invariant. The invariant text:
    //
    //   "Master's CRM private fields (Booking.notes, ClientCard.*,
    //    ClientNote.*) MUST NOT appear in any client-facing API
    //    response, SSR payload, or DTO type."
    //
    // See MASTERRYADOM_AI_CONTEXT.md §12 (invariant #25).
    expect(true).toBe(true);
  });
});
