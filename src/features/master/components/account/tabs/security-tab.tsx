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

/**
 * Security tab — identity (phone/email editable), connected accounts and
 * active sessions.
 *
 * CABINET-DELETE-SCOPE-01: карточки удаления здесь больше нет. fix-02 ставил
 * её сюда вторым экземпляром (рядом с вкладкой «Аккаунт»), когда она удаляла
 * аккаунт целиком. Теперь она удаляет кабинет мастера и живёт в одном месте —
 * на вкладке «Аккаунт», рядом с тарифом и ролями; два одинаковых
 * необратимых блока в одном кабинете только путали.
 */
export function SecurityTab({ identity, sessions }: Props) {
  return (
    <div className="space-y-4">
      <IdentityCard identity={identity} />
      <ConnectionsCard />
      <SessionsCard sessions={sessions} />
    </div>
  );
}
