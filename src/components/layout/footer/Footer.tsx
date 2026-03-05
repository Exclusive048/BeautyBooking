import fs from "node:fs";
import path from "node:path";
import { FooterCTA } from "@/components/layout/footer/FooterCTA";
import { FooterColumn, type FooterLinkItem } from "@/components/layout/footer/FooterColumn";
import { FooterCopyright } from "@/components/layout/footer/FooterCopyright";
import { FooterSocials } from "@/components/layout/footer/FooterSocials";

const APP_ROOT = path.join(process.cwd(), "src", "app");

function hasPage(route: string): boolean {
  const normalized = route.replace(/^\/+/, "");
  const pageDir = path.join(APP_ROOT, normalized);
  return (
    fs.existsSync(path.join(pageDir, "page.tsx")) ||
    fs.existsSync(path.join(pageDir, "page.ts"))
  );
}

function buildFooterLinks() {
  const showBlog = hasPage("blog");
  const showCareers = hasPage("careers");
  const showGiftCards = hasPage("gift-cards");
  const hasSupportPage = hasPage("support");

  const about: FooterLinkItem[] = [
    { label: "О нас", href: "/about" },
    { label: "Как это работает", href: "/how-it-works" },
    ...(showBlog ? [{ label: "Блог", href: "/blog" }] : []),
    { label: "Партнёрам", href: "/partners" },
    ...(showCareers ? [{ label: "Вакансии", href: "/careers" }] : []),
  ];

  const clients: FooterLinkItem[] = [
    { label: "Как забронировать", href: "/how-to-book" },
    { label: "Популярные услуги", href: "/catalog?sort=popular" },
    { label: "Мастера рядом", href: "/catalog?available=today" },
    { label: "Предложения для моделей", href: "/models" },
    ...(showGiftCards ? [{ label: "Подарочные сертификаты", href: "/gift-cards" }] : []),
  ];

  const masters: FooterLinkItem[] = [
    { label: "Стать мастером", href: "/become-master" },
    { label: "Тарифы", href: "/pricing" },
    { label: "База знаний", href: "/help/masters" },
    { label: "Партнёрская программа", href: "/partners" },
  ];

  const support: FooterLinkItem[] = [
    { label: "FAQ", href: "/faq" },
    hasSupportPage
      ? { label: "Написать нам", href: "/support" }
      : { label: "Написать нам", href: "mailto:support@МастерРядом.ru", external: true },
    { label: "Telegram поддержка", href: "https://t.me/МастерРядом_support", external: true },
    { label: "Пользовательское соглашение", href: "/terms" },
    { label: "Политика конфиденциальности", href: "/privacy" },
  ];

  return { about, clients, masters, support };
}

export function Footer() {
  const { about, clients, masters, support } = buildFooterLinks();

  return (
    <footer
      role="contentinfo"
      className="bg-bg-page text-text-main"
      itemScope
      itemType="https://schema.org/WPFooter"
    >
      <div className="mx-auto max-w-[1280px] space-y-8 px-4 py-12 md:py-16">
        <FooterCTA />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,3fr)]">
          <div className="space-y-4">
            <div className="text-[18px] font-semibold" itemScope itemType="https://schema.org/Organization">
              <span itemProp="name">МастерРядом</span>
            </div>
            <p className="text-sm text-text-sec">
              Маркетплейс мастеров красоты. Находите лучших специалистов рядом и бронируйте
              услуги онлайн за пару минут.
            </p>
            <FooterSocials />
          </div>

          <nav aria-label="Навигация футера">
            <div className="grid gap-8 md:grid-cols-2 md:gap-12 lg:grid-cols-4">
              <FooterColumn title="О платформе" links={about} />
              <FooterColumn title="Для клиентов" links={clients} />
              <FooterColumn title="Для мастеров" links={masters} />
              <FooterColumn title="Поддержка" links={support} />
            </div>
          </nav>
        </div>

        <div className="border-t border-border-subtle pt-6">
          <FooterCopyright />
        </div>
      </div>
    </footer>
  );
}

