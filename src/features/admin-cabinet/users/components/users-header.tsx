import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  total: number;
};

const T = UI_TEXT.adminPanel.users.header;

/** Single-line caption «Пользователи · N всего». No right-side buttons
 * by ADMIN-USERS-A spec — create/export deliberately omitted. */
export function UsersHeader({ total }: Props) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-sec">
      <span>{T.captionRoot}</span>
      <span className="mx-1.5 text-text-sec/40" aria-hidden>
        ·
      </span>
      <span>
        <span className="tabular-nums text-text-main">{total}</span> {T.countsTotal}
      </span>
    </p>
  );
}
