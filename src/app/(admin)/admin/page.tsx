import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <Section title="Админка" subtitle="Модерация мастеров, подписки, жалобы, категории." />
      <Card>
        <CardContent className="p-6 text-sm text-neutral-600">
          Тут будут таблицы: Providers, Bookings, Plans. В MVP можно включить ручное включение подписки.
        </CardContent>
      </Card>
    </div>
  );
}
