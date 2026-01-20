import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";

const mock = [
  { id: "b1", time: "Сегодня 12:00", client: "Алия", service: "Коррекция бровей", status: "NEW" },
  { id: "b2", time: "Сегодня 16:00", client: "Диана", service: "Ламинирование", status: "CONFIRMED" },
];

export default function ProviderBookings() {
  return (
    <div className="space-y-6">
      <Section title="Записи" subtitle="В MVP: статичный список, дальше подключим статусы/фильтры." />
      <div className="space-y-3">
        {mock.map((b) => (
          <Card key={b.id}>
            <CardContent className="p-5 md:p-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-900">{b.time} · {b.client}</div>
                <div className="mt-1 text-xs text-neutral-500">{b.service} · статус: {b.status}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary">Отменить</Button>
                <Button size="sm">Подтвердить</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
