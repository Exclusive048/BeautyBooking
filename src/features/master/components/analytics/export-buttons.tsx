import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.analytics.period;

/**
 * Excel + PDF export buttons — disabled placeholders in 30a; the real
 * server-side renderers ship later (BACKLOG). Title attribute carries
 * the tooltip "Доступно скоро" so the master sees an explanation when
 * they hover.
 */
export function ExportButtons() {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" disabled title={T.exportSoon} className="gap-1.5">
        <Download className="h-3.5 w-3.5" aria-hidden />
        {T.exportExcel}
      </Button>
      <Button variant="ghost" size="sm" disabled title={T.exportSoon} className="gap-1.5">
        <FileText className="h-3.5 w-3.5" aria-hidden />
        {T.exportPdf}
      </Button>
    </div>
  );
}
