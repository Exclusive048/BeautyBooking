"use client";

import { Check, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { CityTagBadge } from "@/features/admin-cabinet/cities/components/city-tag-badge";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminDuplicateGroup } from "@/features/admin-cabinet/cities/types";

const T = UI_TEXT.adminPanel.cities.duplicateGroupsModal;

type Props = {
  open: boolean;
  groups: AdminDuplicateGroup[];
  onClose: () => void;
  /** Called with `{sourceCityId, targetCityId}` when admin clicks
   * "Слить с каноничным" on a non-canonical group member. */
  onPickPair: (sourceCityId: string, targetCityId: string) => void;
};

export function DuplicateGroupsModal({
  open,
  groups,
  onClose,
  onPickPair,
}: Props) {
  return (
    <ModalSurface open={open} onClose={onClose} title={T.title}>
      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-sec">{T.empty}</p>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {groups.map((group) => {
            const canonical = group.cities.find((c) => c.isCanonical);
            return (
              <section
                key={group.groupId}
                className="rounded-2xl border border-border-subtle bg-bg-card p-4"
              >
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
                  {group.reason === "normalize"
                    ? T.reasonNormalize
                    : T.reasonGeo}
                </p>
                <ul className="flex flex-col gap-2">
                  {group.cities.map((c) => (
                    <li
                      key={c.id}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border p-3",
                        c.isCanonical
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : "border-border-subtle bg-bg-input/40",
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <CityTagBadge tag={c.tag} isDuplicate />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-medium text-text-main">
                            <span className="truncate">{c.name}</span>
                            {c.isCanonical ? (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
                                <Check className="h-2.5 w-2.5" aria-hidden />
                                {T.canonicalBadge}
                              </span>
                            ) : null}
                          </p>
                          <p className="font-mono text-[11px] text-text-sec">
                            {c.mastersCount} мастеров · {c.studiosCount} студий
                          </p>
                        </div>
                      </div>
                      {!c.isCanonical && canonical ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onPickPair(c.id, canonical.id)}
                        >
                          <GitMerge className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          {T.mergeIntoCanonical}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </ModalSurface>
  );
}
