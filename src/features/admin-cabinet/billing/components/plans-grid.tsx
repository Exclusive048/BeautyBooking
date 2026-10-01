"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubscriptionScope } from "@/lib/prisma-enums";
import { PlanCardView } from "@/features/admin-cabinet/billing/components/plan-card";
import {
  PlanEditDialog,
  type PlanEditValue,
} from "@/features/admin-cabinet/billing/components/plan-edit-dialog";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  AdminPlanCard,
  AdminPlanInheritanceCandidate,
} from "@/features/admin-cabinet/billing/types";
import { useToast } from "@/components/ui/toast";

const T = UI_TEXT.adminPanel.billing;

type Props = {
  plans: AdminPlanCard[];
  /** All plans (light shape) — passed through to the edit dialog
   * for inheritance resolution. */
  candidates: AdminPlanInheritanceCandidate[];
};

/** Layout: groups plans by scope ("Master" row, "Studio" row) and
 * renders each group as a 3-column grid on `lg`, dropping to 2/1
 * on smaller viewports. Edit dialog state lives here so a single
 * dialog instance handles all 6 cards. */
export function PlansGrid({ plans, candidates }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminPlanCard | null>(null);
  const toast = useToast();

  const masterPlans = plans.filter(
    (p) => p.scope === SubscriptionScope.MASTER,
  );
  const studioPlans = plans.filter(
    (p) => p.scope === SubscriptionScope.STUDIO,
  );

  const handleSubmit = async (value: PlanEditValue) => {
    if (!editing) return;
    try {
      await fetchJsonWithAuth<unknown>(`/api/admin/billing/plans/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      setEditing(null);
      toast.success(T.toasts.planSaved);
      router.refresh();
    } catch (error) {
      toast.error(serverMessageOr(error, T.toasts.errorGeneric));
    }
  };

  return (
    <div className="space-y-4">
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
        candidates={candidates}
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
      <h2 className="mb-3 font-mono text-3xs uppercase tracking-[0.12em] text-text-sec">
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
