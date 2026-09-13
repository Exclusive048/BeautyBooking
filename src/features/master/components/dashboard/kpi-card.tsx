import type { LucideIcon } from "lucide-react";
import { StatTile } from "@/components/ui/stat-tile";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel?: string;
};

/**
 * Плитка показателя дашборда — тонкая обёртка над общим `<StatTile>`.
 *
 * PWA-FIX-10: собственная разметка (иконка отдельной строкой + `mb-3`,
 * `p-4 lg:p-5`, значение `text-2xl lg:text-[28px]`) заменена на общий примитив.
 * Обёртка оставлена, а не удалена: у неё два потребителя — дашборд и расписание
 * мастера, — и они передают `icon`/`label`/`value`/`sublabel` позиционно
 * одинаково, так что точка замены одна.
 */
export function KpiCard({ icon, label, value, sublabel }: Props) {
  return <StatTile icon={icon} label={label} value={value} sublabel={sublabel} />;
}
