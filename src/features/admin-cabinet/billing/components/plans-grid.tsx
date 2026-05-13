"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubscriptionScope } from "@prisma/client";
import { AnimatePresence, motion } from "framer-motion";
import { PlanCardView } from "@/features/admin-cabinet/billing/components/plan-card";
import {
  PlanEditDialog,
  type PlanEditValue,
} from "@/features/admin-cabinet/billing/components/plan-edit-dialog";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminPlanCard } from "@/features/admin-cabinet/billing/types";

const T = UI_TEXT.adminPanel.billing;

type Props = {
  plans: AdminPlanCard[];
};

type Toast = { kind: "success" | "error"; text: string } | null;

/** Layout: groups plans by scope ("Master" row, "Studio" row) and
 * renders each group as a 3-column grid on `lg`, dropping to 2/1
 * on smaller viewports. Edit dialog state lives here so a single
 * dialog instance handles all 6 cards. */
export function PlansGrid({ plans }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminPlanCard | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const masterPlans = plans.filter(
    (p) => p.scope === SubscriptionScope.MASTER,
  );
  const studioPlans = plans.filter(
    (p) => p.scope === SubscriptionScope.STUDIO,
  );

  const showToast = (text: string, kind: "success" | "error" = "success") => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 2400);
  };

  const handleSubmit = async (value: PlanEditValue) => {
    if (!editing) return;
    try {
      const res = await fetch(`/api/admin/billing/plans/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!res.ok) throw new Error("save failed");
      setEditing(null);
      showToast(T.toasts.planSaved);
      router.refresh();
    } catch {
      showToast(T.toasts.errorGeneric, "error");
    }
  };

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {toast ? (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "rounded-2xl border px-4 py-2.5 text-sm",
              toast.kind === "success"
                ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-red-300/40 bg-red-500/10 text-red-700 dark:text-red-300",
            )}
          >
            {toast.text}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <PlanGroup
        label={T.plans.sectionMaster}
        plans={masterPlans}
        onEdit={(plan) => setEditing(plan)}
      />
      <PlanGroup
        label={T.plans.sectionStudio}
        plans={studioPlans}
        onEdit={(plan) => setEditing(plan)}
      />

      <PlanEditDialog
        open={editing !== null}
        plan={editing}
        onClose={() => setEditing(null)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function PlanGroup({
  label,
  plans,
  onEdit,
}: {
  label: string;
  plans: AdminPlanCard[];
  onEdit: (plan: AdminPlanCard) => void;
}) {
  if (plans.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
        {label}
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {plans.map((plan) => (
          <PlanCardView key={plan.id} plan={plan} onEdit={() => onEdit(plan)} />
        ))}
      </div>
    </section>
  );
}
