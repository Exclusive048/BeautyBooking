import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";

export default function ProviderSchedule() {
  return (
    <div className="space-y-6">
      <Section
        title="Расписание"
        subtitle="Рабочие часы + исключения (отпуск/выходной)."
        right={<Button variant="secondary">Добавить исключение</Button>}
      />
      <Card>
        <CardContent className="p-6 text-sm text-neutral-600">
          Тут будет UI для часов по дням недели и time-off.
        </CardContent>
      </Card>
    </div>
  );
}
