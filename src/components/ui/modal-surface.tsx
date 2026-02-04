import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
};

export function ModalSurface({ open, onClose, title, children, className }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="close-modal"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <section
          className={cn(
            "w-full max-w-2xl rounded-[24px] border border-border-subtle bg-bg-card p-4 shadow-hover",
            className
          )}
        >
          {title ? <h3 className="text-base font-semibold text-text-main">{title}</h3> : null}
          <div className={title ? "mt-3" : undefined}>{children}</div>
        </section>
      </div>
    </div>
  );
}
