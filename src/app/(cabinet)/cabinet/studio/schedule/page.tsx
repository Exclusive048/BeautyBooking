import { redirect } from "next/navigation";

/**
 * BACK-BUTTON-01: отдельной страницы «Расписание» у студии нет — расписание
 * студии живёт в календаре, а под `/schedule` лежат только «График команды» и
 * «Настройки расписания». Адрес раздела ведёт в календарь, а не в 404: по нему
 * уходила кнопка «Назад» с «Графика команды», и его естественно набрать руками.
 */
export default function StudioScheduleIndexRoute() {
  redirect("/cabinet/studio/calendar");
}
