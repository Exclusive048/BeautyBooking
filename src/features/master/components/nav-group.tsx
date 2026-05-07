import type { ReactNode } from "react";

type Props = {
  label: string;
  children: ReactNode;
  /** First group skips the top margin so the brand block hugs it cleanly. */
  first?: boolean;
};

/**
 * Sectioned nav heading used inside the master sidebar — pairs an uppercase
 * mono eyebrow with a stack of `<SidebarItem>`s. Pure presentational
 * component; active-state and badge logic stay on the items themselves.
 */
export function NavGroup({ label, children, first = false }: Props) {
  return (
    <section className={first ? "space-y-1" : "mt-6 space-y-1"}>
      <p className="px-3 pb-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-text-sec">
        {label}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}
