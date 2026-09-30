"use client";

import { useId } from "react";

type Props = {
  /** Имя поля в форме — правдоподобное для бота (`company_url`). */
  name: string;
  value: string;
  onChange: (next: string) => void;
  /** Подпись для бота. Человеку поле не показывается и диктором не читается. */
  label: string;
};

/**
 * Ловушка для ботов (29.09 доработки · 22): поле, которое заполнит только бот.
 * Человек его не видит (вынесено за экран), до него не дотянуться с клавиатуры
 * (`tabIndex=-1`) и его не читает диктор (`aria-hidden`); автозаполнение
 * браузера выключено, чтобы оно не «заполнило» ловушку за человека.
 */
export function HoneypotField({ name, value, onChange, label }: Props) {
  const id = useId();
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
      />
    </div>
  );
}
