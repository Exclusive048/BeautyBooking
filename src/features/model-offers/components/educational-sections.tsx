import { FeatureGrid } from "@/features/marketing/sections/feature-grid";
import { TextWithImage } from "@/features/marketing/sections/text-with-image";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.models;

/**
 * Educational content explaining the model-offer exchange. Always rendered
 * for newcomers; collapsible for returning users via `<ModelsTopBlock>`.
 *
 * Pure server component — passed as `children` into the client orchestrator
 * so it stays out of the client bundle. The inner `<FeatureGrid>` and
 * `<TextWithImage>` are themselves client components, but they cross the
 * server→client boundary normally.
 */
export function EducationalSections() {
  return (
    <>
      <FeatureGrid
        eyebrow={T.howItWorks.eyebrow}
        title="Взаимный обмен — в чём суть"
        features={[
          {
            iconName: "users",
            title: "Мастер ищет модель",
            description:
              "Чтобы отработать новую технику, наработать портфолио или снять контент для соцсетей. Не реклама — реальная необходимость практики.",
          },
          {
            iconName: "tag",
            title: "Вы получаете скидку",
            description:
              "Размер скидки зависит от мастера и типа работы. Иногда — символическая стоимость материалов. Точную цену видно в каждом оффере.",
          },
          {
            iconName: "clock",
            title: "Закладывайте время",
            description:
              "Помимо самой услуги, мастеру нужно время на фото или дополнительные действия. Каждый оффер показывает суммарное время явно.",
          },
        ]}
      />

      <TextWithImage
        eyebrow={T.expectations.eyebrow}
        title={
          <>
            Что{" "}
            <em className="font-display font-normal italic text-primary">важно знать</em>
          </>
        }
        paragraphs={[
          "У каждого мастера свой опыт. Кто-то набирает портфолио после курсов, кто-то тестирует новую технику с многолетним стажем. Перед откликом откройте профиль мастера: посмотрите портфолио, отзывы, статус.",
          "Время может быть дольше обычного — мастер занимается практикой и может работать вдумчивее, плюс снимает фото или видео. В каждом оффере время указано в двух частях: услуга и контент.",
          "Результат может отличаться от профессиональной работы — особенно если мастер только начинает. Это часть обмена: вы пробуете услугу со скидкой, мастер получает опыт. Большинство моделей остаются довольны.",
        ]}
      />
    </>
  );
}
