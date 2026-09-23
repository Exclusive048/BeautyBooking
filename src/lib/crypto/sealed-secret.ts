import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";
import { env } from "@/lib/env";

/**
 * VK-COMMUNITY-NOTIFY-01 — шифрование платформенного секрета, который живёт в
 * БД, а не в env (решение владельца: ключ сообщества ВКонтакте вводится в
 * админке, новой переменной окружения не заводим).
 *
 * Почему шифруем, а не кладём строку как есть: дамп БД не должен становиться
 * живым доступом к сторонней системе — тот же довод, что у инв. #36 про токены
 * пользователей. Конверт — AES-256-GCM (подлинность + конфиденциальность),
 * ключ выводится HKDF-ом из `AUTH_JWT_SECRET` с меткой назначения, поэтому
 * отдельного секрета не нужно, а ключ одного назначения не открывает другое
 * (`purpose` идёт и в HKDF, и в AAD).
 *
 * ⚠️ Смена `AUTH_JWT_SECRET` делает сохранённые конверты нечитаемыми:
 * `openSecret` вернёт `null`, и секрет придётся ввести заново. Это осознанный
 * размен — хранить второй мастер-ключ ради этого случая хуже.
 *
 * Формат: `v1.<iv>.<tag>.<ciphertext>` (base64url). Версия — чтобы формат
 * можно было сменить, не гадая, чем зашифрована строка.
 */

const FORMAT_VERSION = "v1";
const IV_BYTES = 12;

function deriveKey(purpose: string): Buffer {
  const derived = hkdfSync(
    "sha256",
    Buffer.from(env.AUTH_JWT_SECRET, "utf8"),
    Buffer.alloc(0),
    Buffer.from(`masterryadom:sealed-secret:${purpose}:${FORMAT_VERSION}`, "utf8"),
    32,
  );
  return Buffer.from(derived);
}

export function sealSecret(plaintext: string, purpose: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(purpose), iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** `null` — конверт повреждён, чужого назначения или зашифрован другим ключом. */
export function openSecret(sealed: string, purpose: string): string | null {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) return null;
  try {
    const [, ivRaw, tagRaw, dataRaw] = parts;
    const iv = Buffer.from(ivRaw, "base64url");
    const tag = Buffer.from(tagRaw, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(purpose), iv);
    decipher.setAAD(Buffer.from(purpose, "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}
