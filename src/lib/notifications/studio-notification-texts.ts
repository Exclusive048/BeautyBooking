/**
 * Тексты уведомлений о приглашениях в студию и о графике мастера студии.
 *
 * 29.09 доработки · 01-а (решение владельца 2026-09-29): студии часто называют
 * «Студия Ольги», а тексты дописывали к названию слово «студия» — выходило
 * «Студия Студия Ольги приглашает…». Теперь название всегда в «ёлочках» и
 * называется командой: «Вас приглашают в команду «Студия Ольги»». Пустое
 * название — формулировка без него (без «»» и без подставного «Студия»).
 *
 * Модуль чистый (без `server-only`): его тексты проверяет сторож
 * `studio-notification-texts.test.ts`. Перенос строк `lib/notifications` в
 * `UI_TEXT` — общий долг всего каталога, здесь не делается.
 */

export type NotificationText = { title: string; body: string };

function quoted(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? `«${trimmed}»` : null;
}

function master(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? `Мастер ${trimmed}` : "Мастер";
}

export const STUDIO_NOTIFICATION_TEXTS = {
  inviteEmail(studioName: string | null | undefined): NotificationText & { subject: string; ctaLabel: string } {
    const team = quoted(studioName);
    return {
      subject: team ? `Приглашение в команду ${team}` : "Приглашение в команду мастеров",
      title: "Вас приглашают в команду",
      body: `Вас приглашают в команду мастеров ${team ?? "студии"} на МастерРядом. Войдите с этой почтой — приглашение будет в уведомлениях.`,
      ctaLabel: "Открыть приглашение",
    };
  },

  inviteReceived(studioName: string | null | undefined, inviterLabel: string): NotificationText {
    const team = quoted(studioName);
    return {
      title: "Приглашение в команду",
      body: `Вас приглашают в команду ${team ?? "студии"}. Приглашение отправил(а) ${inviterLabel}.`,
    };
  },

  inviteAccepted(masterName: string | null | undefined, studioName: string | null | undefined): NotificationText {
    const team = quoted(studioName);
    return {
      title: "Мастер принял приглашение",
      body: `${master(masterName)} принял приглашение в команду${team ? ` ${team}` : ""}.`,
    };
  },

  inviteRejected(masterName: string | null | undefined, studioName: string | null | undefined): NotificationText {
    const team = quoted(studioName);
    return {
      title: "Мастер отклонил приглашение",
      body: `${master(masterName)} отклонил приглашение в команду${team ? ` ${team}` : ""}.`,
    };
  },

  inviteRevoked(studioName: string | null | undefined): NotificationText {
    const team = quoted(studioName);
    return {
      title: "Приглашение отозвано",
      body: team ? `Команда ${team} отозвала приглашение.` : "Студия отозвала приглашение.",
    };
  },

  memberLeft(masterName: string | null | undefined, studioName: string | null | undefined): NotificationText {
    const team = quoted(studioName);
    return {
      title: "Мастер вышел из команды",
      body: `${master(masterName)} вышел из команды${team ? ` ${team}` : ""}.`,
    };
  },

  memberRemoved(studioName: string | null | undefined): NotificationText {
    const team = quoted(studioName);
    return {
      title: "Вас исключили из команды",
      body: `Вас исключили из команды${team ? ` ${team}` : " студии"}. Ваша страница и личные записи остались.`,
    };
  },

  scheduleRequestSubmitted(
    masterName: string | null | undefined,
    studioName: string | null | undefined,
  ): NotificationText {
    const team = quoted(studioName);
    return {
      title: "Мастер просит изменить график",
      body: `${master(masterName)} просит изменить свой график${team ? ` в команде ${team}` : ""}.`,
    };
  },

  scheduleRequestApproved(studioName: string | null | undefined): NotificationText {
    const team = quoted(studioName);
    return {
      title: "Расписание одобрено",
      body: team ? `Команда ${team} одобрила изменения в расписании.` : "Студия одобрила изменения в расписании.",
    };
  },

  scheduleUpdatedByStudio(studioName: string | null | undefined): NotificationText {
    const team = quoted(studioName);
    return {
      title: "Студия изменила ваш график",
      body: team ? `Команда ${team} обновила ваш рабочий график.` : "Студия обновила ваш рабочий график.",
    };
  },

  scheduleRequestRejected(studioName: string | null | undefined): NotificationText {
    const team = quoted(studioName);
    return {
      title: "Расписание отклонено",
      body: team ? `Команда ${team} отклонила изменения в расписании.` : "Студия отклонила изменения в расписании.",
    };
  },
} as const;
