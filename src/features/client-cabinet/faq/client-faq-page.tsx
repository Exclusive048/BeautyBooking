"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, FileText, LifeBuoy, Mail, MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FAQAccordionItem } from "@/components/ui/faq-accordion";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UI_TEXT } from "@/lib/ui/text";
import { FAQ_DATA, type FaqCategory } from "./faq-data";

const T = UI_TEXT.clientCabinet.faq;

type CategoryOption = "all" | FaqCategory;

const CATEGORY_OPTIONS: Array<{ value: CategoryOption; label: string }> = [
  { value: "all", label: T.categoryAll },
  { value: "bookings", label: T.categoryBookings },
  { value: "payment", label: T.categoryPayment },
  { value: "reviews", label: T.categoryReviews },
  { value: "account", label: T.categoryAccount },
];

export function ClientFaqPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryOption>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ_DATA.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!q) return true;
      return (
        item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-text-main lg:text-4xl">
          {T.title}
        </h1>
        <p className="mt-1 text-sm text-text-sec">{T.subtitle}</p>
      </header>

      <Card className="relative overflow-hidden bg-brand-gradient p-6 text-white sm:p-8">
        <div
          aria-hidden
          className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">
            {T.heroEyebrow}
          </div>
          <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">
            {T.heroTitle}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-white/85">
            {T.heroDescription}
          </p>
          <div className="relative mt-5">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={T.searchPlaceholder}
              className="!h-12 !rounded-2xl !border-white/20 !bg-white/15 pl-11 text-white placeholder:text-white/60"
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.map((opt) => {
              const active = opt.value === category;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCategory(opt.value)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-primary text-white"
                      : "bg-bg-input text-text-sec hover:bg-bg-input/70 hover:text-text-main"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <Card className="p-6 text-center text-sm text-text-sec">
              {T.emptySearch}
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <FAQAccordionItem
                  key={item.id}
                  item={{ q: item.q, a: item.a }}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          {/*
            «Перейти к поддержке» card is intentionally first — primary CTA
            ahead of self-service contacts. Strictly NOT a chat card and
            NOT a tickets list per product decision; it just deep-links to
            the existing public /support workflow page.
          */}
          <Card className="p-5">
            <div className="font-display text-base text-text-main">
              {T.supportLinkTitle}
            </div>
            <p className="mt-1 text-sm text-text-sec">
              {T.supportLinkDescription}
            </p>
            <Link href="/support" className="mt-3 block">
              <Button variant="primary" size="sm" className="w-full">
                <LifeBuoy className="mr-1.5 h-4 w-4" aria-hidden />
                {T.supportLinkCta}
              </Button>
            </Link>
          </Card>

          <Card className="p-4">
            <div className="mb-2 font-display text-base text-text-main">
              {T.contactsTitle}
            </div>
            <p className="mb-3 text-sm text-text-sec">{T.contactsDescription}</p>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="mailto:support@masterryadom.online"
                  className="inline-flex items-center gap-2 text-text-main hover:text-primary"
                >
                  <Mail className="h-4 w-4 text-text-sec" aria-hidden />
                  support@masterryadom.online
                </a>
              </li>
              <li>
                <a
                  href="tel:+78001112233"
                  className="inline-flex items-center gap-2 text-text-main hover:text-primary"
                >
                  <Phone className="h-4 w-4 text-text-sec" aria-hidden />
                  8 800 111 22 33
                </a>
              </li>
              <li>
                <a
                  href="https://t.me/masterryadom"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-text-main hover:text-primary"
                >
                  <MessageSquare className="h-4 w-4 text-text-sec" aria-hidden />
                  Telegram
                </a>
              </li>
            </ul>
          </Card>

          <Card className="p-4">
            <div className="mb-2 font-display text-base text-text-main">
              {T.docsTitle}
            </div>
            <ul className="space-y-1.5 text-sm">
              <li>
                <a
                  href="/terms"
                  className="inline-flex items-center gap-2 text-text-main hover:text-primary"
                >
                  <FileText className="h-3.5 w-3.5 text-text-sec" aria-hidden />
                  {T.docsTerms}
                </a>
              </li>
              <li>
                <a
                  href="/privacy"
                  className="inline-flex items-center gap-2 text-text-main hover:text-primary"
                >
                  <FileText className="h-3.5 w-3.5 text-text-sec" aria-hidden />
                  {T.docsPrivacy}
                </a>
              </li>
              <li>
                <a
                  href="/faq"
                  className="inline-flex items-center gap-2 text-text-main hover:text-primary"
                >
                  <FileText className="h-3.5 w-3.5 text-text-sec" aria-hidden />
                  {T.docsCancellation}
                </a>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
