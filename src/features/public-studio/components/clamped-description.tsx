"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.publicStudio.hero;

/**
 * Описание студии в шапке — первые пять строк; если текст длиннее, под ним
 * «Показать полностью» / «Свернуть». Переключатель появляется, только когда
 * текст действительно обрезан: наблюдатель размера меряет высоту после
 * переноса строк на текущей ширине.
 */
export function ClampedDescription({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);

  // Пока текст развёрнут, мерить нечего — «Свернуть» остаётся от прошлого замера.
  useEffect(() => {
    const node = ref.current;
    if (!node || expanded || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setClipped(node.scrollHeight > node.clientHeight + 1);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <div>
      <p
        ref={ref}
        className={cn("whitespace-pre-line text-sm leading-relaxed text-text-sec", !expanded && "line-clamp-5")}
      >
        {text}
      </p>
      {clipped ? (
        <Button
          variant="wrapper"
          size="none"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 rounded text-sm font-medium text-accent-text underline-offset-2 hover:underline"
        >
          {expanded ? T.descriptionCollapse : T.descriptionExpand}
        </Button>
      ) : null}
    </div>
  );
}
