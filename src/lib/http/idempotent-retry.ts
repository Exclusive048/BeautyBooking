/**
 * LOGIC-10 — двойной клик по «Записаться» не должен выглядеть как «время занято».
 *
 * Серверная идемпотентность (инв. #28) отвечает проигравшему `409
 * DUPLICATE_REQUEST`, если победитель ещё не дописал свою транзакцию. Клиенты
 * же трактовали ЛЮБОЙ 409 как конфликт слота: booking-степпер показывал экран
 * «время занято» и ротировал ключ, после чего повтор упирался в СОБСТВЕННУЮ
 * только что созданную бронь и получал уже настоящий `SLOT_CONFLICT`. Пакетные
 * визарды на 409 отправляли клиента пересобирать пакет. То есть пользователь,
 * чья запись успешно создана, видел ровно противоположное реальности — на
 * самом критичном шаге воронки.
 *
 * `DUPLICATE_REQUEST` — не отказ, а «подожди, тот же самый запрос ещё в
 * работе»: с тем же ключом сервер вернёт закэшированный результат, как только
 * победитель закоммитится. Поэтому запрос повторяется тем же телом и тем же
 * ключом, а не превращается в ошибку.
 */

export const DUPLICATE_REQUEST_CODE = "DUPLICATE_REQUEST";

/** Ответ вида «этот же запрос уже выполняется» (в отличие от конфликта слота). */
export async function isDuplicateRequestResponse(response: Response): Promise<boolean> {
  if (response.status !== 409) return false;
  try {
    // Клон — тело обязано остаться читаемым для вызывающего.
    const json = (await response.clone().json()) as
      | { ok: false; error?: { code?: string } }
      | null;
    return json?.error?.code === DUPLICATE_REQUEST_CODE;
  } catch {
    return false;
  }
}

/**
 * POST с тем же ключом идемпотентности, повторяемый пока сервер отвечает
 * «запрос ещё в работе». Возвращает последний ответ — вызывающий разбирает его
 * как обычно.
 *
 * `init.body` у всех вызывающих — строка, поэтому повторная отправка
 * безопасна: тело не поток и не расходуется.
 */
export async function fetchRetryingDuplicates(
  input: string,
  init: RequestInit,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<Response> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const delayMs = options.delayMs ?? 400;

  let response = await fetch(input, init);
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    if (!(await isDuplicateRequestResponse(response))) return response;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    response = await fetch(input, init);
  }
  return response;
}
