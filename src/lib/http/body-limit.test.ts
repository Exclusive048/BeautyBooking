import { describe, expect, it } from "vitest";

import {
  MAX_JSON_BODY_BYTES,
  exceedsDeclaredBodyLimit,
  readBodyTextCapped,
} from "./body-limit";

/**
 * SEC-16 — тело запроса разбиралось без верхней границы размера.
 *
 * Ключевой негативный случай — НЕ заголовок: `Content-Length` можно не
 * присылать (chunked) или соврать в нём, и проверка «только по заголовку»
 * тогда не ограничивает ничего. Поэтому главный тест здесь — поток без
 * `Content-Length`, который обязан быть оборван по факту прочитанных байт.
 */

function streamedRequest(chunks: string[], headers: Record<string, string> = {}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: stream,
    // Node fetch требует явного указания для потокового тела
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("exceedsDeclaredBodyLimit — слой 1 (заявленный размер)", () => {
  it("отклоняет заявленный перебор", () => {
    expect(
      exceedsDeclaredBodyLimit({
        contentType: "application/json",
        contentLength: String(MAX_JSON_BODY_BYTES + 1),
      }),
    ).toBe(true);
  });

  it("пропускает ровно планку", () => {
    expect(
      exceedsDeclaredBodyLimit({
        contentType: "application/json",
        contentLength: String(MAX_JSON_BODY_BYTES),
      }),
    ).toBe(false);
  });

  it("пропускает multipart — у загрузок своя планка в роутах", () => {
    expect(
      exceedsDeclaredBodyLimit({
        contentType: "multipart/form-data; boundary=----x",
        contentLength: String(9 * 1024 * 1024),
      }),
    ).toBe(false);
  });

  it("считает по общей планке любой не-multipart тип, включая text/plain", () => {
    // `req.json()` на content-type не смотрит — им нельзя обойти границу
    expect(
      exceedsDeclaredBodyLimit({
        contentType: "text/plain",
        contentLength: String(MAX_JSON_BODY_BYTES + 1),
      }),
    ).toBe(true);
  });

  it("не отклоняет запрос без заголовка — это работа слоя 2", () => {
    expect(
      exceedsDeclaredBodyLimit({ contentType: "application/json", contentLength: null }),
    ).toBe(false);
    expect(
      exceedsDeclaredBodyLimit({ contentType: "application/json", contentLength: "не-число" }),
    ).toBe(false);
  });
});

describe("readBodyTextCapped — слой 2 (фактические байты)", () => {
  it("возвращает тело, укладывающееся в планку", async () => {
    const res = await readBodyTextCapped(streamedRequest(['{"a":1}']), 1024);
    expect(res).toEqual({ ok: true, text: '{"a":1}' });
  });

  it("обрывает поток БЕЗ Content-Length, когда байты перевалили за планку", async () => {
    // Именно этот случай слой 1 пропустить обязан, а слой 2 — поймать.
    const res = await readBodyTextCapped(streamedRequest(["x".repeat(40), "x".repeat(40)]), 50);
    expect(res.ok).toBe(false);
  });

  it("обрывает, когда Content-Length занижен относительно фактического тела", async () => {
    const res = await readBodyTextCapped(
      streamedRequest(["x".repeat(500)], { "content-length": "10" }),
      100,
    );
    expect(res.ok).toBe(false);
  });

  it("отклоняет по заголовку, не читая тела", async () => {
    const res = await readBodyTextCapped(
      streamedRequest(["{}"], { "content-length": String(MAX_JSON_BODY_BYTES + 1) }),
    );
    expect(res.ok).toBe(false);
  });

  it("склеивает кириллицу, разрезанную посередине символа границей чанка", async () => {
    // счётчик считает БАЙТЫ, поэтому чанк может оборваться внутри символа —
    // декодировать можно только после склейки, иначе на стыке выйдет подстановочный
    // символ вместо буквы
    const full = new TextEncoder().encode('{"n":"мастер"}');
    const cut = 8; // середина двухбайтового «а»
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(full.slice(0, cut));
        controller.enqueue(full.slice(cut));
        controller.close();
      },
    });
    const req = new Request("http://localhost/api/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const res = await readBodyTextCapped(req, 1024);
    expect(res).toEqual({ ok: true, text: '{"n":"мастер"}' });
  });
});
