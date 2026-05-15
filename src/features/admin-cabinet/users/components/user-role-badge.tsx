import { AccountType } from "@prisma/client";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

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
  [AccountType.MASTER]: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  [AccountType.STUDIO]: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
  [AccountType.STUDIO_ADMIN]: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
  [AccountType.ADMIN]: "bg-primary/10 text-primary",
  [AccountType.SUPERADMIN]: "bg-primary/15 text-primary",
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
