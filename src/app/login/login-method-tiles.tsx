"use client";

import type { MouseEvent, ReactNode } from "react";
import { Loader2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRESS } from "@/components/ui/motion-classes";
import { VkIcon } from "@/components/ui/vk-icon";
import { cn } from "@/lib/cn";

/**
 * LOGIN-TILES-01 (макет владельца 2026-10-03) — способы входа плитками.
 *
 * Плитка VK ID / Яндекс ID — ссылка на `/api/auth/{vk,yandex}/start`: обычный `<a>`, не
 * `next/link` (FIX-24 — старт отвечает 302 на чужой домен, префетч и
 * клиентский переход его не переживут). Плитка почты и телефона — кнопка,
 * раскрывающая панель ввода под рядом плиток; выбранная получает стрелку к
 * панели (`.login-tile-pointer`, `globals.css`).
 *
 * Знаки VK ID и Яндекс ID — в фирменных цветах и не перекрашиваются темой:
 * это чужие марки, а не палитра продукта (как и прежние кнопки входа).
 */

export type OAuthProvider = "vk" | "yandex";
export type OtpChannel = "email" | "phone";

const TILE =
  "group relative flex h-[92px] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-border-subtle bg-bg-card px-1 text-sm font-semibold text-text-main shadow-card transition-[transform,border-color,background-color,box-shadow] duration-200 ease-brand hover:border-primary-magenta/40";

const TILE_SELECTED =
  "login-tile-pointer border-primary-magenta bg-primary-magenta/10 ring-4 ring-primary-magenta/15 hover:border-primary-magenta";

const MARK =
  "flex h-[34px] w-[34px] shrink-0 items-center justify-center transition-transform duration-200 ease-brand group-hover:-translate-y-0.5 group-hover:scale-105 motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:scale-100";

/** «Я» Яндекс ID; `viewBox` обрезан по контуру буквы, чтобы она стояла по центру круга. */
function YandexGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="1.05 0 12.6 24" fill="currentColor" aria-hidden="true">
      <path d="M9.49 0C4.476 0 1.05 3.426 1.05 8.44c0 3.55 1.736 6.293 4.764 7.795L1.05 24h3.74l4.36-7.34h1.32V24h3.18V0H9.49zm.16 13.84h-.66c-2.49 0-3.74-1.42-3.74-5.4 0-4.14 1.42-5.46 3.74-5.46h.66v10.86z" />
    </svg>
  );
}

function Spinner() {
  return <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />;
}

function ProviderMark({ provider, pending }: { provider: OAuthProvider; pending: boolean }) {
  if (provider === "vk") {
    return (
      <span className={cn(MARK, "rounded-xl bg-[#0077FF] text-white")} aria-hidden>
        {pending ? <Spinner /> : <VkIcon className="h-[22px] w-[22px]" />}
      </span>
    );
  }
  return (
    <span className={cn(MARK, "rounded-full bg-[#FC3F1D] text-white")} aria-hidden>
      {pending ? <Spinner /> : <YandexGlyph className="h-4 w-auto" />}
    </span>
  );
}

export function OAuthTile({
  provider,
  href,
  label,
  pending,
  onClick,
  testId,
}: {
  provider: OAuthProvider;
  href: string;
  label: string;
  /** Браузер уже уходит к провайдеру: спиннер вместо знака, повторный клик гасится. */
  pending: boolean;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  testId: string;
}) {
  return (
    <Button
      asChild
      variant="wrapper"
      className={cn(TILE, PRESS, pending && "pointer-events-none")}
    >
      <a href={href} onClick={onClick} aria-disabled={pending || undefined} aria-busy={pending || undefined} data-testid={testId}>
        <ProviderMark provider={provider} pending={pending} />
        {label}
      </a>
    </Button>
  );
}

const CHANNEL_ICON: Record<OtpChannel, ReactNode> = {
  email: <Mail className="h-[18px] w-[18px]" aria-hidden />,
  phone: <Phone className="h-[18px] w-[18px]" aria-hidden />,
};

export function ChannelTile({
  channel,
  label,
  selected,
  panelId,
  onClick,
  testId,
}: {
  channel: OtpChannel;
  label: string;
  selected: boolean;
  panelId: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <Button
      variant="wrapper"
      onClick={onClick}
      aria-expanded={selected}
      aria-controls={panelId}
      data-testid={testId}
      className={cn(TILE, PRESS, selected && TILE_SELECTED)}
    >
      <span className={cn(MARK, "rounded-lg bg-primary-magenta/15 text-accent-text")} aria-hidden>
        {CHANNEL_ICON[channel]}
      </span>
      {label}
    </Button>
  );
}

/** Сетка под число плиток; при четырёх почта и телефон — нижний ряд (стрелка к панели не упирается в плитку). */
export function tileGridColumns(count: number): string {
  if (count >= 4) return "grid-cols-2 sm:grid-cols-4";
  if (count === 3) return "grid-cols-3";
  if (count === 2) return "grid-cols-2";
  return "grid-cols-1";
}
