"use client";

import type { FormEvent, RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  telegram: string;
  instagram: string;
  vk: string;
  addressSuggestions: string[];
  addressSuggestLoading: boolean;
  addressSuggestFocused: boolean;
  addressSuggestRootRef: RefObject<HTMLDivElement | null>;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDescriptionInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  descriptionRef: RefObject<HTMLTextAreaElement | null>;
  onAddressChange: (value: string) => void;
  onAddressFocus: () => void;
  onAddressSuggestionSelect: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onTelegramChange: (value: string) => void;
  onInstagramChange: (value: string) => void;
  onVkChange: (value: string) => void;
};

const inputClass =
  "border-transparent bg-bg-input/70 focus-visible:border-border-focus focus-visible:ring-0";

export function StudioProfileForm({
  name,
  description,
  address,
  phone,
  email,
  telegram,
  instagram,
  vk,
  addressSuggestions,
  addressSuggestLoading,
  addressSuggestFocused,
  addressSuggestRootRef,
  onNameChange,
  onDescriptionChange,
  onDescriptionInput,
  descriptionRef,
  onAddressChange,
  onAddressFocus,
  onAddressSuggestionSelect,
  onPhoneChange,
  onEmailChange,
  onTelegramChange,
  onInstagramChange,
  onVkChange,
}: Props) {
  return (
    <section className="lux-card rounded-[24px] p-5 md:p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Название</div>
            <Input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Название студии"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Описание</div>
            <Textarea
              ref={descriptionRef}
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              onInput={onDescriptionInput}
              placeholder="Расскажите о студии"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Адрес</div>
            <div className="relative" ref={addressSuggestRootRef}>
              <Textarea
                value={address}
                onChange={(event) => onAddressChange(event.target.value)}
                onFocus={onAddressFocus}
                placeholder="Город, улица, дом"
                className={inputClass}
                rows={2}
              />
              {addressSuggestFocused ? (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-border-subtle bg-bg-card shadow-sm">
                  {addressSuggestLoading ? (
                    <div className="px-3 py-2 text-xs text-text-sec">Ищем адрес...</div>
                  ) : addressSuggestions.length > 0 ? (
                    addressSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="block w-full border-b border-border-subtle px-3 py-2 text-left text-sm last:border-b-0 hover:bg-bg-input/80"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onAddressSuggestionSelect(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))
                  ) : address.trim().length >= 3 ? (
                    <div className="px-3 py-2 text-xs text-text-sec">Совпадений не найдено</div>
                  ) : (
                    <div className="px-3 py-2 text-xs text-text-sec">Введите минимум 3 символа</div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Телефон</div>
            <Input
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value)}
              placeholder="+7 700 000 00 00"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Email</div>
            <Input
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="studio@email.com"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Telegram</div>
            <Input
              value={telegram}
              onChange={(event) => onTelegramChange(event.target.value)}
              placeholder="@studio"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Instagram</div>
            <Input
              value={instagram}
              onChange={(event) => onInstagramChange(event.target.value)}
              placeholder="@studio"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">VK</div>
            <Input
              value={vk}
              onChange={(event) => onVkChange(event.target.value)}
              placeholder="vk.com/studio"
              className={inputClass}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
