"use client";

import { Zap } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import type { ChatPerspective } from "@/features/chat/types";

const T = UI_TEXT.chat;

type Props = {
  perspective: ChatPerspective;
  onPick: (text: string) => void;
  onHide: () => void;
};

export function QuickReplies({ perspective, onPick, onHide }: Props) {
  const replies =
    perspective === "master" ? T.quickReplies.master : T.quickReplies.client;
  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-wider text-text-sec">
        <Zap className="h-3 w-3" aria-hidden strokeWidth={1.8} />
        {T.quickReplies.eyebrow}
      </span>
      {replies.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onPick(text)}
          className="rounded-full border border-border-subtle bg-bg-input/70 px-2.5 py-1 text-xs text-text-main transition hover:border-primary hover:bg-bg-card"
        >
          {text}
        </button>
      ))}
      <button
        type="button"
        onClick={onHide}
        className="ml-auto text-[11px] text-text-sec transition hover:text-text-main"
      >
        {T.quickReplies.hide}
      </button>
    </div>
  );
}
