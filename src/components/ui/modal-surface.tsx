import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Centered modal with backdrop click-to-close.
 *
 * fix-02: the inner section now caps at `max-h-[90vh]` with
 * `overflow-y-auto` so tall content (e.g. the services modal with a
 * long description + multiple toggles) scrolls **inside** the modal
 * instead of pushing the top edge above the viewport. Before this
 * fix users couldn't reach the name/category fields on shorter
 * laptop screens.
 */
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
            "flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-border-subtle bg-bg-card p-4 shadow-hover",
            className,
          )}
        >
          {title ? (
            <h3 className="shrink-0 text-base font-semibold text-text-main">{title}</h3>
          ) : null}
          <div className={cn("min-h-0 flex-1 overflow-y-auto", title && "mt-3")}>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
