/**
 * FIX-LINK-STATE-CONSISTENCY-01 — the SINGLE source of truth for external-
 * account (VK / Telegram) link state.
 *
 * Two ORTHOGONAL facts, never merged into one "connected" boolean (merging them
 * is exactly what produced the G-4 drift bug — some sites computed
 * `Boolean(id)`, others `Boolean(id && isEnabled)`):
 *
 *  - **isLinked** — an external account is attached to the user. An IDENTITY
 *    fact: the link row exists with a real provider id. Independent of whether
 *    the user wants notifications through it.
 *  - **isDeliveryEnabled** — the user wants notifications delivered through the
 *    linked account. A DELIVERY PREFERENCE: requires the link AND its
 *    `isEnabled` flag. Can never be true without being linked.
 *
 * A user can be **linked with delivery off** — a legitimate, common state, and
 * the one whose two-way computation caused the profile card to say
 * «Не подключено» while settings said connected.
 *
 * `linkId` is the provider identity field (`VkLink.vkUserId` / `TelegramLink.chatId`).
 * `TelegramLink.chatId` is nullable, so id-presence — not row-existence — is the
 * correct linked signal (a row without a chatId cannot deliver and is not
 * "linked" for our purposes); this preserves the existing summary semantics.
 *
 * Pure, client-safe (no server-only imports) — usable in services and, via the
 * DTO it feeds, in client components.
 */
export type LinkState = {
  /** An external account is attached (identity fact). */
  isLinked: boolean;
  /** Notifications are delivered through it (delivery preference). */
  isDeliveryEnabled: boolean;
};

export function resolveLinkState(
  input:
    | { linkId: string | null | undefined; isEnabled: boolean | null | undefined }
    | null
    | undefined,
): LinkState {
  const isLinked = Boolean(input?.linkId);
  return { isLinked, isDeliveryEnabled: isLinked && Boolean(input?.isEnabled) };
}
