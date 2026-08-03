import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createMock = vi.fn();
const logErrorMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { pdAccessLog: { create: (...args: unknown[]) => createMock(...args) } },
}));

vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req-test",
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

const { buildFilterFingerprint, recordPdAccess } = await import("@/lib/audit/pd-access");
const { PdAccessActorType } = await import("@prisma/client");

/**
 * RKN-FIX-10 — след массовых чтений ПДн.
 *
 * Что здесь пиннится, кроме «оно пишет»: (1) в след не уходят прочитанные
 * данные; (2) провал записи не роняет запрос вызывающего; (3) публичные
 * поверхности не инструментируются (иначе журнал утонет в шуме и перестанет
 * отвечать на вопрос инцидента).
 */

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({ id: "pd-1" });
  logErrorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordPdAccess", () => {
  it("пишет событие админского чтения списка пользователей: актор, тип, счётчик, поверхность", async () => {
    await recordPdAccess({
      surface: "admin.users.list",
      actorType: PdAccessActorType.ADMIN,
      actorUserId: "admin-1",
      entityType: "UserProfile",
      rowCount: 50,
      filterFingerprint: "search|limit=50",
      ipAddress: "203.0.113.7",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0]).toMatchObject({
      data: {
        actorUserId: "admin-1",
        actorType: PdAccessActorType.ADMIN,
        surface: "admin.users.list",
        entityType: "UserProfile",
        rowCount: 50,
        filterFingerprint: "search|limit=50",
        requestId: "req-test",
        ipAddress: "203.0.113.7",
      },
    });
  });

  it("пишет событие мастерского чтения CRM со scope-якорем провайдера", async () => {
    await recordPdAccess({
      surface: "master.clients.list",
      actorType: PdAccessActorType.MASTER,
      actorUserId: "master-1",
      entityType: "ClientCard",
      rowCount: 13,
      scopeProviderId: "prov-1",
    });

    const data = createMock.mock.calls[0]![0].data;
    expect(data.actorType).toBe(PdAccessActorType.MASTER);
    expect(data.scopeProviderId).toBe("prov-1");
    expect(data.rowCount).toBe(13);
  });

  it("ОДНО событие на ответ, а не на строку", async () => {
    await recordPdAccess({
      surface: "admin.users.list",
      actorType: PdAccessActorType.ADMIN,
      actorUserId: "admin-1",
      entityType: "UserProfile",
      rowCount: 100,
    });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("пустая выборка не пишется — нули только разбавляют картину инцидента", async () => {
    await recordPdAccess({
      surface: "admin.users.list",
      actorType: PdAccessActorType.ADMIN,
      actorUserId: "admin-1",
      entityType: "UserProfile",
      rowCount: 0,
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("провал вставки НЕ роняет запрос, но громко логируется", async () => {
    createMock.mockRejectedValueOnce(new Error("db down"));

    await expect(
      recordPdAccess({
        surface: "master.clients.list",
        actorType: PdAccessActorType.MASTER,
        actorUserId: "master-1",
        entityType: "ClientCard",
        rowCount: 5,
      }),
    ).resolves.toBeUndefined();

    expect(logErrorMock).toHaveBeenCalledTimes(1);
    expect(logErrorMock.mock.calls[0]![0]).toBe("Failed to record PD access");
  });
});

describe("buildFilterFingerprint — форма запроса, но не данные", () => {
  it("отдаёт стабильную отсортированную форму", () => {
    expect(buildFilterFingerprint({ role: true, search: true }, { limit: 50 })).toBe(
      "role+search|limit=50",
    );
    // Порядок ключей на входе не влияет на результат.
    expect(buildFilterFingerprint({ search: true, role: true }, { limit: 50 })).toBe(
      "role+search|limit=50",
    );
  });

  it("отсутствие фильтров читается как «листали всё»", () => {
    expect(buildFilterFingerprint({ search: false, role: false }, { limit: 100 })).toBe(
      "none|limit=100",
    );
  });

  it("значения фильтров в отпечаток не попадают — только сам факт", () => {
    // Сигнатура принимает boolean, поэтому значение сюда физически не передать;
    // тест пинит, что отпечаток состоит из ИМЁН фильтров.
    const fp = buildFilterFingerprint({ search: true }, { limit: 25, offset: 50 });
    expect(fp).toBe("search|limit=25|offset=50");
    expect(fp).not.toMatch(/\+7|@|ivan|Иван/);
  });
});

describe("инструментирование: где след есть и где его намеренно нет", () => {
  const read = (p: string) => readFileSync(resolve(p), "utf8");

  it("все bulk-поверхности инструментированы (вкл. billing — RKN-FIX-18 pre-step)", () => {
    expect(read("src/features/admin-cabinet/users/server/users.service.ts")).toContain(
      "recordPdAccess",
    );
    expect(read("src/lib/master/clients.service.ts")).toContain("recordPdAccess");
    expect(read("src/lib/studio/clients.service.ts")).toContain("recordPdAccess");
    // Обе billing-выдачи несут displayName+email+phone плательщика — в
    // RKN-FIX-10 остались с пометкой ⚠️, закрыты здесь.
    expect(read("src/features/admin-cabinet/billing/server/payments.service.ts")).toContain(
      "recordPdAccess",
    );
    expect(read("src/features/admin-cabinet/billing/server/subscriptions.service.ts")).toContain(
      "recordPdAccess",
    );
  });

  it("каждый ключ PdAccessSurface действительно используется", () => {
    // Иначе тип обрастает «обещанными» поверхностями, которых нет в коде —
    // ровно то состояние, в котором billing-ключи прожили RKN-FIX-10.
    const owner = read("src/lib/audit/pd-access.ts");
    const keys = [...owner.matchAll(/\|\s*"([a-z]+\.[a-z.]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThanOrEqual(5);

    const sources = [
      "src/features/admin-cabinet/users/server/users.service.ts",
      "src/lib/master/clients.service.ts",
      "src/lib/studio/clients.service.ts",
      "src/features/admin-cabinet/billing/server/payments.service.ts",
      "src/features/admin-cabinet/billing/server/subscriptions.service.ts",
    ].map(read).join("\n");

    const unused = keys.filter((k) => !sources.includes(`"${k}"`));
    expect(unused, `Ключи поверхностей без вызова: ${unused.join(", ")}`).toEqual([]);
  });

  it("публичный каталог НЕ инструментирован — это данные, опубликованные самим провайдером", () => {
    // Логировать чтения публичных поверхностей — шум, а не сигнал: он утопит
    // те немногие события, ради которых журнал заводился.
    const catalog = read("src/lib/catalog/catalog.service.ts");
    expect(catalog).not.toContain("recordPdAccess");
  });

  it("никто, кроме модуля-владельца, не пишет в PdAccessLog напрямую", () => {
    const OWNER = "src/lib/audit/pd-access.ts";
    const offenders: string[] = [];

    const walk = (dir: string, acc: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, acc);
        else if (/\.tsx?$/.test(full)) acc.push(full);
      }
      return acc;
    };

    for (const file of walk(resolve("src"))) {
      const rel = file.slice(resolve(".").length + 1).split(sep).join("/");
      if (rel === OWNER || /\.test\.tsx?$/.test(rel)) continue;
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      if (/pdAccessLog\s*\.\s*(create|createMany|update|updateMany|delete|deleteMany|upsert)\b/.test(code)) {
        offenders.push(rel);
      }
    }

    expect(
      offenders,
      `Прямая запись в PdAccessLog вне ${OWNER}: ${offenders.join(", ")}. ` +
        "Весь след идёт через recordPdAccess() — он и только он держит правило " +
        "«никаких прочитанных данных в журнале» и семантику отказа.",
    ).toEqual([]);
  });
});
