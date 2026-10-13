/**
 * SOCIAL-TG-MAX — единственный источник знака Telegram (бумажный самолётик) на
 * `currentColor`: ссылка на канал в публичных профилях и ссылка на канал
 * проекта в футере. До этого путь жил одной копией в футере, и вторая
 * поверхность сделала бы его дублем (урок FIX-VK-GLYPH: три копии знака ВК
 * разъехались по форме).
 *
 * Размер приходит только снаружи — как у `VkIcon`. Круглый логотип кнопки
 * входа через Telegram (`auth/telegram-login-button.tsx`) — другой знак:
 * фирменный круг для плитки входа, а не монохромная иконка ссылки.
 */

type IconProps = { className?: string };

const TELEGRAM_GLYPH_PATH =
  "M21.3 4.6c.3-.1.6.1.6.4 0 .1 0 .2-.1.3l-3.2 15.2c-.1.4-.5.6-.9.4l-4.5-3.4-2.4 2.3c-.3.3-.8.1-.8-.3v-3.9l8.4-7.6c.2-.2 0-.5-.3-.4l-10.4 6.2-4.2-1.4c-.4-.1-.4-.6 0-.8Z";

export function TelegramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d={TELEGRAM_GLYPH_PATH} />
    </svg>
  );
}
