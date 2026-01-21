"use client";

import { currentAccountMock } from "./mock";

export function useCurrentAccount() {
  // позже здесь будет запрос /session или next-auth
  return currentAccountMock;
}
