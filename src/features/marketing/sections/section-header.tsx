import type { ReactNode } from "react";

type Props = {
  /** Tiny uppercased label above the title — keeps brand language consistent with the homepage. */
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  align?: "left" | "center";
};

/**
 * Shared eyebrow + h2 + description block used across marketing sections.
 * Eyebrow style mirrors the homepage hero: font-mono uppercase tracking-[0.18em] text-primary.
 */
export function SectionHeader({ eyebrow, title, description, align = "left" }: Props) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow ? (
        <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-display text-3xl leading-tight text-text-main lg:text-4xl">{title}</h2>
      {description ? (
        <p className="mt-4 text-lg leading-relaxed text-text-sec">{description}</p>
      ) : null}
    </div>
  );
}
