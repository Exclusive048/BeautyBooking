import * as UI_TEXT from "@/lib/ui/text";

/**
 * «12 предложений» — число предложений моделям вместе с существительным.
 *
 * Одно правило склонения для `/models` и карточки «Для моделей» в футере.
 * Зовётся на СЕРВЕРЕ: футер передаёт клиентскому `FooterCTA` готовую строку,
 * иначе шелл каждой страницы вёз бы в браузер весь домен `models` ради трёх
 * форм слова (29.09 доработки · 18).
 */
export function formatModelOfferCount(count: number): string {
  const t = UI_TEXT.models.list;
  const mod10 = count % 10;
  const mod100 = count % 100;
  const template =
    mod10 === 1 && mod100 !== 11
      ? t.countLabelOne
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? t.countLabelFew
        : t.countLabelMany;
  return template.replace("{count}", String(count));
}
