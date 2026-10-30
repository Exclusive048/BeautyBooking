import "server-only";

import { Prisma } from "@prisma/client";

/**
 * MEDIA-PURGE-MARK-DELETED (2026-10-30) — пакетная пометка `deletedAt` у медиа
 * удаляемого аккаунта / кабинета, В ТРАНЗАКЦИИ удаления.
 *
 * ## Что чинится
 *
 * Медиа удаляемого аккаунта и кабинета (DELETION-02) удаляет задача
 * `media.purge`: сначала объект в хранилище, потом строку. Пока задача не
 * отработала, строка оставалась ЖИВОЙ (`deletedAt IS NULL`), а аватар
 * кабинета публичен по построению (`isProviderMediaPubliclyVisible`), то есть
 * `/api/media/file/{id}` и вырез продолжали отдавать фото удалённого кабинета.
 * При недоступном хранилище (прецедент — приостановленный аккаунт Object
 * Storage, MEDIA-STORAGE-ORPHAN-SWEEP) задача исчерпывала повторы, и строка
 * оставалась живой бессрочно, а ежечасная уборка хранилища
 * (`sweepDeletedAssetStorage`) её не видела: та берёт только `deletedAt IS NOT
 * NULL`.
 *
 * Теперь собранные ассеты помечаются удалёнными той же транзакцией, что и
 * удаление данных: с коммитом фото перестаёт отдаваться, а байты удаляют два
 * независимых пути — `media.purge` (объект, превью, затем строку) и уборка
 * хранилища (объект и превью, отметка `storageDeletedAt`). Оба идемпотентны:
 * удаление отсутствующего ключа — не ошибка, строку purge удаляет по `id`.
 *
 * ## Почему не `deleteAssetById`
 *
 * Он делает ввод-вывод хранилища (best-effort) и открывает свою транзакцию —
 * внутри транзакции удаления кабинета ни то, ни другое недопустимо: сеть в
 * транзакции держит соединение и блокировки, а удалять байты до коммита
 * значит удалить их у откатившегося удаления. Байты здесь не трогаются.
 *
 * ## Правило 29.09 доработки · 16 (RKN-AUDIT-01)
 *
 * Любой писатель `MediaAsset.deletedAt` тем же действием удаляет эмбеддинг и
 * обнуляет `visualDescription` / `visualMeta` / `visualCategory`: удаление
 * мягкое, каскад `onDelete` не срабатывает, и данные визуального поиска
 * пережили бы фото (152-ФЗ ст. 5 ч. 7). `visualIndexed` не трогается — иначе
 * переиндексация поставила бы удалённое фото в очередь. Писателей ровно два —
 * этот и `deleteAssetById` (сторож `media/soft-delete-single-writer.test.ts`
 * требует от каждого и пометку, и обнуление `visual*`).
 *
 * Уже удалённые строки не перезаписываются (`deletedAt: null` в условии):
 * исходная дата удаления сохраняется, уборка не начинает отсчёт заново.
 * Эмбеддинг удаляется у всех переданных — у удалённой строки его быть не
 * должно, удаление отсутствующего не ошибка.
 */
type SoftDeleteDb = Pick<Prisma.TransactionClient, "mediaAsset" | "mediaAssetEmbedding">;

/** Возвращает число строк, помеченных этим вызовом. */
export async function markAssetsDeletedTx(
  tx: SoftDeleteDb,
  assetIds: readonly string[],
  now: Date = new Date(),
): Promise<number> {
  const ids = [...new Set(assetIds)];
  if (ids.length === 0) return 0;
  const marked = await tx.mediaAsset.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: {
      deletedAt: now,
      visualDescription: null,
      visualMeta: Prisma.DbNull,
      visualCategory: null,
    },
  });
  await tx.mediaAssetEmbedding.deleteMany({ where: { assetId: { in: ids } } });
  return marked.count;
}
