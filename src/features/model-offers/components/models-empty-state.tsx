"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  isFiltered?: boolean;
  onClearFilter?: () => void;
};

export function ModelsEmptyState({ isFiltered = false }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-50 dark:bg-pink-950/40">
        <Sparkles className="h-8 w-8 text-pink-500" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">
        {UI_TEXT.pages.models.empty}
      </h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        {isFiltered
          ? UI_TEXT.pages.models.emptyFilteredHint
          : UI_TEXT.pages.models.emptyHint}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {isFiltered ? (
          <Link href="/models">
            <Button variant="secondary">{UI_TEXT.pages.models.filterAll}</Button>
          </Link>
        ) : null}
        <Link href="/catalog">
          <Button variant="primary">{UI_TEXT.pages.models.emptyCta}</Button>
        </Link>
      </div>
    </motion.div>
  );
}
