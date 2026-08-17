"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { BubbleMeta } from "@/features/chat/chat-window/bubble-meta";
import { formatTimeHm } from "@/features/chat/lib/format-time";
import type { ThreadMessageDto } from "@/features/chat/types";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  message: ThreadMessageDto;
  isMine: boolean;
  viewerTimezone: string;
};

function AttachmentImage({
  url,
  className,
  alt,
}: {
  url: string;
  className: string;
  /** UI-33: ссылка-обёртка своего текста не имеет — имя ей даёт эта строка. */
  alt: string;
}) {
  // MASTER-CHAT-ATTACHMENT-FIX-A:
  //   - Track load + error so the bubble never collapses to the
  //     `<img>`-broken-icon-as-thin-strip state (this was the «полоска»
  //     bug — before the ACL fix the route returned 403, and the
  //     `w-full max-h-[320px]` img with no min-height shrank to the
  //     ~24px alt-text strip).
  //   - On error: explicit fallback tile (icon + label) with the same
  //     framed dimensions — the user sees "не удалось загрузить" instead
  //     of a confusing strip.
  //   - On load: skeleton placeholder (bg-bg-input/40 at min-height
  //     200px) keeps layout stable while bytes stream.
  //   - `aspect-[4/3]` + `min-h-[200px]` reserves vertical space so even
  //     stale tokens or transient network errors don't degrade to a
  //     thin strip.
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  /**
   * FIX-C3 · item 3 — почему причина выясняется ВТОРЫМ запросом.
   *
   * Маршрут отдаёт БАЙТЫ, и добраться до него можно только `<img src>`
   * (`next/image` переписал бы URL через оптимизатор и потерял токен). У
   * `onError` элемента `<img>` нет ни статуса, ни тела: «доступа нет», «файла
   * нет» и «ссылка устарела» приходят в обработчик неразличимыми — это и есть
   * дефект. Поэтому в момент отказа — и только тогда — тот же URL
   * запрашивается `fetch`'ем, у которого конверт виден.
   *
   * Цена: один запрос на СБОЙНОЕ вложение. Успешный путь не трогается вовсе.
   *
   * Публичные картинки этого не получают намеренно: там различать нечего
   * («нет файла» — единственный исход), и `ResilientImage` уже показывает
   * плейсхолдер. Второй механизм ради одинакового исхода был бы лишним.
   */
  const [reason, setReason] = useState<string | null>(null);

  async function explainFailure() {
    setErrored(true);
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return; // гонка: байты доехали — сообщение не нужно
      const json = (await res.json().catch(() => null)) as
        | { ok: false; error?: { message?: string } }
        | null;
      const serverMessage = json && json.ok === false ? json.error?.message : null;
      if (serverMessage) setReason(serverMessage);
      else if (res.status === 403) setReason(UI_TEXT.chat.composer.attachmentNoAccess);
    } catch {
      // Сеть недоступна — остаётся общая строка, она здесь и верна.
    }
  }

  if (errored) {
    return (
      <div
        className={cn(
          className,
          "flex aspect-[4/3] min-h-[200px] w-full flex-col items-center justify-center gap-2 bg-bg-input/40 px-4 text-center text-text-sec",
        )}
      >
        <ImageOff className="h-6 w-6" aria-hidden />
        <span className="text-xs">{reason ?? UI_TEXT.chat.composer.attachmentLoadFailed}</span>
      </div>
    );
  }

  return (
    <div className={cn(className, "relative aspect-[4/3] min-h-[200px] w-full bg-bg-input/40")}>
      {/* Plain <img> intentional — the chat-attachment delivery route
          streams bytes via cookie-auth + token. next/image would
          rewrite the URL through the optimisation pipeline and lose
          our token. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className={cn(
          "absolute inset-0 block h-full w-full object-cover transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
        )}
        onLoad={() => setLoaded(true)}
        onError={() => void explainFailure()}
      />
    </div>
  );
}

export function MessageBubble({ message, isMine, viewerTimezone }: Props) {
  const hasBody = message.body.trim().length > 0;
  const attachmentUrl = message.attachmentUrl;
  const hasAttachment = Boolean(attachmentUrl);
  return (
    <div className={cn("max-w-[520px]", isMine ? "self-end" : "self-start")}>
      {hasAttachment && attachmentUrl ? (
        <a
          href={attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "block overflow-hidden",
            hasBody ? "rounded-t-[16px]" : "rounded-[16px]",
            isMine ? "rounded-bl-[16px]" : "rounded-br-[16px]",
            isMine && !hasBody ? "rounded-br-[4px]" : "",
            !isMine && !hasBody ? "rounded-bl-[4px]" : "",
            "border border-border-subtle bg-bg-input/40",
          )}
        >
          <AttachmentImage
            url={attachmentUrl}
            className=""
            alt={
              isMine
                ? UI_TEXT.chat.composer.attachmentAltOwn
                : UI_TEXT.chat.composer.attachmentAltTemplate.replace(
                    "{name}",
                    message.senderName
                  )
            }
          />
        </a>
      ) : null}
      {hasBody ? (
        <div
          className={cn(
            "px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words",
            isMine
              ? "bg-brand-gradient text-white shadow-sm"
              : "bg-bg-card text-text-main border border-border-subtle",
            // Adjust corners when attachment is on top: the bubble's
            // top corners go flush with the image; bottom corners
            // keep the speech-bubble tail.
            hasAttachment
              ? isMine
                ? "rounded-b-[16px] rounded-tl-[16px] rounded-tr-[4px]"
                : "rounded-b-[16px] rounded-tr-[16px] rounded-tl-[4px]"
              : isMine
              ? "rounded-[16px_16px_4px_16px]"
              : "rounded-[16px_16px_16px_4px]",
          )}
        >
          {message.body}
        </div>
      ) : null}
      <BubbleMeta
        time={formatTimeHm(new Date(message.createdAt), viewerTimezone)}
        isMine={isMine}
        isRead={Boolean(message.readAt)}
      />
    </div>
  );
}
