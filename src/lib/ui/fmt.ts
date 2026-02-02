export const UI_FMT = {
  inviteTitle(studioName: string): string {
    return `Приглашение от ${studioName}`;
  },
  notificationTimeLabel(iso: string): string {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  },
} as const;

