import * as UI_TEXT from "@/lib/ui/text";
import { PolicyForm } from "../policy-form";
import { SectionCard } from "../section-card";
import type { StudioPolicyData } from "../../lib/types";

const T = UI_TEXT.studioCabinet.settingsV2.policy;

type Props = {
  providerId: string;
  data: StudioPolicyData;
};

/**
 * Правила записи студии — РЕДАКТИРУЕМЫЕ (FIX-STUDIO-POLICY-EDITABLE).
 *
 * Было: read-only сводка со ссылкой «изменить в настройках расписания» на
 * `/cabinet/studio/calendar`. Редактора правил там нет, а без принятых мастеров
 * календарь пуст — значит правила студии были недостижимы вообще, и владелец
 * оставался с дефолтами, которые сам не выбирал. Правила принадлежат
 * провайдеру-студии, поэтому наличие команды к ним отношения не имеет.
 *
 * `lateCancelAction` остаётся информационным — штрафов платформа не выставляет
 * (известный пункт бэклога), но выбор сохраняется и виден клиенту.
 */
export function PolicySection({ providerId, data }: Props) {
  return (
    <div data-guide="rules" className="rounded-2xl">
      <SectionCard title={T.title} description={T.description}>
        <PolicyForm providerId={providerId} data={data} />
      </SectionCard>
    </div>
  );
}
