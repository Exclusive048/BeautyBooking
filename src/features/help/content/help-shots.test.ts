import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAQ_DATA as CLIENT_FAQ } from "@/features/client-cabinet/faq/faq-data";
import { FAQ_DATA as PUBLIC_FAQ } from "@/features/faq/content/faq-content";
import { MASTER_HELP, STUDIO_HELP } from "./help-content";
import type { HelpShot } from "./help-types";

/**
 * HELP-GUIDE-01 — снимки экрана справки и файлы в `public/help/` сходятся в обе
 * стороны: ссылка на несуществующий снимок даёт битое превью, а файл без ссылки —
 * мёртвый вес в репозитории (снимки переснимает `.qa/help-screenshots.spec.ts`).
 *
 * @probe 2026-10-14: `shot("client-bookingz", …)` в FAQ кабинета → падает
 *   «missing: client-bookingz.webp»; удалённая ссылка на `client-favorites`
 *   в /faq → падает «orphan: client-favorites.webp»; пустая подпись → падает
 *   третий тест.
 */

const HELP_DIR = path.join(process.cwd(), "public", "help");

function referencedShots(): HelpShot[] {
  const fromHelp = [...MASTER_HELP, ...STUDIO_HELP].flatMap((category) =>
    category.questions.flatMap((question) => question.shots ?? []),
  );
  const fromPublicFaq = PUBLIC_FAQ.flatMap((category) =>
    category.questions.flatMap((question) => question.shots ?? []),
  );
  const fromClientFaq = CLIENT_FAQ.flatMap((item) => item.shots ?? []);
  return [...fromHelp, ...fromPublicFaq, ...fromClientFaq];
}

describe("help screenshots", () => {
  const referenced = new Set(referencedShots().map((item) => path.posix.basename(item.src)));
  const onDisk = new Set(readdirSync(HELP_DIR).filter((name) => name.endsWith(".webp")));

  it("every referenced screenshot exists in public/help", () => {
    const missing = [...referenced].filter((name) => !onDisk.has(name));
    expect(missing.map((name) => `missing: ${name}`)).toEqual([]);
  });

  it("every screenshot in public/help is referenced", () => {
    const orphans = [...onDisk].filter((name) => !referenced.has(name));
    expect(orphans.map((name) => `orphan: ${name}`)).toEqual([]);
  });

  it("every screenshot has a caption", () => {
    const blank = referencedShots().filter((item) => item.caption.trim() === "");
    expect(blank).toEqual([]);
  });
});
