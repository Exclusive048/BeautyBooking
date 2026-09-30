import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";
import { stripComments } from "@/lib/testing/source-scan";
import { findStudioLeaveBlock, studioMasterBlockingBookingsWhere } from "./leave-guard";

/**
 * STUDIO-LEAVE-GUARD (2026-09-24) — мастер не уходит из студии и студия не
 * исключает мастера, пока у него есть живые записи студии.
 *
 * @probe 2026-09-24 — в `findStudioLeaveBlock` условие `count === 0` заменено
 * на `count >= 0`: красный «есть записи — отказ 409». Возвращено — зелёный.
 * @probe 2026-09-24 — из `detachMasterFromStudio` (`lib/studios/masters.ts`)
 * удалён вызов `findStudioLeaveBlock(`: красный «каждая отвязка мастера от
 * студии проходит сторож» с именем файла. Возвращено — зелёный.
 * @probe 2026-09-29 — после удаления `detachMasterFromStudio` (29.09 · 04): из
 * `transferMasterOutOfStudio` убран вызов `findStudioLeaveBlock(`: красный тот же
 * кейс с `src/lib/studio/transfer-master.ts`. Возвращено — зелёный.
 */

const NOW = new Date("2026-09-24T10:00:00Z");

function db(count: number) {
  return { booking: { count: vi.fn(async () => count) } };
}

describe("findStudioLeaveBlock", () => {
  it("есть записи — отказ 409 с числом, текст по стороне", async () => {
    const master = await findStudioLeaveBlock(db(2), {
      studioProviderId: "studio-p",
      masterProviderIds: ["m1"],
      actor: "MASTER",
      now: NOW,
    });
    expect(master).toBeInstanceOf(AppError);
    expect(master?.status).toBe(409);
    expect(master?.code).toBe("MASTER_HAS_STUDIO_BOOKINGS");
    expect(master?.message).toContain("У вас есть будущие записи в студии (2)");

    const studio = await findStudioLeaveBlock(db(1), {
      studioProviderId: "studio-p",
      masterProviderIds: ["m1"],
      actor: "STUDIO",
      now: NOW,
    });
    expect(studio?.message).toContain("У мастера есть будущие записи в студии (1)");
  });

  it("записей нет — можно уходить", async () => {
    expect(
      await findStudioLeaveBlock(db(0), { studioProviderId: "s", masterProviderIds: ["m1"], actor: "MASTER" }),
    ).toBeNull();
  });

  it("мастерского кабинета нет — БД не спрашиваем", async () => {
    const counter = db(5);
    expect(
      await findStudioLeaveBlock(counter, { studioProviderId: "s", masterProviderIds: [], actor: "MASTER" }),
    ).toBeNull();
    expect(counter.booking.count).not.toHaveBeenCalled();
  });

  it("считаются только записи студии, где мастер — исполнитель, и только живые", () => {
    const where = studioMasterBlockingBookingsWhere("studio-p", ["m1"], NOW);
    const and = (where.AND ?? []) as unknown[];
    expect(and).toContainEqual({ masterProviderId: { in: ["m1"] } });
    // поверхность студии — `Booking.studioId` (через связь, 29.09 · 08)
    // без прежней ветки OR по `providerId` студии
    expect(and.slice(1)).toEqual([{ masterProviderId: { in: ["m1"] } }, { studio: { providerId: "studio-p" } }]);
    // личные записи мастера (`studioId = null`, его провайдер) условию студии не отвечают
    expect(JSON.stringify(and)).not.toContain('"providerId":"m1"');
    // живость — общий предикат удаления кабинетов
    expect(JSON.stringify(and[0])).toContain("status");
  });
});

/**
 * Полнота: каждая запись `data: { … studioId: null … }` в дереве — это
 * отвязка провайдера от студии. Такой файл обязан звать сторож либо быть
 * названным ниже с причиной. Набор выводится из дерева, а не перечисляется.
 */
const EXEMPT: Record<string, string> = {
  "src/lib/deletion/delete-master.ts":
    "удаление кабинета мастера блокируется живыми записями ЛЮБОГО вида (DELETION-03, countBlockingMasterBookings) — строже этого сторожа",
  "src/lib/deletion/delete-studio.ts":
    "удаление студии блокируется живыми записями студии (DELETION-03, countBlockingStudioBookings) — это тот же набор для всех мастеров сразу",
  "src/lib/invites/service.ts":
    "отвязывается только ничейная заготовка под приглашение (`ownerUserId: null`) — INVITED записи не принимает (инв. #24)",
  "src/lib/studios/master-profile-split.ts":
    "STUDIO-MASTER-PROFILES: из студии выходит ЛИЧНЫЙ профиль, а студийная работа (связи с услугами, живые записи студии) в той же транзакции переходит в профиль мастера в студии — мастер из студии не уходит, записи студии остаются за ней",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

describe("STUDIO-LEAVE-GUARD · полнота", () => {
  const root = process.cwd();
  const detaching = walk(path.join(root, "src"))
    .filter((file) => /data:\s*\{[^{}]*\bstudioId:\s*null/.test(stripComments(fs.readFileSync(file, "utf8"))))
    .map((file) => path.relative(root, file).split(path.sep).join("/"));

  it("набор отвязок не пуст (сторож не вакуумен)", () => {
    expect(detaching).toContain("src/lib/studio/transfer-master.ts");
    expect(detaching.length).toBeGreaterThanOrEqual(4);
  });

  it("каждая отвязка мастера от студии проходит сторож", () => {
    const missing = detaching.filter(
      (file) =>
        !EXEMPT[file] && !/\bfindStudioLeaveBlock\(/.test(stripComments(fs.readFileSync(path.join(root, file), "utf8"))),
    );
    expect(missing).toEqual([]);
  });

  it("исключения не протухли", () => {
    for (const file of Object.keys(EXEMPT)) expect(detaching).toContain(file);
  });
});
