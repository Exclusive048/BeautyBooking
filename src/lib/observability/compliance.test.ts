import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, vi, beforeEach } from "vitest";

import { setReporter } from "@/lib/observability/report";
import {
  COMPLIANCE_FINGERPRINTS,
  reportComplianceWriteFailure,
} from "@/lib/observability/compliance";

/**
 * HARDENING-MISC-01 — сигнал о провале записи доказательства.
 *
 * Пиннится не «что-то отправилось», а три конкретных свойства:
 *   • fingerprint СТАБИЛЕН — он станет именем alert-rule, переименование его осиротит;
 *   • при выключенном GlitchTip всё вырождается в no-op (не новый режим отказа);
 *   • в событие не уезжает больше, чем уже лежит в соседнем logError.
 */

const captureMessage = vi.fn();
const captureException = vi.fn();

beforeEach(() => {
  captureMessage.mockReset();
  captureException.mockReset();
  setReporter({ captureMessage, captureException, flush: async () => true });
});

describe("reportComplianceWriteFailure", () => {
  it("шлёт событие с fingerprint как сообщением И как тегом", () => {
    reportComplianceWriteFailure(COMPLIANCE_FINGERPRINTS.consentWrite, new Error("db down"), {
      purposes: 2,
    });

    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message, ctx] = captureMessage.mock.calls[0]!;
    expect(message).toBe("compliance.consent-write-failed");
    expect(ctx.tags.compliance_writer).toBe("compliance.consent-write-failed");
    expect(ctx.level).toBe("error");
    expect(ctx.extra).toMatchObject({ purposes: 2, error: "db down" });
  });

  it("НЕ падает и НЕ шлёт, когда GlitchTip выключен (reporter отсутствует)", () => {
    setReporter(null);
    expect(() =>
      reportComplianceWriteFailure(COMPLIANCE_FINGERPRINTS.pdAccessWrite, new Error("x")),
    ).not.toThrow();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("не бросает, если сам reporter кинул — сигнал не должен становиться сбоем", () => {
    setReporter({
      captureMessage: () => {
        throw new Error("transport dead");
      },
      captureException,
      flush: async () => true,
    });
    expect(() =>
      reportComplianceWriteFailure(COMPLIANCE_FINGERPRINTS.mediaPurgeEnqueue, new Error("x")),
    ).not.toThrow();
  });

  it("не-Error приводится к строке, а не улетает объектом", () => {
    reportComplianceWriteFailure(COMPLIANCE_FINGERPRINTS.pdAccessWrite, "plain string");
    expect(captureMessage.mock.calls[0]![1].extra.error).toBe("plain string");
  });

  it("fingerprint'ы стабильны и различимы (переименование = осиротевший alert-rule)", () => {
    expect(COMPLIANCE_FINGERPRINTS).toEqual({
      consentWrite: "compliance.consent-write-failed",
      pdAccessWrite: "compliance.pd-access-write-failed",
      mediaPurgeEnqueue: "compliance.media-purge-enqueue-failed",
      pdAccessAnomaly: "compliance.pd-access-anomaly",
    });
    const values = Object.values(COMPLIANCE_FINGERPRINTS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("все три silent-loss ветки подключены", () => {
  const read = (p: string) => readFileSync(resolve(p), "utf8");

  it.each([
    ["src/lib/legal/consent.ts", "consentWrite"],
    ["src/lib/audit/pd-access.ts", "pdAccessWrite"],
    ["src/lib/deletion/enqueue-media-purge.ts", "mediaPurgeEnqueue"],
  ])("%s репортит %s и СОХРАНЯЕТ logError", (file, key) => {
    const src = read(file);
    expect(src).toContain(`COMPLIANCE_FINGERPRINTS.${key}`);
    // Сигнал ДОПОЛНЯЕТ логи, а не заменяет их.
    expect(src).toContain("logError(");
  });
});
