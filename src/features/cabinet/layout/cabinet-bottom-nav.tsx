"use client";

import { usePathname } from "next/navigation";
import { Calendar, Heart, Send, User, Star } from "lucide-react";
import { BottomTab, BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * NAV-ATTENTION-01 — что ждёт действия клиента: перенос, предложенный мастером
 * (записи), непрочитанные сообщения мастеров, визиты, по которым можно
 * оставить отзыв. Считает `getClientSidebarCounts`.
 */
export type ClientNavAttention = {
  bookings: number;
  messages: number;
  reviews: number;
};

const TABS: Array<{
  label: string;
  href: string;
  icon: typeof Calendar;
  attentionKey?: keyof ClientNavAttention;
}> = [
  { label: UI_TEXT.clientCabinet.nav.bookings, href: "/cabinet/bookings", icon: Calendar, attentionKey: "bookings" },
  { label: UI_TEXT.clientCabinet.nav.messages, href: "/cabinet/messages", icon: Send, attentionKey: "messages" },
  { label: UI_TEXT.clientCabinet.nav.favorites, href: "/cabinet/favorites", icon: Heart },
  { label: UI_TEXT.clientCabinet.nav.reviews, href: "/cabinet/reviews", icon: Star, attentionKey: "reviews" },
  { label: UI_TEXT.clientCabinet.nav.profile, href: "/cabinet/profile", icon: User },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Нижняя навигация кабинета клиента. Разметка панели — общая
 * (`BottomTabBar`, NAV-ALIGN-01), здесь только набор вкладок.
 *
 * Зазора в потоке здесь нет намеренно: шелл кабинета — флекс В РЯД, спейсер
 * стал бы нулевым по ширине элементом рядом с `<main>` и ничего не добавил бы
 * снизу. Зазор под панелью (FIX-07, QA-119) держит `pb-` у `<main>` в
 * `cabinet-layout.tsx`.
 */
export function CabinetBottomNav({ attention }: { attention?: ClientNavAttention }) {
  const pathname = usePathname() ?? "/";

  return (
    <BottomTabBar ariaLabel={UI_TEXT.a11y.cabinetSections}>
      {TABS.map(({ label, href, icon, attentionKey }) => (
        <BottomTab
          key={href}
          href={href}
          icon={icon}
          label={label}
          active={isActive(pathname, href)}
          badge={attentionKey && attention ? attention[attentionKey] : 0}
        />
      ))}
    </BottomTabBar>
  );
}
