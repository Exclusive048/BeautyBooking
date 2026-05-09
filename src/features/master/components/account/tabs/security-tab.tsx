import type {
  MasterAccountIdentity,
  MasterAccountSessions,
} from "@/lib/master/account-view.service";
import { ConnectionsCard } from "../security/connections-card";
import { IdentityCard } from "../security/identity-card";
import { SessionsCard } from "../security/sessions-card";

type Props = {
  identity: MasterAccountIdentity;
  sessions: MasterAccountSessions;
};

export function SecurityTab({ identity, sessions }: Props) {
  return (
    <div className="space-y-4">
      <IdentityCard identity={identity} />
      <ConnectionsCard />
      <SessionsCard sessions={sessions} />
    </div>
  );
}
