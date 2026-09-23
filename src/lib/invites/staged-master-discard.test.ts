import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * STUDIO-INVITE-STUB-01 — заготовка мастера под приглашение удаляется, когда
 * принимающий уже мастер (прикрепляется его собственный кабинет) или когда
 * приглашение отклонено. Держит её внешний ключ — прежнее поведение: отвязать.
 * Прочие ошибки не глотаются.
 *
 * Удаляется только НИЧЕЙНАЯ строка (условие `ownerUserId: null` в самой
 * записи), и вместе с ней — её фото: админ студии может загрузить их в
 * редакторе профиля мастера, а у `MediaAsset` нет внешнего ключа на `Provider`.
 *
 * @probe 2026-09-23 — в `discardStagedMaster` вместо удаления возвращено
 * прежнее «отвязать» (`provider.update` без `delete`): красный «пустая
 * заготовка удаляется». Убрана проверка кода P2003 (любая ошибка → отвязать):
 * красный «чужая ошибка не глотается». Снято условие `ownerUserId: null` в
 * удалении: красный «удаление условно…». Убрана постановка `media.purge`:
 * красный «фото заготовки уходят…». Возвращено — зелёный.
 */

const providerDeleteMany = vi.hoisted(() => vi.fn());
const providerUpdateMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
const collectProviderMedia = vi.hoisted(() => vi.fn(async () => [{ id: "m1", storageKey: "k1" }]));
const enqueueMediaPurge = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/prisma", () => ({
  prisma: { provider: { deleteMany: providerDeleteMany, updateMany: providerUpdateMany } },
}));
vi.mock("@/lib/media/purge", () => ({ collectProviderMedia }));
vi.mock("@/lib/deletion/enqueue-media-purge", () => ({ enqueueMediaPurge }));

import { discardStagedMaster } from "@/lib/invites/service";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("fk", { code, clientVersion: "6" });
}

beforeEach(() => {
  providerDeleteMany.mockReset();
  providerUpdateMany.mockClear();
  enqueueMediaPurge.mockClear();
});

describe("discardStagedMaster", () => {
  it("пустая заготовка удаляется", async () => {
    providerDeleteMany.mockResolvedValue({ count: 1 });
    await expect(discardStagedMaster("stub")).resolves.toBe("deleted");
    expect(providerUpdateMany).not.toHaveBeenCalled();
  });

  it("удаление условно: только строка без владельца", async () => {
    providerDeleteMany.mockResolvedValue({ count: 1 });
    await discardStagedMaster("stub");
    expect(providerDeleteMany).toHaveBeenCalledWith({ where: { id: "stub", ownerUserId: null } });
  });

  it("строку, успевшую получить владельца, не трогает и медиа не чистит", async () => {
    providerDeleteMany.mockResolvedValue({ count: 0 });
    await expect(discardStagedMaster("stub")).resolves.toBe("kept");
    expect(enqueueMediaPurge).not.toHaveBeenCalled();
  });

  it("фото заготовки уходят в очистку хранилища вместе со строкой", async () => {
    providerDeleteMany.mockResolvedValue({ count: 1 });
    await discardStagedMaster("stub");
    expect(enqueueMediaPurge).toHaveBeenCalledWith(
      [{ id: "m1", storageKey: "k1" }],
      "staged-master-discard",
      null,
    );
  });

  it("держит внешний ключ — отвязывается, как раньше, и тоже только ничейная", async () => {
    providerDeleteMany.mockRejectedValue(prismaError("P2003"));
    await expect(discardStagedMaster("stub")).resolves.toBe("detached");
    expect(providerUpdateMany).toHaveBeenCalledWith({
      where: { id: "stub", ownerUserId: null },
      data: { studioId: null, isPublished: false },
    });
  });

  it("чужая ошибка не глотается", async () => {
    providerDeleteMany.mockRejectedValue(prismaError("P1001"));
    await expect(discardStagedMaster("stub")).rejects.toMatchObject({ code: "P1001" });
    expect(providerUpdateMany).not.toHaveBeenCalled();
  });
});
