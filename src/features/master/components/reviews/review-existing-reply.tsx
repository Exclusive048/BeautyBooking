import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import {
  formatRelativeDate,
  getInitials,
  pickAvatarColor,
} from "@/features/master/components/clients/lib/format";

const T = UI_TEXT.cabinetMaster.reviews.card;

type Props = {
  text: string;
  repliedAt: string;
  authorName: string;
  authorSeed: string;
  now: Date;
};

/**
 * Indented quote-style card showing the master's published reply. The
 * left border picks up the `bg-primary` accent so the visual hierarchy
 * — review on top, reply nested below — is unmistakable. Server-rendered;
 * mutations live in the sibling reply form.
 */
export function ReviewExistingReply({ text, repliedAt, authorName, authorSeed, now }: Props) {
  return (
    <div className="mt-4 ml-2 border-l-2 border-primary/30 pl-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
            pickAvatarColor(authorSeed)
          )}
          aria-hidden
        >
          {getInitials(authorName)}
        </span>
        <p className="text-xs text-text-sec">
          {T.replyByTemplate
            .replace("{name}", authorName)
            .replace("{when}", formatRelativeDate(repliedAt, now))}
        </p>
      </div>
      <p className="whitespace-pre-wrap text-sm text-text-main">{text}</p>
    </div>
  );
}
