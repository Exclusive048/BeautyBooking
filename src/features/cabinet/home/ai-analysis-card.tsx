"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { useToast } from "@/components/ui/toast";
import type { CabinetAnalysis, CabinetScope } from "@/lib/cabinet-insights/types";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { HomeSection } from "./home-section";

const T = UI_TEXT.cabinetHome.aiAnalysis;

type Props = {
  scope: CabinetScope;
  /** Тариф кабинета включает разбор (PREMIUM). */
  allowed: boolean;
  /** Последний разбор из кэша — показывается без нового вызова модели. */
  initialAnalysis: CabinetAnalysis | null;
  billingHref: string;
  /** Пояс кабинета (salon-tz): в нём подписана дата разбора. */
  timeZone: string;
};

/**
 * ИИ-разбор кабинета на главной (AI-CABINET-ANALYSIS, PREMIUM). Карточку
 * рендерят только при включённом ИИ; без тарифа — замок и ссылка на тарифы.
 * Запуск — `POST /api/cabinet/ai-analysis`: роут проверяет доступ, тариф и
 * лимит (три запуска в сутки на кабинет) и отдаёт готовый разбор, ссылки в
 * котором — только разделы кабинета (`lib/cabinet-insights/links.ts`).
 */
export function AiAnalysisCard({ scope, allowed, initialAnalysis, billingHref, timeZone }: Props) {
  const toast = useToast();
  const [analysis, setAnalysis] = useState<CabinetAnalysis | null>(initialAnalysis);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);

  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      const data = await fetchJsonWithAuth<{ analysis: CabinetAnalysis }>("/api/cabinet/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      setAnalysis(data.analysis);
      setOpen(true);
    } catch (error) {
      // Лимит запусков, суточный потолок ИИ, тариф — у сервера своя, действенная строка.
      toast.error(serverMessageOr(error, T.failed));
    } finally {
      setRunning(false);
    }
  };

  return (
    <HomeSection
      id="ai-analysis"
      testId="cabinet-home-ai-analysis"
      title={T.title}
      subtitle={T.lead}
      aside={<Badge size="xs">{T.badge}</Badge>}
    >
      {!allowed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-page p-3">
          <p className="text-sm text-text-sec">{T.locked}</p>
          <Button asChild variant="secondary" size="sm">
            <Link href={billingHref}>{T.lockedCta}</Link>
          </Button>
        </div>
      ) : (
        <div>
          {analysis ? (
            <div className="rounded-xl border border-border-subtle bg-bg-page p-3">
              <p className="eyebrow">{T.lastRun(UI_FMT.date(analysis.generatedAt, "dayMonthLong", { timeZone }))}</p>
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-text-main">{analysis.summary}</p>
            </div>
          ) : null}

          {running ? (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm text-text-sec">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              {T.running}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {analysis ? (
              <>
                <Button variant="primary" size="sm" onClick={() => setOpen(true)} disabled={running}>
                  {T.open}
                </Button>
                <Button variant="secondary" size="sm" onClick={run} disabled={running}>
                  <Sparkles className="h-4 w-4" aria-hidden />
                  {T.rerun}
                </Button>
              </>
            ) : (
              <Button variant="primary" size="sm" onClick={run} disabled={running}>
                <Sparkles className="h-4 w-4" aria-hidden />
                {T.run}
              </Button>
            )}
          </div>
        </div>
      )}

      {analysis ? (
        <ModalSurface
          open={open}
          onClose={() => setOpen(false)}
          title={T.modalTitle}
          size="lg"
          fullScreenOnMobile
          footer={
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {T.close}
              </Button>
            </div>
          }
        >
          <AnalysisBody analysis={analysis} onNavigate={() => setOpen(false)} />
        </ModalSurface>
      ) : null}
    </HomeSection>
  );
}

function AnalysisBody({ analysis, onNavigate }: { analysis: CabinetAnalysis; onNavigate: () => void }) {
  return (
    <div className="space-y-5" data-testid="cabinet-ai-analysis-body">
      <p className="text-sm leading-relaxed text-text-main">{analysis.summary}</p>

      {analysis.strengths.length > 0 ? (
        <div>
          <h3 className="eyebrow">{T.strengthsTitle}</h3>
          <ul className="mt-2 space-y-2">
            {analysis.strengths.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed text-text-main">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-text" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="eyebrow">{T.improvementsTitle}</h3>
        <ol className="mt-2 space-y-3">
          {analysis.improvements.map((item, index) => (
            <li key={`${index}-${item.title}`} className="rounded-xl border border-border-subtle bg-bg-page p-3">
              <p className="text-sm font-medium text-text-main">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-text-sec">{item.text}</p>
              {item.href ? (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {T.goTo}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-text-sec">{T.disclaimer}</p>
    </div>
  );
}
