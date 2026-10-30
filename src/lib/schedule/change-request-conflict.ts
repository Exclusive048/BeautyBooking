import { AppError } from "@/lib/api/errors";

/**
 * SCHEDULE-REQUEST-ATOMIC — заявку мастера на расписание уже одобрили,
 * отклонили или отозвали, пока на неё смотрели (второй администратор, вторая
 * вкладка, мастер отозвал). Отдельный модуль, чтобы роут отклонения не тянул
 * за собой весь `change-requests.ts` с движком расписания.
 */
export const SCHEDULE_REQUEST_PROCESSED_MESSAGE = "Заявка уже обработана. Обновите страницу.";

export function scheduleRequestProcessedError(): AppError {
  return new AppError(SCHEDULE_REQUEST_PROCESSED_MESSAGE, 409, "CONFLICT");
}
