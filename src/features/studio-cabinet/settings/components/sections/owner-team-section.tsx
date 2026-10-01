import { Crown, Shield } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
import { SectionCard } from "../section-card";
import type { StudioOwnerTeamData, StudioTeamMember } from "../../lib/types";
import { Badge } from "@/components/ui/badge";

const T = UI_TEXT.studioCabinet.settingsV2.ownerTeam;

type Props = {
  team: StudioOwnerTeamData;
};

/**
 * Owner & team — surfaces the studio OWNER and other ADMINs from
 * `StudioMembership`. Mastes (`StudioRole.MASTER`) are intentionally
 * NOT listed here: STUDIO-MASTERS-A owns the per-master roster page.
 *
 * Transfer ownership + invite admin are surfaced as backlog notes
 * because no platform mechanism exists for either yet — fabricating a
 * non-functional "Передать права" button would be dishonest.
 */
export function OwnerTeamSection({ team }: Props) {
  return (
    <div className="space-y-4">
      <SectionCard title={T.ownerTitle} description={T.ownerDesc}>
        {team.owner ? (
          <TeamRow member={team.owner} accent="owner" />
        ) : (
          <p className="text-sm text-text-sec">{T.ownerMissing}</p>
        )}
        <p className="text-2xs text-text-sec">{T.transferHint}</p>
      </SectionCard>

      <SectionCard title={T.teamTitle} description={T.teamDesc}>
        {team.admins.length === 0 ? (
          <p className="text-sm text-text-sec">{T.adminsEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {team.admins.map((admin) => (
              <li key={admin.userId}>
                <TeamRow member={admin} accent="admin" />
              </li>
            ))}
          </ul>
        )}
        <p className="text-2xs text-text-sec">{T.inviteHint}</p>
      </SectionCard>
    </div>
  );
}

function TeamRow({ member, accent }: { member: StudioTeamMember; accent: "owner" | "admin" }) {
  const Icon = accent === "owner" ? Crown : Shield;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-bg-input/30 p-3">
      <span
        aria-hidden
        className={
          accent === "owner"
            ? "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warning-surface text-warning-text"
            : "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-input text-text-sec"
        }
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-text-main">{member.displayName}</span>
          <Badge size="xs" variant={accent === "owner" ? "warning" : "info"}>
            {accent === "owner" ? T.roleOwner : T.roleAdmin}
          </Badge>
          {member.isCurrentUser ? (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-3xs uppercase tracking-wide text-accent-text">
              {T.youChip}
            </span>
          ) : null}
        </div>
        {member.phone || member.email ? (
          <p className="mt-0.5 truncate text-xs text-text-sec">
            {[member.phone, member.email].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
