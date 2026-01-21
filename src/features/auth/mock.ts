import type { AccountType } from "./types";

export type CurrentAccount = {
  id: string;
  name: string;
  type: AccountType;

  // если мастер привязан к студии
  studioId?: string;

  // если соло мастер
  providerId?: string;
};

export const currentAccountMock: CurrentAccount = {
  id: "u1",
  name: "Тестовый пользователь",
  type: "STUDIO_ADMIN",

  // для студии (в MVP можно использовать p2 как студию)
  studioId: "p2",
};
