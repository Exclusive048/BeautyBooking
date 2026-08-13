import { describe, expect, it } from "vitest";

import {
  extractClientIp,
  getClientIp,
  isPrivateClientAddress,
  resolveClientIpDiagnostics,
} from "./ip";

/**
 * FIX-B17 — обе стороны отказа `TRUSTED_PROXY_HOPS`, проверенные ПОВЕДЕНИЕМ.
 *
 * `ip.test.ts` (HARDENING-08) пиннит одну сторону: подставленная слева запись не
 * должна выигрывать при верной настройке. Здесь предмет другой — что происходит,
 * когда настройка НЕВЕРНА, потому что именно этого нельзя увидеть из кода и
 * именно ради этого построены диагностика и детектор:
 *
 *  · хопов МЕНЬШЕ реальности → два разных клиента за одним edge'ем получают
 *    ОДИН адрес, то есть каждый per-IP лимит становится глобальным;
 *  · хопов БОЛЬШЕ реальности → один и тот же клиент, меняя левую часть XFF,
 *    получает РАЗНЫЕ адреса, то есть per-IP лимит обходится ротацией.
 *
 * Обе формулировки — про наблюдаемое равенство/различие ключей, а не про то,
 * какой индекс массива взят: индекс можно «починить» так, что тест останется
 * зелёным, а ключи схлопнутся.
 *
 * @probe   что сломать: в `resolveClientIpDiagnostics` вернуть
 *          `chain[0] ?? null` вместо снятия хопов справа
 *          (`chain[Math.max(0, chain.length - effectiveHops)]`).
 *          наблюдалось: 8 failed — «hops=1, [1.1.1.1, 203.0.113.9] → 203.0.113.9:
 *          expected '1.1.1.1' to be '203.0.113.9'», «недобор: разрешается в edge:
 *          expected '203.0.113.9' to be '198.51.100.1'», «два РАЗНЫХ клиента за
 *          одним edge'ем получают ОДИН ключ», «ОДИН клиент, меняя левую часть XFF,
 *          получает РАЗНЫЕ ключи: expected '1.1.1.1' to be '2.2.2.2'».
 */

const CLIENT = "203.0.113.9";
const SPOOF_A = "1.1.1.1";
const SPOOF_B = "2.2.2.2";
const EDGE_1 = "198.51.100.1";
const EDGE_2 = "198.51.100.2";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/whatever", { headers });
}

function withChain(chain: string[], hops: number) {
  const carrier = chain.length > 0 ? req({ "x-forwarded-for": chain.join(", ") }) : req({});
  return resolveClientIpDiagnostics(carrier, { trustedHops: hops, realIpHeader: null });
}

describe("FIX-B17 · таблица «длина цепочки × хопы»", () => {
  const CASES: Array<{
    chain: string[];
    hops: number;
    resolved: string | null;
    clamped: boolean;
    note: string;
  }> = [
    { chain: [], hops: 1, resolved: null, clamped: false, note: "нет XFF вовсе" },
    { chain: [CLIENT], hops: 1, resolved: CLIENT, clamped: false, note: "верная настройка, 1 хоп" },
    { chain: [SPOOF_A, CLIENT], hops: 1, resolved: CLIENT, clamped: false, note: "HARDENING-08: левая запись игнорируется" },
    { chain: [CLIENT, EDGE_1], hops: 2, resolved: CLIENT, clamped: false, note: "верная настройка, 2 хопа" },
    { chain: [SPOOF_A, CLIENT, EDGE_1], hops: 2, resolved: CLIENT, clamped: false, note: "верная настройка, 2 хопа + подстановка" },

    // Хопов МЕНЬШЕ реальности — снимается адрес инфраструктуры.
    { chain: [CLIENT, EDGE_1], hops: 1, resolved: EDGE_1, clamped: false, note: "недобор: разрешается в edge" },
    { chain: [CLIENT, EDGE_1, EDGE_2], hops: 1, resolved: EDGE_2, clamped: false, note: "недобор на два хопа" },

    // Хопов БОЛЬШЕ реальности — две различимые формы.
    { chain: [CLIENT], hops: 2, resolved: CLIENT, clamped: true, note: "перебор, обычный трафик: кламп к левому краю" },
    { chain: [CLIENT], hops: 5, resolved: CLIENT, clamped: true, note: "перебор, обычный трафик" },
    { chain: [SPOOF_A, CLIENT], hops: 2, resolved: SPOOF_A, clamped: false, note: "перебор, эксплуатация: подставленная запись потреблена" },
    { chain: [SPOOF_A, SPOOF_B, CLIENT], hops: 3, resolved: SPOOF_A, clamped: false, note: "перебор, эксплуатация на три хопа" },
  ];

  for (const { chain, hops, resolved, clamped, note } of CASES) {
    it(`hops=${hops}, [${chain.join(", ") || "—"}] → ${resolved ?? "null"} (${note})`, () => {
      const diagnostics = withChain(chain, hops);
      expect(diagnostics.resolvedIp).toBe(resolved);
      expect(diagnostics.clamped).toBe(clamped);
      expect(diagnostics.chain).toEqual(chain);
      expect(diagnostics.effectiveHops).toBe(hops);
    });
  }
});

describe("FIX-B17 · направление 1: хопов меньше реальности — лимиты становятся общими", () => {
  it("два РАЗНЫХ клиента за одним edge'ем получают ОДИН ключ", () => {
    // Реальная топология — два прокси, настроен один: снимается адрес второго.
    const first = resolveClientIpDiagnostics(
      req({ "x-forwarded-for": `${CLIENT}, ${EDGE_1}, ${EDGE_2}` }),
      { trustedHops: 1, realIpHeader: null },
    );
    const second = resolveClientIpDiagnostics(
      req({ "x-forwarded-for": `198.51.100.77, ${EDGE_1}, ${EDGE_2}` }),
      { trustedHops: 1, realIpHeader: null },
    );

    expect(first.resolvedIp).toBe(second.resolvedIp);
    // Верная настройка тех же запросов их РАЗЛИЧАЕТ — иначе утверждение выше
    // зеленело бы и на «резолвер всегда возвращает одно и то же».
    const correctFirst = resolveClientIpDiagnostics(
      req({ "x-forwarded-for": `${CLIENT}, ${EDGE_1}, ${EDGE_2}` }),
      { trustedHops: 3, realIpHeader: null },
    );
    const correctSecond = resolveClientIpDiagnostics(
      req({ "x-forwarded-for": `198.51.100.77, ${EDGE_1}, ${EDGE_2}` }),
      { trustedHops: 3, realIpHeader: null },
    );
    expect(correctFirst.resolvedIp).not.toBe(correctSecond.resolvedIp);
  });

  it("частный случай недобора — адрес собственной инфраструктуры помечается", () => {
    const diagnostics = resolveClientIpDiagnostics(
      req({ "x-forwarded-for": `${CLIENT}, 10.0.0.7` }),
      { trustedHops: 1, realIpHeader: null },
    );
    expect(diagnostics.resolvedIp).toBe("10.0.0.7");
    expect(diagnostics.resolvedIsPrivate).toBe(true);
  });
});

describe("FIX-B17 · направление 2: хопов больше реальности — лимиты обходятся", () => {
  it("ОДИН клиент, меняя левую часть XFF, получает РАЗНЫЕ ключи", () => {
    const rotate = (spoof: string) =>
      resolveClientIpDiagnostics(req({ "x-forwarded-for": `${spoof}, ${CLIENT}` }), {
        trustedHops: 2,
        realIpHeader: null,
      }).resolvedIp;

    expect(rotate(SPOOF_A)).not.toBe(rotate(SPOOF_B));
    // Та же пара запросов при верной настройке даёт ОДИН ключ.
    const correct = (spoof: string) =>
      resolveClientIpDiagnostics(req({ "x-forwarded-for": `${spoof}, ${CLIENT}` }), {
        trustedHops: 1,
        realIpHeader: null,
      }).resolvedIp;
    expect(correct(SPOOF_A)).toBe(correct(SPOOF_B));
  });

  it("обычный трафик при переборе клампится — это и есть наблюдаемый признак", () => {
    // Запрос БЕЗ клиентского XFF: цепочка короче хопов.
    expect(withChain([CLIENT], 3).clamped).toBe(true);
    // Запрос атакующего при том же переборе НЕ клампится — признак говорит о
    // конфигурации, а не об эксплуатации. Это ограничение зафиксировано, чтобы
    // «зелёный» не читался как «эксплуатация детектируется».
    expect(withChain([SPOOF_A, SPOOF_B, CLIENT], 3).clamped).toBe(false);
  });
});

describe("FIX-B17 · диагностика и резолвер — один источник", () => {
  const SAMPLES: Array<Record<string, string>> = [
    {},
    { "x-forwarded-for": CLIENT },
    { "x-forwarded-for": `${SPOOF_A}, ${CLIENT}` },
    { "x-forwarded-for": ` , , ${CLIENT} ` },
    { "x-real-ip": EDGE_1 },
    { "x-forwarded-for": ` , `, "x-real-ip": EDGE_1 },
    { "cf-connecting-ip": EDGE_2, "x-forwarded-for": `${SPOOF_A}, ${CLIENT}` },
  ];

  for (const headers of SAMPLES) {
    it(`extractClientIp читает ровно resolvedIp: ${JSON.stringify(headers)}`, () => {
      // Вторая копия арифметики означала бы, что диагностика способна показать
      // не то, чем пользуется лимитер, — то есть инструмент проверки врал бы
      // ровно в том случае, ради которого построен.
      const carrier = req(headers);
      const options = { trustedHops: 2, realIpHeader: "cf-connecting-ip" };
      expect(extractClientIp(carrier, options)).toBe(
        resolveClientIpDiagnostics(carrier, options).resolvedIp,
      );
    });
  }

  it("getClientIp подставляет 'unknown' там, где resolvedIp === null", () => {
    const carrier = req({});
    expect(resolveClientIpDiagnostics(carrier).resolvedIp).toBeNull();
    expect(getClientIp(carrier)).toBe("unknown");
  });

  it("выделенный заголовок выигрывает и объявляет себя источником", () => {
    const diagnostics = resolveClientIpDiagnostics(
      req({ "cf-connecting-ip": EDGE_2, "x-forwarded-for": `${SPOOF_A}, ${CLIENT}` }),
      { trustedHops: 1, realIpHeader: "cf-connecting-ip" },
    );
    expect(diagnostics.source).toBe("trusted-real-ip-header");
    expect(diagnostics.resolvedIp).toBe(EDGE_2);
    // Цепочка всё равно видна оператору — иначе по ответу нельзя понять,
    // что XFF вообще приходил.
    expect(diagnostics.chain).toEqual([SPOOF_A, CLIENT]);
  });

  it("не-конечное/≤0 число хопов нормализуется к 1 и это видно в ответе", () => {
    const diagnostics = resolveClientIpDiagnostics(req({ "x-forwarded-for": `${SPOOF_A}, ${CLIENT}` }), {
      trustedHops: Number.NaN,
      realIpHeader: null,
    });
    expect(diagnostics.effectiveHops).toBe(1);
    expect(diagnostics.resolvedIp).toBe(CLIENT);
    expect(Number.isNaN(diagnostics.configuredHops)).toBe(true);
  });
});

describe("FIX-B17 · признак приватного адреса", () => {
  const PRIVATE = [
    "10.0.0.7",
    "127.0.0.1",
    "192.168.1.10",
    "172.16.0.1",
    "172.31.255.254",
    "169.254.1.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:10.1.2.3",
    "[::1]:8080",
    "10.0.0.7:51234",
  ];
  const PUBLIC = [
    CLIENT,
    "8.8.8.8",
    "172.32.0.1",
    "172.15.0.1",
    "2a02:6b8::feed:0ff",
    "unknown",
  ];

  for (const value of PRIVATE) {
    it(`${value} — приватный`, () => expect(isPrivateClientAddress(value)).toBe(true));
  }
  for (const value of PUBLIC) {
    it(`${value} — публичный`, () => expect(isPrivateClientAddress(value)).toBe(false));
  }
  it("null — не приватный (адреса нет вовсе)", () => {
    expect(isPrivateClientAddress(null)).toBe(false);
  });
});
