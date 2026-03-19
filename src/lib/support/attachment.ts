export const SUPPORT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

export type SupportAttachmentValidationCode =
  | "ATTACHMENT_EMPTY"
  | "ATTACHMENT_TOO_LARGE"
  | "ATTACHMENT_TYPE_INVALID"
  | "ATTACHMENT_NAME_INVALID";

const MIME_VIDEO_MP4 = "video/mp4";
const IMAGE_MIME_PREFIX = "image/";
const DEFAULT_ATTACHMENT_BASENAME = "support-attachment";
const MAX_ATTACHMENT_NAME_LENGTH = 120;

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".heic",
  ".heif",
  ".avif",
]);

const MIME_DEFAULT_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
  "image/svg+xml": ".svg",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/avif": ".avif",
  [MIME_VIDEO_MP4]: ".mp4",
};

function normalizeMimeType(value: string): string {
  return value.trim().toLowerCase();
}

function isAllowedMimeType(mimeType: string): boolean {
  if (!mimeType) return false;
  if (mimeType === MIME_VIDEO_MP4) return true;
  return mimeType.startsWith(IMAGE_MIME_PREFIX);
}

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return "";
  return fileName.slice(dotIndex).toLowerCase();
}

function sanitizeFileName(value: string): string {
  const trimmed = value.trim();
  const collapsedWhitespace = trimmed.replace(/\s+/g, " ");
  const normalizedSeparators = collapsedWhitespace.replace(/[\\/]+/g, "_");
  const safeCharacters = normalizedSeparators.replace(/[^A-Za-z0-9._ -]/g, "_");
  const compactUnderscores = safeCharacters.replace(/_+/g, "_").trim();
  const cleaned = compactUnderscores.replace(/^\.+/, "").replace(/\.+$/, "");
  return cleaned || DEFAULT_ATTACHMENT_BASENAME;
}

function finalizeFileName(baseName: string, mimeType: string): string {
  let fileName = sanitizeFileName(baseName);
  let extension = getFileExtension(fileName);

  if (!extension) {
    extension = MIME_DEFAULT_EXTENSION[mimeType] ?? "";
    fileName = `${fileName}${extension}`;
  }

  if (fileName.length > MAX_ATTACHMENT_NAME_LENGTH) {
    const suffix = extension || "";
    const maxBaseLength = Math.max(1, MAX_ATTACHMENT_NAME_LENGTH - suffix.length);
    const nameWithoutExtension = extension
      ? fileName.slice(0, -extension.length)
      : fileName;
    fileName = `${nameWithoutExtension.slice(0, maxBaseLength)}${suffix}`;
  }

  return fileName;
}

function isFileNameCompatibleWithMimeType(fileName: string, mimeType: string): boolean {
  const extension = getFileExtension(fileName);
  if (!extension) return false;

  if (mimeType === MIME_VIDEO_MP4) {
    return extension === ".mp4";
  }

  if (mimeType.startsWith(IMAGE_MIME_PREFIX)) {
    return IMAGE_EXTENSIONS.has(extension);
  }

  return false;
}

export function getSupportAttachmentValidationMessage(code: SupportAttachmentValidationCode): string {
  if (code === "ATTACHMENT_TOO_LARGE") {
    return "Файл слишком большой. Допустимый размер — до 8 МБ.";
  }
  if (code === "ATTACHMENT_TYPE_INVALID") {
    return "Недопустимый тип файла. Разрешены изображения и MP4.";
  }
  if (code === "ATTACHMENT_NAME_INVALID") {
    return "Некорректное имя файла. Переименуйте файл и попробуйте снова.";
  }
  return "Файл пустой. Выберите другой файл.";
}

export function validateSupportAttachmentMeta(input: {
  fileName: string;
  mimeType: string;
  size: number;
}):
  | {
      ok: true;
      normalizedFileName: string;
      normalizedMimeType: string;
      size: number;
    }
  | {
      ok: false;
      code: SupportAttachmentValidationCode;
    } {
  const normalizedMimeType = normalizeMimeType(input.mimeType);

  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, code: "ATTACHMENT_EMPTY" };
  }

  if (input.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
    return { ok: false, code: "ATTACHMENT_TOO_LARGE" };
  }

  if (!isAllowedMimeType(normalizedMimeType)) {
    return { ok: false, code: "ATTACHMENT_TYPE_INVALID" };
  }

  const normalizedFileName = finalizeFileName(input.fileName, normalizedMimeType);
  if (!normalizedFileName) {
    return { ok: false, code: "ATTACHMENT_NAME_INVALID" };
  }

  if (!isFileNameCompatibleWithMimeType(normalizedFileName, normalizedMimeType)) {
    return { ok: false, code: "ATTACHMENT_TYPE_INVALID" };
  }

  return {
    ok: true,
    normalizedFileName,
    normalizedMimeType,
    size: input.size,
  };
}

