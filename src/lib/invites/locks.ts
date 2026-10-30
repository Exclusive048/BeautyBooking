import type { Prisma } from "@prisma/client";

/**
 * Транзакционные блокировки приглашений в студию (`pg_advisory_xact_lock`,
 * снимаются коммитом или откатом). Ключи живут здесь, а не у вызывающих:
 * сериализуют друг друга только одинаковые строки.
 *
 * Порядок взятия везде один — сначала человек, потом студия, — поэтому две
 * транзакции не ждут друг друга по кругу.
 */
type LockClient = Pick<Prisma.TransactionClient, "$executeRaw">;

/**
 * INVITE-ACCEPT-ATOMIC — приёмы приглашений ОДНИМ человеком идут по очереди:
 * второй видит профиль в студии, созданный первым, и получает отказ «уже
 * состоит в студии», а не второй профиль.
 */
export async function lockInviteAcceptorTx(tx: LockClient, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-accept:${userId}`}))`;
}

/**
 * Приглашения ОДНОЙ студии создаются и принимаются по очереди: подсчёт
 * неотвеченных (STUDIO-INVITE-LIMITS) и занятых мест в команде
 * (INVITE-ACCEPT-ATOMIC) иначе прошли бы две параллельные транзакции вместе и
 * перешагнули потолок. Заодно приём и повторное приглашение на тот же контакт
 * не берут строки заготовки и приглашения в разном порядке.
 *
 * @param studioId `Studio.id`
 */
export async function lockStudioInvitesTx(tx: LockClient, studioId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`studio-invites:${studioId}`}))`;
}
