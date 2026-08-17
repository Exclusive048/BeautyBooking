import { cn } from "@/lib/cn";
import { defaultUnlessOverridden } from "@/lib/ui/class-groups";
import React from "react";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "lux-card rounded-[24px] bg-bg-card",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 md:p-6", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // CN-CONFLICT-CLASS: вызывающий, задавший padding ВСЕХ сторон (`p-6`),
  // перебивался осевыми дефолтами — `.p-6` 5107 идёт раньше `.px-5` 5170 и
  // `.pb-5` 5320. Результат: сверху 1.5rem, по бокам и снизу 1.25rem, то есть
  // асимметрия, которую никто не заказывал (11 сайтов).
  // ⚠️ `p-5` в тех же 17 сайтах проигрывал ровно так же, но там значения
  // СОВПАДАЮТ (1.25rem), поэтому итог был верным — совпадением, а не по
  // построению. Такие сайты дефектом не считаются, но и опорой служить не
  // могут: смена дефолта на `px-6` сделала бы их асимметричными молча.
  // Осевые переопределения (`pt-5`, `px-6`) дефолт НЕ снимают — они конфликтуют
  // только по своей оси, и там побеждает вызывающий (замер: `.pt-*`/`.pl-*`
  // идут позже `.px-*`).
  return (
    <div
      className={cn(
        defaultUnlessOverridden(className, "padding-all", "px-5 pb-5 md:px-6 md:pb-6"),
        className
      )}
      {...props}
    />
  );
}
