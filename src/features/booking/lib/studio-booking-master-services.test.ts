import { describe, expect, it } from "vitest";

import { servicesPerformedBy } from "@/features/booking/lib/studio-booking";

/**
 * Виджет студии в режиме «к мастеру» показывал ВСЕ услуги студии, хотя
 * подзаголовок обещает «Только то, что делает мастер»: выбор чужой услуги вёл в
 * шаг «Когда» без окошек. Найдено живой проверкой STUDIO-MASTER-PROFILES (этап 4):
 * у Марины с восемью услугами в списке стояли «Татуаж бровей» и «Балаяж».
 *
 * @probe 2026-09-27 — тело `servicesPerformedBy` заменено на `return services`
 * (прежнее поведение): краснеют «только услуги мастера» и «мастер без услуг —
 * пустой список». Возвращено — зелёный.
 */

const services = [
  { id: "manicure", name: "Маникюр классический" },
  { id: "pedicure", name: "Педикюр классический" },
  { id: "brows", name: "Татуаж бровей" },
];

describe("servicesPerformedBy", () => {
  it("только услуги мастера, в порядке списка студии", () => {
    const result = servicesPerformedBy(services, { serviceIds: ["pedicure", "manicure"] });
    expect(result.map((service) => service.id)).toEqual(["manicure", "pedicure"]);
  });

  it("мастер без услуг — пустой список, а не вся студия", () => {
    expect(servicesPerformedBy(services, { serviceIds: [] })).toEqual([]);
  });

  it("мастер не выбран — все услуги студии", () => {
    expect(servicesPerformedBy(services, null)).toEqual(services);
  });

  it("старый ответ без serviceIds — все услуги студии, как раньше", () => {
    expect(servicesPerformedBy(services, {})).toEqual(services);
  });
});
