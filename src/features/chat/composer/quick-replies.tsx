"use client";

import { Zap } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
import type { ChatPerspective } from "@/features/chat/types";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip-button";

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
        <ChipButton key={text} onClick={() => onPick(text)}>
          {text}
        </ChipButton>
      ))}
      <Button variant="wrapper"
        onClick={onHide}
        className="ml-auto text-[11px] text-text-sec transition hover:text-text-main"
      >
        {T.quickReplies.hide}
      </Button>
    </div>
  );
}
