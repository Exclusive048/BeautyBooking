import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";

export default function ProviderServices() {
  return (
    <div className="space-y-6">
      <Section
        title="Услуги"
        subtitle="CRUD будет через модалку/страницу. Сейчас — заготовка."
        right={<Button>Добавить услугу</Button>}
      />
      <Card>
        <CardContent className="p-6 text-sm text-neutral-600">
          Тут будет таблица услуг (название, длительность, цена, активна/нет).
        </CardContent>
      </Card>
    </div>
  );
}
