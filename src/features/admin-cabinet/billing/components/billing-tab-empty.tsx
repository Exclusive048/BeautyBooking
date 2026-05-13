import { Inbox } from "lucide-react";

type Props = {
  title: string;
  hint: string;
};

export function BillingTabEmpty({ title, hint }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <Inbox className="mb-3 h-12 w-12 text-text-sec/40" aria-hidden />
      <p className="mb-1 font-display text-base text-text-main">{title}</p>
      <p className="max-w-xs text-sm text-text-sec">{hint}</p>
    </div>
  );
}
