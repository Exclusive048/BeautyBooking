import { createPrivateKey, sign, type KeyObject } from "node:crypto";

/**
 * MOBILE-B2 — подпись JWT для сервисов доставки без внешней библиотеки:
 *  · FCM — RS256, сервисный аккаунт Google обменивается на access token OAuth2;
 *  · APNs — ES256, ключ `.p8` (provider authentication token).
 * Ключ в лог не попадает никогда: ошибка разбора PEM пробрасывается без текста
 * ключа (у `createPrivateKey` его в сообщении нет).
 */

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function parsePrivateKey(pem: string): KeyObject {
  return createPrivateKey({ key: pem, format: "pem" });
}

export function signJwt(
  algorithm: "RS256" | "ES256",
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
  key: KeyObject,
): string {
  const encodedHeader = base64url(JSON.stringify({ alg: algorithm, typ: "JWT", ...header }));
  const encodedClaims = base64url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature =
    algorithm === "RS256"
      ? sign("RSA-SHA256", Buffer.from(signingInput), key)
      : // JOSE требует подпись ECDSA как r‖s (IEEE P1363), а не DER.
        sign("SHA256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64url(signature)}`;
}
