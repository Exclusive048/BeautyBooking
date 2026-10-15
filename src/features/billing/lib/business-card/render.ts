import { LOGO_MARK_PETALS } from "@/components/brand/logo-mark";
import { BRAND_COLORS, withAlpha } from "@/lib/ui/brand-colors";
import * as UI_TEXT from "@/lib/ui/text";
import { isFinderModule, type QrMatrix } from "./qr-matrix";

/**
 * Визитка мастера и студии — два холста в бренд-палитре.
 *
 * - `print` — 90 × 50 мм (стандартная российская визитка), 1800 × 1000 px,
 *   то есть ~500 dpi: печатается без мыла. Слева кремовая «бумага» с именем,
 *   специализацией, адресом и описанием, справа бордовая панель с QR-кодом.
 * - `story` — 1080 × 1920, сторис и посты: бордовый фон, крупное фото, внизу
 *   кремовая карточка с QR-кодом. Верхние и нижние ~200 px сторис закрывает
 *   интерфейс соцсети — там только декор и знак бренда.
 *
 * Цвета — только `BRAND_COLORS` (зеркало `globals.css`, UI-04): холст не читает
 * CSS-переменные. Белый у QR — намеренный литерал: подложке кода нужен
 * максимальный контраст для сканера, а не оттенок палитры.
 *
 * Модуль без React и без сети: всё, что нужно холсту (фото, матрица QR,
 * гарнитура), вызывающий загружает заранее и передаёт в `BusinessCardContent`.
 */

export type BusinessCardFormat = "print" | "story";

export const BUSINESS_CARD_FORMATS: readonly BusinessCardFormat[] = ["print", "story"];

export const BUSINESS_CARD_SIZE: Record<BusinessCardFormat, { width: number; height: number }> = {
  print: { width: 1800, height: 1000 },
  story: { width: 1080, height: 1920 },
};

export type BusinessCardContent = {
  name: string;
  /** Специализация / слоган («Мастер маникюра»). Пустая строка — строки нет. */
  tagline: string;
  address: string;
  bio: string;
  /** Полный адрес страницы (`https://masterryadom.ru/u/…`). */
  profileUrl: string;
  avatar: HTMLImageElement | null;
  /** Матрица модулей либо, если её не удалось прочитать, готовый холст QR. */
  qr: QrMatrix | HTMLCanvasElement;
  /** CSS-список гарнитур для `ctx.font` (Playfair Display + запасные). */
  fontFamily: string;
};

const QR_WHITE = "#FFFFFF";
const TAU = Math.PI * 2;

// lucide `map-pin` (поле 24 × 24) — та же иконка, что у адреса в интерфейсе.
const PIN_PATH =
  "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0";

// ─── Текст ────────────────────────────────────────────────────────────────

type FontOptions = { weight?: 400 | 500 | 600 | 700; italic?: boolean };

function fontOf(family: string, size: number, options: FontOptions = {}): string {
  return `${options.italic ? "italic " : ""}${options.weight ?? 400} ${Math.round(size)}px ${family}`;
}

/** Пробелы и переводы строк — в один пробел: описание приходит из textarea. */
function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Специализация без ведущей «#» и с заглавной буквы. */
function normalizeTagline(value: string): string {
  const text = normalizeText(value).replace(/^#+\s*/, "");
  return text ? text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1) : "";
}

function initialsOf(name: string): string {
  const words = normalizeText(name).split(" ").filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? "");
  return letters.join("").toLocaleUpperCase("ru-RU") || "·";
}

/**
 * Обрезка с «…» по границе слова: «полный ци…» на визитке выглядит как
 * ошибка. Режем посреди слова, только если иначе пропадает больше половины
 * строки; висящий разделитель («·», запятая, тире) перед «…» снимаем.
 */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${chars.slice(0, mid).join("").trimEnd()}…`;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  let cut = chars.slice(0, lo).join("");
  const lastSpace = cut.lastIndexOf(" ");
  if (chars[lo] !== " " && lastSpace > cut.length / 2) cut = cut.slice(0, lastSpace);
  return `${cut.replace(/[\s·,;:—–-]+$/u, "")}…`;
}

/** Перенос по словам; не влезло в `maxLines` — последняя строка с «…». */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  if (maxLines <= 0) return [];
  const words = normalizeText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i += 1) {
    const candidate = current ? `${current} ${words[i]}` : words[i];
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = words[i];
    if (lines.length === maxLines) {
      const rest = [lines.pop(), ...words.slice(i)].join(" ");
      lines.push(ellipsize(ctx, rest, maxWidth));
      return lines;
    }
  }
  if (current) lines.push(current);
  return lines.map((line) => ellipsize(ctx, line, maxWidth));
}

/**
 * Две строки примерно равной длины, а не «всё в первую, хвост во вторую»:
 * заголовок «Наведите камеру на код» иначе оставлял на второй строке одно «код».
 * Из ровных разбивок берётся та, где первая строка не короче второй.
 */
function balancedLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = normalizeText(text).split(" ").filter(Boolean);
  const whole = words.join(" ");
  if (ctx.measureText(whole).width <= maxWidth || words.length < 2) return [ellipsize(ctx, whole, maxWidth)];
  // Разделитель на месте переноса («мастеров · / полный») не нужен ни в конце, ни в начале строки.
  const splits = words.slice(1).map((_, index) => {
    const lines = [
      words.slice(0, index + 1).join(" ").replace(/\s*[·—–]$/u, ""),
      words.slice(index + 1).join(" ").replace(/^[·—–]\s*/u, ""),
    ];
    const [first, second] = lines.map((line) => ctx.measureText(line).width);
    return { lines, widest: Math.max(first, second), topHeavy: first >= second };
  });
  const fitting = splits.filter((split) => split.widest <= maxWidth && split.lines.every(Boolean));
  const pool = fitting.some((split) => split.topHeavy) ? fitting.filter((split) => split.topHeavy) : fitting;
  const best = pool.sort((a, b) => a.widest - b.widest)[0];
  return best ? best.lines : wrapLines(ctx, whole, maxWidth, 2);
}

/**
 * Имя — самый крупный шрифт, который влезает в одну строку; не влезло и на
 * минимуме — две строки минимального размера.
 */
function layoutName(
  ctx: CanvasRenderingContext2D,
  family: string,
  name: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
): { size: number; lines: string[] } {
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = fontOf(family, size, { weight: 600 });
    if (ctx.measureText(name).width <= maxWidth) return { size, lines: [name] };
  }
  ctx.font = fontOf(family, minSize, { weight: 600 });
  return { size: minSize, lines: wrapLines(ctx, name, maxWidth, 2) };
}

function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  make: (size: number) => string,
): number {
  for (let size = maxSize; size > minSize; size -= 2) {
    ctx.font = make(size);
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return minSize;
}

/** Разрядка для прописной «брови»: `ctx.letterSpacing` есть не во всех Safari. */
function fillSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: "left" | "center",
): void {
  const chars = Array.from(text);
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + spacing * Math.max(0, chars.length - 1);
  let cursor = align === "center" ? x - total / 2 : x;
  const previous = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((char, index) => {
    ctx.fillText(char, cursor, y);
    cursor += widths[index] + spacing;
  });
  ctx.textAlign = previous;
}

function splitProfileUrl(profileUrl: string): { host: string; path: string } {
  try {
    const parsed = new URL(profileUrl);
    return { host: parsed.host.replace(/^www\./, ""), path: parsed.pathname.replace(/\/$/, "") };
  } catch {
    return { host: profileUrl.replace(/^https?:\/\//, ""), path: "" };
  }
}

// ─── Фигуры ───────────────────────────────────────────────────────────────

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fill();
}

function brandGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  // Та же форма, что у утилиты `bg-brand-gradient`: стопы 0 / 55% / 100%.
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, BRAND_COLORS.brandFrom);
  gradient.addColorStop(0.55, BRAND_COLORS.brandVia);
  gradient.addColorStop(1, BRAND_COLORS.brandDeep);
  return gradient;
}

function fillGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  alpha: number,
): void {
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  glow.addColorStop(0, withAlpha(color, alpha));
  glow.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

function strokeRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  width: number,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawPinIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(PIN_PATH));
  ctx.beginPath();
  ctx.arc(12, 10, 3, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Знак бренда — четыре полупрозрачных лепестка, светлая (тёмно-фоновая) версия. */
function drawLogoMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  const gradient = ctx.createLinearGradient(0, 0, 100, 100);
  gradient.addColorStop(0, BRAND_COLORS.logoMarkFixedFrom);
  gradient.addColorStop(0.5, BRAND_COLORS.logoMarkFixedVia);
  gradient.addColorStop(1, BRAND_COLORS.logoMarkFixedTo);
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.5;
  for (const petal of LOGO_MARK_PETALS) ctx.fill(new Path2D(petal));
  ctx.restore();
}

/** Знак + «МастерРядом», по центру `cx`. */
function drawWordmark(
  ctx: CanvasRenderingContext2D,
  family: string,
  cx: number,
  cy: number,
  textSize: number,
): void {
  const label = UI_TEXT.brand.name;
  const markSize = Math.round(textSize * 1.3);
  const gap = Math.round(textSize * 0.4);
  ctx.font = fontOf(family, textSize, { weight: 600 });
  const textWidth = ctx.measureText(label).width;
  const left = cx - (markSize + gap + textWidth) / 2;
  drawLogoMark(ctx, left, cy - markSize / 2, markSize);
  ctx.fillStyle = BRAND_COLORS.textOnBrand;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, left + markSize + gap, cy);
}

/**
 * Фото в круге: обрезка по центру до квадрата (раньше картинку растягивали
 * в круг, и неквадратное фото сплющивалось), без фото — инициалы на
 * бренд-подложке.
 */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  content: BusinessCardContent,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.closePath();
  ctx.clip();
  const img = content.avatar;
  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    ctx.fillStyle = BRAND_COLORS.surfaceCard;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = brandGradient(ctx, cx - radius, cy - radius, cx + radius, cy + radius);
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = BRAND_COLORS.textOnBrand;
    ctx.font = fontOf(content.fontFamily, radius * 0.78, { weight: 600 });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsOf(content.name), cx, cy + radius * 0.04);
  }
  ctx.restore();
}

/**
 * QR-код ровными модулями: края модулей округляются до целых пикселей,
 * поэтому между соседями нет светлых швов. «Глазки» — скруглённые, бордовые;
 * данные — почти чёрные. Контраст обоих к белому выше 10:1.
 */
function drawQr(
  ctx: CanvasRenderingContext2D,
  qr: QrMatrix | HTMLCanvasElement,
  x: number,
  y: number,
  size: number,
): void {
  const left = Math.round(x);
  const top = Math.round(y);
  if (!Array.isArray(qr)) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr as HTMLCanvasElement, left, top, size, size);
    ctx.restore();
    return;
  }
  const matrix = qr as QrMatrix;
  const count = matrix.length;
  const cell = size / count;
  const edge = (index: number) => Math.round(index * cell);

  ctx.fillStyle = BRAND_COLORS.textMain;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!matrix[row][col] || isFinderModule(count, row, col)) continue;
      ctx.fillRect(left + edge(col), top + edge(row), edge(col + 1) - edge(col), edge(row + 1) - edge(row));
    }
  }

  const eyes: Array<[number, number]> = [
    [0, 0],
    [0, count - 7],
    [count - 7, 0],
  ];
  for (const [row, col] of eyes) {
    const ex = left + edge(col);
    const ey = top + edge(row);
    const outer = edge(col + 7) - edge(col);
    ctx.fillStyle = BRAND_COLORS.brandFrom;
    fillRoundedRect(ctx, ex, ey, outer, outer, cell * 2);
    ctx.fillStyle = QR_WHITE;
    fillRoundedRect(ctx, ex + cell, ey + cell, outer - cell * 2, outer - cell * 2, cell * 1.3);
    ctx.fillStyle = BRAND_COLORS.brandFrom;
    fillRoundedRect(ctx, ex + cell * 2, ey + cell * 2, outer - cell * 4, outer - cell * 4, cell);
  }
}

/** Белая подложка QR с тенью; внутри — код с полем не меньше 4 модулей. */
function drawQrChip(
  ctx: CanvasRenderingContext2D,
  qr: QrMatrix | HTMLCanvasElement,
  x: number,
  y: number,
  size: number,
  radius: number,
  shadow: { color: string; blur: number; offsetY: number } | null,
): void {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetY = shadow.offsetY;
  }
  ctx.fillStyle = QR_WHITE;
  fillRoundedRect(ctx, x, y, size, size, radius);
  ctx.restore();
  const modules = Array.isArray(qr) ? qr.length : 29;
  // Поле — 4 модуля (требование стандарта к «тихой зоне»), но не меньше 10% стороны.
  const padding = Math.max(size * 0.1, (size * 4) / (modules + 8));
  const inner = size - padding * 2;
  drawQr(ctx, qr, x + padding, y + padding, inner);
}

// ─── Визитка для печати ──────────────────────────────────────────────────

export function renderPrintCard(ctx: CanvasRenderingContext2D, content: BusinessCardContent): void {
  const { width: W, height: H } = BUSINESS_CARD_SIZE.print;
  const F = content.fontFamily;
  const T = UI_TEXT.billing.publicPage.card;

  const PANEL_X = 1160;
  const PANEL_W = W - PANEL_X;
  const PANEL_CX = PANEL_X + PANEL_W / 2;
  const LEFT = 104;
  const RIGHT = PANEL_X - 88;

  // Бумага + тёплое свечение в углу.
  ctx.fillStyle = BRAND_COLORS.surfaceCard;
  ctx.fillRect(0, 0, W, H);
  fillGlow(ctx, 0, H, 760, BRAND_COLORS.brandAccent, 0.16);
  fillGlow(ctx, PANEL_X, 0, 520, BRAND_COLORS.brandFrom, 0.045);

  // Бордовая панель с QR.
  ctx.fillStyle = brandGradient(ctx, PANEL_X, 0, W, H);
  ctx.fillRect(PANEL_X, 0, PANEL_W, H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(PANEL_X, 0, PANEL_W, H);
  ctx.clip();
  fillGlow(ctx, PANEL_X + PANEL_W * 0.85, 60, 560, BRAND_COLORS.brandVia, 0.7);
  fillGlow(ctx, PANEL_X, H, 520, BRAND_COLORS.brandPane, 0.55);
  strokeRing(ctx, W + 30, H + 40, 330, withAlpha(BRAND_COLORS.textOnBrand, 0.08), 2);
  strokeRing(ctx, W + 30, H + 40, 440, withAlpha(BRAND_COLORS.textOnBrand, 0.05), 2);
  ctx.restore();
  // Песочная кромка на стыке — фирменный тонкий акцент.
  ctx.fillStyle = BRAND_COLORS.brandAccent;
  ctx.fillRect(PANEL_X, 0, 4, H);

  ctx.fillStyle = withAlpha(BRAND_COLORS.textOnBrand, 0.78);
  ctx.font = fontOf(F, 26, { weight: 600 });
  ctx.textBaseline = "middle";
  fillSpacedText(ctx, T.bookOnline.toLocaleUpperCase("ru-RU"), PANEL_CX, 140, 6, "center");

  const CHIP = 420;
  drawQrChip(ctx, content.qr, PANEL_CX - CHIP / 2, 210, CHIP, 40, {
    color: withAlpha(BRAND_COLORS.brandDeep, 0.55),
    blur: 48,
    offsetY: 18,
  });

  ctx.fillStyle = withAlpha(BRAND_COLORS.textOnBrand, 0.9);
  ctx.font = fontOf(F, 34, { italic: true });
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(T.scanHint, PANEL_CX, 700);

  drawWordmark(ctx, F, PANEL_CX, 890, 38);

  // Левая колонка: шапка (фото + имя + специализация), детали, адрес страницы.
  const AVATAR_R = 118;
  const TEXT_X = LEFT + AVATAR_R * 2 + 52;
  const TEXT_W = RIGHT - TEXT_X;
  const name = normalizeText(content.name);
  const tagline = normalizeTagline(content.tagline);
  const address = normalizeText(content.address);
  const bio = normalizeText(content.bio);

  const nameLayout = layoutName(ctx, F, name, TEXT_W, 76, 54);
  const nameLineH = nameLayout.size * 1.14;
  const TAGLINE_SIZE = 40;
  const TAGLINE_LH = TAGLINE_SIZE * 1.3;
  ctx.font = fontOf(F, TAGLINE_SIZE, { italic: true });
  const taglineLines = tagline ? balancedLines(ctx, tagline, TEXT_W) : [];
  const nameBlockH =
    nameLineH * nameLayout.lines.length + (taglineLines.length ? 16 + TAGLINE_LH * taglineLines.length : 0);
  const headerH = Math.max(AVATAR_R * 2, nameBlockH);

  ctx.font = fontOf(F, 29);
  const bioLines = bio ? wrapLines(ctx, bio, RIGHT - LEFT, 2) : [];
  const BIO_LH = 44;
  const ADDRESS_H = 44;
  const hasDetails = Boolean(address) || bioLines.length > 0;
  const detailsH = hasDetails
    ? 56 + 3 + 40 + (address ? ADDRESS_H : 0) + (address && bioLines.length ? 22 : 0) + bioLines.length * BIO_LH
    : 0;

  const REGION_TOP = 92;
  const REGION_BOTTOM = 812;
  let y = REGION_TOP + Math.max(0, (REGION_BOTTOM - REGION_TOP - headerH - detailsH) / 2);

  const headerCY = y + headerH / 2;
  // Тонкое песочное кольцо вокруг фото.
  strokeRing(ctx, LEFT + AVATAR_R, headerCY, AVATAR_R + 12, BRAND_COLORS.brandAccent, 3);
  ctx.save();
  ctx.shadowColor = withAlpha(BRAND_COLORS.brandFrom, 0.18);
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.beginPath();
  ctx.arc(LEFT + AVATAR_R, headerCY, AVATAR_R, 0, TAU);
  ctx.fillStyle = BRAND_COLORS.surfaceCard;
  ctx.fill();
  ctx.restore();
  drawAvatar(ctx, content, LEFT + AVATAR_R, headerCY, AVATAR_R);

  let textY = headerCY - nameBlockH / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = BRAND_COLORS.textMain;
  ctx.font = fontOf(F, nameLayout.size, { weight: 600 });
  for (const line of nameLayout.lines) {
    ctx.fillText(line, TEXT_X, textY + nameLineH / 2);
    textY += nameLineH;
  }
  if (taglineLines.length) {
    textY += 16;
    ctx.fillStyle = BRAND_COLORS.brandFrom;
    ctx.font = fontOf(F, TAGLINE_SIZE, { italic: true });
    for (const line of taglineLines) {
      ctx.fillText(line, TEXT_X, textY + TAGLINE_LH / 2);
      textY += TAGLINE_LH;
    }
  }

  y += headerH;
  if (hasDetails) {
    y += 56;
    ctx.fillStyle = BRAND_COLORS.brandAccent;
    ctx.fillRect(LEFT, y, 96, 3);
    y += 3 + 40;
    if (address) {
      const ICON = 34;
      drawPinIcon(ctx, LEFT, y + ADDRESS_H / 2 - ICON / 2, ICON, BRAND_COLORS.brandFrom);
      ctx.fillStyle = BRAND_COLORS.textLabel;
      ctx.font = fontOf(F, 32);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const ADDRESS_X = LEFT + ICON + 18;
      ctx.fillText(ellipsize(ctx, address, RIGHT - ADDRESS_X), ADDRESS_X, y + ADDRESS_H / 2);
      y += ADDRESS_H + (bioLines.length ? 22 : 0);
    }
    ctx.fillStyle = BRAND_COLORS.textSecondary;
    ctx.font = fontOf(F, 29);
    for (const line of bioLines) {
      ctx.fillText(line, LEFT, y + BIO_LH / 2);
      y += BIO_LH;
    }
  }

  // Адрес страницы — внизу слева: домен спокойным, путь — бордовым.
  const { host, path } = splitProfileUrl(content.profileUrl);
  const URL_Y = 900;
  const urlSize = fitSize(ctx, `${host}${path}`, RIGHT - LEFT, 36, 24, (s) => fontOf(F, s, { weight: 600 }));
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = fontOf(F, urlSize);
  ctx.fillStyle = BRAND_COLORS.textLabel;
  ctx.fillText(host, LEFT, URL_Y);
  const hostW = ctx.measureText(host).width;
  ctx.font = fontOf(F, urlSize, { weight: 600 });
  ctx.fillStyle = BRAND_COLORS.brandFrom;
  ctx.fillText(ellipsize(ctx, path, RIGHT - LEFT - hostW), LEFT + hostW, URL_Y);
}

// ─── Сторис ───────────────────────────────────────────────────────────────

export function renderStoryCard(ctx: CanvasRenderingContext2D, content: BusinessCardContent): void {
  const { width: W, height: H } = BUSINESS_CARD_SIZE.story;
  const F = content.fontFamily;
  const T = UI_TEXT.billing.publicPage.card;
  const CX = W / 2;

  // Фон: бренд-градиент, свечения и тонкие кольца вокруг фото.
  ctx.fillStyle = brandGradient(ctx, 0, 0, W, H);
  ctx.fillRect(0, 0, W, H);
  fillGlow(ctx, W * 0.9, 220, 760, BRAND_COLORS.brandVia, 0.75);
  fillGlow(ctx, 0, H * 0.82, 900, BRAND_COLORS.brandPane, 0.7);

  const AVATAR_CY = 520;
  const AVATAR_R = 176;
  fillGlow(ctx, CX, AVATAR_CY, 460, BRAND_COLORS.brandAccent, 0.16);
  strokeRing(ctx, CX, AVATAR_CY, 290, withAlpha(BRAND_COLORS.textOnBrand, 0.09), 2);
  strokeRing(ctx, CX, AVATAR_CY, 380, withAlpha(BRAND_COLORS.textOnBrand, 0.06), 2);
  strokeRing(ctx, CX, AVATAR_CY, 480, withAlpha(BRAND_COLORS.textOnBrand, 0.04), 2);

  drawWordmark(ctx, F, CX, 196, 40);

  strokeRing(ctx, CX, AVATAR_CY, AVATAR_R + 16, BRAND_COLORS.brandAccent, 4);
  ctx.save();
  ctx.shadowColor = withAlpha(BRAND_COLORS.brandDeep, 0.6);
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.beginPath();
  ctx.arc(CX, AVATAR_CY, AVATAR_R, 0, TAU);
  ctx.fillStyle = BRAND_COLORS.brandDeep;
  ctx.fill();
  ctx.restore();
  drawAvatar(ctx, content, CX, AVATAR_CY, AVATAR_R);

  // Карточка с QR — снизу, над зоной интерфейса сторис.
  const CARD_X = 72;
  const CARD_W = W - CARD_X * 2;
  const CARD_H = 460;
  const CARD_Y = 1720 - CARD_H;

  // Текстовый блок между фото и карточкой; не влезает — сначала теряет строки описания.
  const TEXT_TOP = AVATAR_CY + AVATAR_R + 70;
  const TEXT_BOTTOM = CARD_Y - 56;
  const TEXT_W = W - 160;
  const name = normalizeText(content.name);
  const tagline = normalizeTagline(content.tagline);
  const address = normalizeText(content.address);
  const bio = normalizeText(content.bio);

  const nameLayout = layoutName(ctx, F, name, TEXT_W, 88, 62);
  const nameLineH = nameLayout.size * 1.12;
  const TAGLINE_SIZE = 50;
  const TAGLINE_LH = TAGLINE_SIZE * 1.3;
  const ADDRESS_SIZE = 36;
  const BIO_SIZE = 34;
  const BIO_LH = 48;
  ctx.font = fontOf(F, TAGLINE_SIZE, { italic: true });
  const taglineLines = tagline ? balancedLines(ctx, tagline, TEXT_W) : [];
  ctx.font = fontOf(F, BIO_SIZE);
  let bioLines = bio ? wrapLines(ctx, bio, TEXT_W, 3) : [];

  const measure = (bioCount: number) =>
    nameLineH * nameLayout.lines.length +
    (taglineLines.length ? 12 + TAGLINE_LH * taglineLines.length : 0) +
    (address || bioCount ? 34 + 3 + 34 : 0) +
    (address ? ADDRESS_SIZE * 1.4 : 0) +
    (address && bioCount ? 14 : 0) +
    bioCount * BIO_LH;
  while (bioLines.length > 0 && measure(bioLines.length) > TEXT_BOTTOM - TEXT_TOP) {
    ctx.font = fontOf(F, BIO_SIZE);
    bioLines = wrapLines(ctx, bio, TEXT_W, bioLines.length - 1);
  }
  const blockH = measure(bioLines.length);
  let y = TEXT_TOP + Math.max(0, (TEXT_BOTTOM - TEXT_TOP - blockH) / 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = BRAND_COLORS.textOnBrand;
  ctx.font = fontOf(F, nameLayout.size, { weight: 600 });
  for (const line of nameLayout.lines) {
    ctx.fillText(line, CX, y + nameLineH / 2);
    y += nameLineH;
  }
  if (taglineLines.length) {
    y += 12;
    ctx.fillStyle = BRAND_COLORS.brandAccent;
    ctx.font = fontOf(F, TAGLINE_SIZE, { italic: true });
    for (const line of taglineLines) {
      ctx.fillText(line, CX, y + TAGLINE_LH / 2);
      y += TAGLINE_LH;
    }
  }
  if (address || bioLines.length) {
    y += 34;
    ctx.fillStyle = BRAND_COLORS.brandAccent;
    ctx.fillRect(CX - 48, y, 96, 3);
    y += 3 + 34;
  }
  if (address) {
    const ICON = 38;
    const GAP = 14;
    ctx.font = fontOf(F, ADDRESS_SIZE);
    const text = ellipsize(ctx, address, TEXT_W - ICON - GAP);
    const rowW = ICON + GAP + ctx.measureText(text).width;
    const rowLeft = CX - rowW / 2;
    const rowCY = y + (ADDRESS_SIZE * 1.4) / 2;
    drawPinIcon(ctx, rowLeft, rowCY - ICON / 2, ICON, BRAND_COLORS.brandAccent);
    ctx.fillStyle = withAlpha(BRAND_COLORS.textOnBrand, 0.88);
    ctx.textAlign = "left";
    ctx.fillText(text, rowLeft + ICON + GAP, rowCY);
    ctx.textAlign = "center";
    y += ADDRESS_SIZE * 1.4 + (bioLines.length ? 14 : 0);
  }
  ctx.fillStyle = withAlpha(BRAND_COLORS.textOnBrand, 0.72);
  ctx.font = fontOf(F, BIO_SIZE);
  for (const line of bioLines) {
    ctx.fillText(line, CX, y + BIO_LH / 2);
    y += BIO_LH;
  }

  // Кремовая карточка: QR слева, призыв и адрес страницы справа.
  ctx.save();
  ctx.shadowColor = withAlpha(BRAND_COLORS.brandDeep, 0.55);
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 26;
  ctx.fillStyle = BRAND_COLORS.surfaceCard;
  fillRoundedRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 48);
  ctx.restore();

  const PAD = 40;
  const CHIP = CARD_H - PAD * 2;
  drawQrChip(ctx, content.qr, CARD_X + PAD, CARD_Y + PAD, CHIP, 28, null);
  // Тонкая рамка вокруг кода — белое на креме иначе теряет край.
  ctx.strokeStyle = BRAND_COLORS.borderSubtle;
  ctx.lineWidth = 2;
  roundedRectPath(ctx, CARD_X + PAD, CARD_Y + PAD, CHIP, CHIP, 28);
  ctx.stroke();

  const COL_X = CARD_X + PAD + CHIP + 44;
  const COL_W = CARD_X + CARD_W - PAD - COL_X;
  const { host, path } = splitProfileUrl(content.profileUrl);

  ctx.font = fontOf(F, 44, { weight: 600 });
  const titleLines = balancedLines(ctx, T.storyTitle, COL_W);
  const TITLE_LH = 54;
  const pathSize = fitSize(ctx, path, COL_W, 38, 22, (s) => fontOf(F, s, { weight: 600 }));
  const colH = 30 + 22 + titleLines.length * TITLE_LH + 34 + 40 + 6 + pathSize * 1.3;
  let cy = CARD_Y + (CARD_H - colH) / 2;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = BRAND_COLORS.brandFrom;
  ctx.font = fontOf(F, 23, { weight: 600 });
  fillSpacedText(ctx, T.bookOnline.toLocaleUpperCase("ru-RU"), COL_X, cy + 15, 5, "left");
  cy += 30 + 22;

  ctx.fillStyle = BRAND_COLORS.textMain;
  ctx.font = fontOf(F, 44, { weight: 600 });
  for (const line of titleLines) {
    ctx.fillText(line, COL_X, cy + TITLE_LH / 2);
    cy += TITLE_LH;
  }
  cy += 34;

  ctx.fillStyle = BRAND_COLORS.textSecondary;
  ctx.font = fontOf(F, 30);
  ctx.fillText(ellipsize(ctx, host, COL_W), COL_X, cy + 20);
  cy += 40 + 6;

  ctx.fillStyle = BRAND_COLORS.brandFrom;
  ctx.font = fontOf(F, pathSize, { weight: 600 });
  ctx.fillText(ellipsize(ctx, path, COL_W), COL_X, cy + (pathSize * 1.3) / 2);
}

// ─── Отдельный QR-код («Скачать QR») ──────────────────────────────────────

/** QR на белом поле в 4 модуля: печатается и сканируется без обрезки. */
export function renderQrImage(ctx: CanvasRenderingContext2D, qr: QrMatrix | HTMLCanvasElement, size: number) {
  ctx.fillStyle = QR_WHITE;
  ctx.fillRect(0, 0, size, size);
  const modules = Array.isArray(qr) ? qr.length : 29;
  const padding = (size * 4) / (modules + 8);
  drawQr(ctx, qr, padding, padding, size - padding * 2);
}

export function renderBusinessCard(format: BusinessCardFormat, content: BusinessCardContent): HTMLCanvasElement {
  const { width, height } = BUSINESS_CARD_SIZE[format];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  if (format === "print") renderPrintCard(ctx, content);
  else renderStoryCard(ctx, content);
  return canvas;
}
