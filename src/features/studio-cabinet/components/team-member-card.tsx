import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  name: string;
  specialty: string;
  statusLabel: string;
  statusTone?: "free" | "busy";
  shift: string;
  bookingsInfo: string;
  actionHref: string;
};

export function TeamMemberCard({
  name,
  specialty,
  statusLabel,
  statusTone = "free",
  shift,
  bookingsInfo,
  actionHref,
}: Props) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 shrink-0 rounded-2xl border border-border-subtle bg-bg-input" />
          <div>
            <div className="text-base font-semibold text-text-main">{name}</div>
            <div className="text-sm text-text-sec">{specialty}</div>
            <div
              className={
                statusTone === "busy"
                  ? "mt-2 text-sm text-red-500"
                  : "mt-2 text-sm text-emerald-600"
              }
            >
              {statusLabel}
            </div>
            <div className="mt-2 text-xs text-text-sec">🕒 {shift}</div>
            <div className="mt-1 text-xs text-text-sec">📅 {bookingsInfo}</div>
          </div>
        </div>
        <Button asChild variant="secondary" className="self-start md:self-center">
          <Link href={actionHref}>{UI_TEXT.studioCabinet.teamCard.viewSchedule}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
