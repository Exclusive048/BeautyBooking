import { AccountType } from "@/lib/prisma-enums";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.users.roleBadge;

const LABEL: Record<AccountType, string> = {
  [AccountType.CLIENT]: T.client,
  [AccountType.MASTER]: T.master,
  [AccountType.STUDIO]: T.studio,
  [AccountType.STUDIO_ADMIN]: T.studioAdmin,
  [AccountType.ADMIN]: T.admin,
  [AccountType.SUPERADMIN]: T.superadmin,
};

const TONE: Record<AccountType, string> = {
  [AccountType.CLIENT]: "bg-bg-input text-text-sec",
  [AccountType.MASTER]: "bg-success/[0.12] text-success-text",
  [AccountType.STUDIO]: "bg-info/[0.12] text-info-text",
  [AccountType.STUDIO_ADMIN]: "bg-info/[0.12] text-info-text",
  [AccountType.ADMIN]: "bg-primary/10 text-accent-text",
  [AccountType.SUPERADMIN]: "bg-primary/15 text-accent-text",
};

type Props = {
  role: AccountType;
  className?: string;
};

export function UserRoleBadge({ role, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent",
        TONE[role],
        className,
      )}
    >
      {LABEL[role]}
    </span>
  );
}
