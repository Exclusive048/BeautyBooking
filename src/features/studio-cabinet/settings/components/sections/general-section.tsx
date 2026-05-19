import Link from "next/link";
import { ExternalLink, MapPin } from "lucide-react";
import { FocalImage } from "@/components/ui/focal-image";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioGeneralData } from "../../lib/types";
import { GeneralForm } from "../general-form";
import { SectionCard } from "../section-card";

const T = UI_TEXT.studioCabinet.settingsV2.general;

type Props = {
  data: StudioGeneralData;
};

/**
 * General section — editable name/tagline/description form +
 * read-only logo preview + read-only address with a Yandex Maps link.
 *
 * Logo + address editing are intentionally read-only here. Logo upload
 * requires the MediaAsset uploader (lives on the legacy profile page);
 * address editing requires the geocode + map picker (also legacy).
 * Both surfaced as backlog items so the studio settings rewrite ships
 * with honest scope instead of a half-built picker.
 */
export function GeneralSection({ data }: Props) {
  return (
    <div className="space-y-4">
      <SectionCard title={T.cardTitle} description={T.cardDesc}>
        <div className="flex items-start gap-3">
          {data.avatarUrl ? (
            <FocalImage
              src={data.avatarUrl}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-border-subtle"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-bg-input text-xs font-mono uppercase tracking-wider text-text-sec"
            >
              {data.name.slice(0, 2)}
            </span>
          )}
          <p className="text-[11px] text-text-sec">{T.logoHint}</p>
        </div>
        <GeneralForm data={data} />
      </SectionCard>

      <SectionCard title={T.addressTitle} description={T.addressDesc}>
        <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
              {T.cityLabel}
            </dt>
            <dd className="mt-0.5 text-text-main">{data.address.cityName ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
              {T.addressLabel}
            </dt>
            <dd className="mt-0.5 text-text-main">{data.address.address ?? "—"}</dd>
          </div>
          {data.address.district ? (
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
                {T.districtLabel}
              </dt>
              <dd className="mt-0.5 text-text-main">{data.address.district}</dd>
            </div>
          ) : null}
        </dl>
        {data.address.mapUrl ? (
          <Link
            href={data.address.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <MapPin className="h-4 w-4" aria-hidden />
            {T.openMap}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        ) : null}
        <p className="text-[11px] text-text-sec">{T.addressEditHint}</p>
      </SectionCard>
    </div>
  );
}
