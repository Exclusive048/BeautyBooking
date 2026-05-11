import type {
  MasterAccountIdentity,
  MasterAccountSessions,
} from "@/lib/master/account-view.service";
import { DangerZoneCard } from "../account/danger-zone-card";
import { ConnectionsCard } from "../security/connections-card";
import { IdentityCard } from "../security/identity-card";
import { SessionsCard } from "../security/sessions-card";

type Props = {
  identity: MasterAccountIdentity;
  sessions: MasterAccountSessions;
};

/**
 * Security tab — identity (phone/email editable), connected accounts,
 * active sessions, and the danger-zone (delete account) section.
 *
 * fix-02: `<DangerZoneCard>` mounted here in addition to the
 * `account` tab. Users intuitively look for destructive actions
 * under «Безопасность», and the previous behaviour had it only on
 * the third tab — they thought it was missing. The same component
 * runs in both places; the underlying `/api/me/delete` flow is
 * single-source so there's no risk of divergence.
 */
export function SecurityTab({ identity, sessions }: Props) {
  return (
    <div className="space-y-4">
      <IdentityCard identity={identity} />
      <ConnectionsCard />
      <SessionsCard sessions={sessions} />
      <DangerZoneCard phone={identity.phone} />
    </div>
  );
}
