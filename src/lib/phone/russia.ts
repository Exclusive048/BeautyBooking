const RU_PHONE_PLUS_SEVEN_REGEX = /^\+7\d{10}$/;
const RU_PHONE_EIGHT_REGEX = /^8\d{10}$/;
const RU_PHONE_SEVEN_REGEX = /^7\d{10}$/;
const RU_PHONE_PLUS_EIGHT_REGEX = /^\+8\d{10}$/;

function compactPhone(input: string): string {
  return input.trim().replace(/[\s()-]/g, "");
}

export function normalizeRussianPhone(input: string): string | null {
  const compact = compactPhone(input);
  if (RU_PHONE_PLUS_SEVEN_REGEX.test(compact)) return compact;
  if (RU_PHONE_EIGHT_REGEX.test(compact)) return `+7${compact.slice(1)}`;
  if (RU_PHONE_SEVEN_REGEX.test(compact)) return `+7${compact.slice(1)}`;
  if (RU_PHONE_PLUS_EIGHT_REGEX.test(compact)) return `+7${compact.slice(2)}`;
  return null;
}

export function isRussianPhoneInput(input: string): boolean {
  return normalizeRussianPhone(input) !== null;
}
