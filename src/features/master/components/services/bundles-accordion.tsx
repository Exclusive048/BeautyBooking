import { ChevronRight, Package } from "lucide-react";
import type {
  MasterServicesViewData,
  ServicePackageView,
} from "@/lib/master/services-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { BundleRow } from "./bundle-row";

const T = UI_TEXT.cabinetMaster.servicesPage.bundlesAccordion;

type Props = {
  bundles: ServicePackageView[];
  allServices: MasterServicesViewData["allServicesFlat"];
};

export function BundlesAccordion({ bundles, allServices }: Props) {
  if (bundles.length === 0) return null;
  return (
    <details
      open
      className="group rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 transition-colors hover:bg-primary/10">
        <ChevronRight
          className="h-4 w-4 text-text-sec transition-transform group-open:rotate-90"
          aria-hidden
        />
        <Package className="h-4 w-4 text-primary" aria-hidden />
        <span className="flex-1 font-display text-base text-text-main">{T.heading}</span>
        <span className="font-mono text-xs text-text-sec">{bundles.length}</span>
      </summary>
      <ul className="space-y-2 px-3 pb-3 pt-1.5">
        {bundles.map((bundle) => (
          <li key={bundle.id}>
            <BundleRow bundle={bundle} allServices={allServices} />
          </li>
        ))}
      </ul>
    </details>
  );
}
