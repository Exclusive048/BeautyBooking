import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { minutesToHuman, moneyRUB } from "@/lib/format";
import { ProviderService } from "../types";

export function ServicesList({
  services,
  pickedId,
  onPick,
}: {
  services: ProviderService[];
  pickedId?: string | null;
  onPick?: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {services.map((s) => {
        const active = pickedId === s.id;
        return (
          <Card key={s.id} className={active ? "border-neutral-900" : "hover:shadow-sm transition"}>
            <CardContent className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">{s.name}</div>
                  <div className="mt-1 text-xs text-neutral-500">{minutesToHuman(s.durationMin)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-neutral-900">{moneyRUB(s.price)}</div>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant={active ? "primary" : "secondary"}
                    onClick={() => onPick?.(s.id)}
                  >
                    {active ? "Выбрано" : "Выбрать"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
